import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { LocalSiteConfig, WpCliResult } from '../types.js';
import {
  getLocalDataDir,
  getPhpBinDir,
  getMysqlBinDir,
  getRunDataDir,
  getWebRoot,
} from './local-detector.js';

const MAX_BUFFER = 1024 * 1024; // 1MB
const DEFAULT_TIMEOUT = 30_000; // 30 seconds
const MAX_OUTPUT_CHARS = 25_000;

// WP-CLI phar location inside Local.app bundle
const WP_CLI_PHAR_PATHS = [
  '/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/wp-cli.phar',
  // Linux fallback
  path.join(os.homedir(), '.local', 'share', 'Local', 'resources', 'extraResources', 'bin', 'wp-cli', 'wp-cli.phar'),
];

// Commands that are always safe (read-only)
const SAFE_COMMANDS = new Set([
  'core version', 'core is-installed', 'core check-update',
  'option get', 'option list',
  'plugin list', 'plugin status', 'plugin get', 'plugin path', 'plugin search',
  'theme list', 'theme status', 'theme get', 'theme path', 'theme search',
  'user list', 'user get',
  'post list', 'post get',
  'term list', 'term get',
  'comment list', 'comment get',
  'menu list', 'menu item list',
  'config get', 'config list', 'config path', 'config has',
  'db tables', 'db size', 'db columns',
  'widget list',
  'sidebar list',
  'cron event list', 'cron schedule list',
  'cap list',
  'role list',
  'rewrite list',
  'site list',
  'transient list', 'transient get',
  'cache type',
  'server',
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
    ...process.env,
    PATH: [phpBinDir, mysqlBinDir, process.env.PATH].join(':'),
    PHPRC: path.join(runDataDir, 'conf', 'php'),
  };
}

async function resolvePhpBin(site: LocalSiteConfig): Promise<string> {
  const phpBinDir = await getPhpBinDir(site);
  return path.join(phpBinDir, 'php');
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

function isCommandAllowed(command: string, allowWrites: boolean): { allowed: boolean; reason?: string } {
  const normalized = normalizeCommand(command);
  const parts = normalized.split(' ');

  // Check blocked commands
  if (BLOCKED_COMMANDS.has(parts[0])) {
    return { allowed: false, reason: `Command "${parts[0]}" is blocked for security (arbitrary code execution).` };
  }
  if (parts.length >= 1 && BLOCKED_COMMANDS.has(parts[0])) {
    return { allowed: false, reason: `Command "${parts[0]}" is blocked for security.` };
  }

  // Check if it's a known safe command
  const twoPartCmd = parts.slice(0, 2).join(' ');
  if (SAFE_COMMANDS.has(twoPartCmd) || SAFE_COMMANDS.has(parts[0])) {
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

function truncateOutput(output: string): string {
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

  return new Promise<WpCliResult>((resolve, reject) => {
    const startTime = Date.now();
    const child = spawn(phpBin, allArgs, {
      cwd: webRoot,
      env,
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
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
