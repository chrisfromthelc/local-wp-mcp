import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { LocalSiteConfig, WpCliResult } from '../types.js';
import {
  getPhpBinDir,
  getMysqlBinDir,
  getRunDataDir,
  getWebRoot,
} from './local-detector.js';

const MAX_BUFFER = 1024 * 1024; // 1MB
const DEFAULT_TIMEOUT = 30_000; // 30 seconds
const MAX_OUTPUT_CHARS = 25_000;

// Flags that must never appear in the user-supplied `args` array.
// These can achieve arbitrary code execution or bypass the command allowlist.
const BLOCKED_FLAGS = new Set([
  '--require',
  '--exec',
  '--skip-plugins',
  '--skip-themes',
]);

// WP-CLI phar location inside Local.app bundle
const WP_CLI_PHAR_PATHS = [
  '/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/wp-cli.phar',
  // Linux fallback
  path.join(os.homedir(), '.local', 'share', 'Local', 'resources', 'extraResources', 'bin', 'wp-cli', 'wp-cli.phar'),
];

// Subcommand verbs that are inherently read-only.
// If ANY command (core or plugin) ends with one of these as the action verb,
// it's allowed without WPCLI_ALLOW_WRITES. This lets plugin commands like
// `wc product list` or `yoast index --dry-run` work automatically.
export const READ_ONLY_SUBCOMMANDS = new Set([
  'list', 'get', 'search', 'check', 'status', 'path', 'info', 'version',
  'is-installed', 'check-update', 'pluck', 'has',
]);

// Commands that are always safe (read-only)
// Matched against the first 1, 2, or 3 space-separated parts of the command.
// This set is checked BEFORE the read-only subcommand pattern, so explicit
// entries here take priority.
const SAFE_COMMANDS = new Set([
  // Single-word
  'help',

  // Core
  'core version', 'core is-installed', 'core check-update',

  // Options
  'option get', 'option list', 'option pluck',

  // Plugins
  'plugin list', 'plugin status', 'plugin get', 'plugin path', 'plugin search',

  // Themes
  'theme list', 'theme status', 'theme get', 'theme path', 'theme search',

  // Users
  'user list', 'user get',
  'user meta list', 'user meta get',

  // Posts
  'post list', 'post get',
  'post meta list', 'post meta get',

  // Post types (hyphenated — still two-part when split by space)
  'post-type list', 'post-type get',

  // Taxonomies & Terms
  'taxonomy list', 'taxonomy get',
  'term list', 'term get',
  'term meta list', 'term meta get',

  // Comments
  'comment list', 'comment get',
  'comment meta list', 'comment meta get',

  // Media
  'media list',

  // Menus (menu item = 3-part)
  'menu list',
  'menu item list',

  // Config
  'config get', 'config list', 'config path', 'config has',

  // Database (read-only inspection)
  'db tables', 'db size', 'db columns', 'db check', 'db prefix',

  // Widgets & Sidebars
  'widget list',
  'sidebar list',

  // Cron (3-part)
  'cron event list',
  'cron schedule list',

  // Capabilities & Roles
  'cap list',
  'role list',

  // Rewrites
  'rewrite list',

  // Multisite
  'site list',
  'site meta list', 'site meta get',
  'network meta list', 'network meta get',
  'super-admin list',

  // Transients & Cache
  'transient list', 'transient get',
  'cache type',

  // Languages (3-part)
  'language core list',
  'language plugin list',
  'language theme list',

  // WP-CLI packages
  'package list',

  // Maintenance mode (read-only status check)
  'maintenance-mode status',

  // CLI info
  'cli version', 'cli info',
]);

// Commands that are always blocked (arbitrary code execution)
const BLOCKED_COMMANDS = new Set([
  'eval', 'eval-file', 'shell',
]);

export async function findWpCliPhar(): Promise<string> {
  for (const pharPath of WP_CLI_PHAR_PATHS) {
    try {
      await fs.access(pharPath);
      return pharPath;
    } catch {
      // try next
    }
  }
  throw new Error(
    'WP-CLI phar not found. Checked:\n' +
    WP_CLI_PHAR_PATHS.map((p) => `  - ${p}`).join('\n') +
    '\nIs Local by Flywheel installed?'
  );
}

async function buildEnvironment(site: LocalSiteConfig): Promise<NodeJS.ProcessEnv> {
  const runDataDir = getRunDataDir(site);
  const phpBinDir = await getPhpBinDir(site);
  const mysqlBinDir = await getMysqlBinDir(site);

  return {
    PATH: [phpBinDir, mysqlBinDir, process.env.PATH].join(path.delimiter),
    PHPRC: path.join(runDataDir, 'conf', 'php'),
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG,
  };
}

async function resolvePhpBin(site: LocalSiteConfig): Promise<string> {
  const phpBinDir = await getPhpBinDir(site);
  return path.join(phpBinDir, 'php');
}

export function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

// Parse WPCLI_SAFE_COMMANDS env var into a set.
// Accepts comma-separated commands, e.g. "wc product list,wc order list"
// Cached after first call since env vars don't change at runtime.
let _customSafeCache: Set<string> | null = null;
let _customSafeCacheKey: string | undefined;

export function getCustomSafeCommands(): Set<string> {
  const raw = process.env.WPCLI_SAFE_COMMANDS;
  if (raw === _customSafeCacheKey && _customSafeCache) return _customSafeCache;
  _customSafeCacheKey = raw;
  if (!raw) {
    _customSafeCache = new Set();
    return _customSafeCache;
  }
  _customSafeCache = new Set(
    raw.split(',').map((s) => s.trim()).filter(Boolean)
  );
  return _customSafeCache;
}

/**
 * Determine the "action verb" (subcommand) from a WP-CLI command.
 * For `wc product list --field=name`, this returns `list`.
 * For `post meta get 42 _key`, this returns `get`.
 *
 * WP-CLI commands follow the pattern:
 *   <top-command> [<sub>] [<sub>] <action> [positional-args] [--flags]
 *
 * The action verb is always in positions 1–3 (the command prefix, not
 * positional arguments). We scan these positions for a known read-only
 * subcommand verb.
 */
export function getActionVerb(parts: string[]): string | undefined {
  // Check positions 1–3 for the action verb (position 0 is the top-level command).
  // Covers: `plugin list`, `post meta list`, `wc product variation list`
  for (let i = 1; i <= 3 && i < parts.length; i++) {
    if (parts[i].startsWith('-')) break; // flags signal end of command prefix
    if (READ_ONLY_SUBCOMMANDS.has(parts[i])) return parts[i];
  }
  return undefined;
}

/**
 * Validate that user-supplied args don't contain blocked flags.
 * Flags like --require can load arbitrary PHP files, bypassing the allowlist.
 */
export function validateArgs(args: string[]): { valid: boolean; reason?: string } {
  for (const arg of args) {
    // Match both --flag=value and --flag value forms
    const flagName = arg.split('=')[0].toLowerCase();
    if (BLOCKED_FLAGS.has(flagName)) {
      return {
        valid: false,
        reason: `Flag "${flagName}" is blocked for security (can bypass command restrictions).`,
      };
    }
  }
  return { valid: true };
}

// Shell metacharacters that must never appear in WP-CLI commands.
// spawn() doesn't use a shell, but this is defense-in-depth in case
// the execution path ever changes or the command leaks to a shell context.
const SHELL_META_PATTERN = /[;&|`$(){}[\]<>!\\]/;

export function isCommandAllowed(command: string, allowWrites: boolean): { allowed: boolean; reason?: string } {
  const normalized = normalizeCommand(command);

  // Defense-in-depth: reject shell metacharacters
  if (SHELL_META_PATTERN.test(normalized)) {
    return { allowed: false, reason: 'Command contains shell metacharacters which are not allowed.' };
  }

  const parts = normalized.split(' ');

  // Check blocked commands (first part only)
  if (BLOCKED_COMMANDS.has(parts[0])) {
    return { allowed: false, reason: `Command "${parts[0]}" is blocked for security (arbitrary code execution).` };
  }

  // Check if it's a known safe command (3-part, 2-part, then 1-part)
  const threePartCmd = parts.slice(0, 3).join(' ');
  const twoPartCmd = parts.slice(0, 2).join(' ');
  if (SAFE_COMMANDS.has(threePartCmd) || SAFE_COMMANDS.has(twoPartCmd) || SAFE_COMMANDS.has(parts[0])) {
    return { allowed: true };
  }

  // Check custom safe commands from WPCLI_SAFE_COMMANDS env var
  const customSafe = getCustomSafeCommands();
  if (customSafe.has(threePartCmd) || customSafe.has(twoPartCmd) || customSafe.has(parts[0])) {
    return { allowed: true };
  }

  // Check read-only subcommand pattern — allows plugin commands like
  // `wc product list` or `acf field get` without needing writes enabled
  const verb = getActionVerb(parts);
  if (verb && READ_ONLY_SUBCOMMANDS.has(verb)) {
    return { allowed: true };
  }

  // For write operations, check the flag
  if (!allowWrites) {
    return {
      allowed: false,
      reason: `Command "${twoPartCmd}" may modify data. Set WPCLI_ALLOW_WRITES=true to enable write operations.`,
    };
  }

  return { allowed: true };
}

export function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  return output.slice(0, MAX_OUTPUT_CHARS) + `\n\n... [truncated, ${output.length - MAX_OUTPUT_CHARS} chars omitted]`;
}

export async function executeWpCli(
  command: string,
  site: LocalSiteConfig,
  options?: {
    args?: string[];
    format?: string;
    timeout?: number;
  }
): Promise<WpCliResult> {
  const allowWrites = process.env.WPCLI_ALLOW_WRITES === 'true';
  const check = isCommandAllowed(command, allowWrites);
  if (!check.allowed) {
    return { stdout: '', stderr: check.reason!, exitCode: 1 };
  }

  // Validate user-supplied args for blocked flags
  if (options?.args) {
    const argsCheck = validateArgs(options.args);
    if (!argsCheck.valid) {
      return { stdout: '', stderr: argsCheck.reason!, exitCode: 1 };
    }
  }

  const phpBin = await resolvePhpBin(site);
  const wpCliPhar = await findWpCliPhar();
  const webRoot = getWebRoot(site);
  const env = await buildEnvironment(site);

  const cmdParts = command.trim().split(/\s+/);
  const allArgs = [
    wpCliPhar,
    `--path=${webRoot}`,
    ...cmdParts,
    ...(options?.args || []),
    '--no-color',
  ];

  if (options?.format) {
    allArgs.push(`--format=${options.format}`);
  }

  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  return new Promise<WpCliResult>((resolve) => {
    const startTime = Date.now();
    const child = spawn(phpBin, allArgs, {
      cwd: webRoot,
      env,
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let stderrSize = 0;

    child.stdout.on('data', (data: Buffer) => {
      stdoutSize += data.length;
      if (stdoutSize <= MAX_BUFFER) {
        stdout += data.toString();
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderrSize += data.length;
      if (stderrSize <= MAX_BUFFER) {
        stderr += data.toString();
      }
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      // Log to stderr for audit
      console.error(`[wp-cli] command="${command}" exit=${code} duration=${duration}ms`);
      resolve({
        stdout: truncateOutput(stdout.trim()),
        stderr: truncateOutput(stderr.trim()),
        exitCode: code ?? 1,
      });
    });

    child.on('error', (err) => {
      console.error(`[wp-cli] spawn error: ${err.message}`);
      resolve({
        stdout: '',
        stderr: `Failed to execute WP-CLI: ${err.message}`,
        exitCode: 1,
      });
    });
  });
}
