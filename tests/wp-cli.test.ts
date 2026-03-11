import { describe, it, expect, afterEach } from 'vitest';
import { isCommandAllowed, normalizeCommand, truncateOutput, getActionVerb, getCustomSafeCommands, validateArgs } from '../src/services/wp-cli.js';

// ── normalizeCommand ──────────────────────────────────────────────

describe('normalizeCommand', () => {
  it('trims whitespace', () => {
    expect(normalizeCommand('  plugin list  ')).toBe('plugin list');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeCommand('post   meta   list')).toBe('post meta list');
  });

  it('handles tabs and newlines', () => {
    expect(normalizeCommand('plugin\tlist\n')).toBe('plugin list');
  });
});

// ── truncateOutput ────────────────────────────────────────────────

describe('truncateOutput', () => {
  it('returns short output unchanged', () => {
    expect(truncateOutput('hello')).toBe('hello');
  });

  it('truncates long output with indicator', () => {
    const long = 'x'.repeat(30_000);
    const result = truncateOutput(long);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain('truncated');
    expect(result).toContain('5000 chars omitted');
  });

  it('returns exactly MAX_OUTPUT_CHARS content unchanged', () => {
    const exact = 'x'.repeat(25_000);
    expect(truncateOutput(exact)).toBe(exact);
  });
});

// ── isCommandAllowed: SAFE_COMMANDS ───────────────────────────────

describe('isCommandAllowed — safe (read-only) commands', () => {
  // Two-part commands
  const safeTwoPart = [
    'core version', 'core is-installed', 'core check-update',
    'option get', 'option list', 'option pluck',
    'plugin list', 'plugin status', 'plugin get', 'plugin path', 'plugin search',
    'theme list', 'theme status', 'theme get', 'theme path', 'theme search',
    'user list', 'user get',
    'post list', 'post get',
    'post-type list', 'post-type get',
    'taxonomy list', 'taxonomy get',
    'term list', 'term get',
    'comment list', 'comment get',
    'media list',
    'menu list',
    'config get', 'config list', 'config path', 'config has',
    'db tables', 'db size', 'db columns', 'db check', 'db prefix',
    'widget list',
    'sidebar list',
    'cap list',
    'role list',
    'rewrite list',
    'site list',
    'super-admin list',
    'transient list', 'transient get',
    'cache type',
    'package list',
    'maintenance-mode status',
    'cli version', 'cli info',
  ];

  for (const cmd of safeTwoPart) {
    it(`allows "${cmd}" without writes enabled`, () => {
      expect(isCommandAllowed(cmd, false)).toEqual({ allowed: true });
    });
  }

  // Three-part commands
  const safeThreePart = [
    'user meta list', 'user meta get',
    'post meta list', 'post meta get',
    'term meta list', 'term meta get',
    'comment meta list', 'comment meta get',
    'site meta list', 'site meta get',
    'network meta list', 'network meta get',
    'menu item list',
    'cron event list', 'cron schedule list',
    'language core list', 'language plugin list', 'language theme list',
  ];

  for (const cmd of safeThreePart) {
    it(`allows 3-part "${cmd}" without writes enabled`, () => {
      expect(isCommandAllowed(cmd, false)).toEqual({ allowed: true });
    });
  }

  // Single-word commands
  it('allows "help"', () => {
    expect(isCommandAllowed('help', false)).toEqual({ allowed: true });
  });

  it('blocks "server" (starts HTTP server, not read-only)', () => {
    const result = isCommandAllowed('server', false);
    expect(result.allowed).toBe(false);
  });

  // Safe commands with extra args should still match
  it('allows "plugin list --status=active"', () => {
    expect(isCommandAllowed('plugin list --status=active', false)).toEqual({ allowed: true });
  });

  it('allows "post-type list --fields=name,public"', () => {
    expect(isCommandAllowed('post-type list --fields=name,public', false)).toEqual({ allowed: true });
  });

  it('allows "post meta list 42"', () => {
    expect(isCommandAllowed('post meta list 42', false)).toEqual({ allowed: true });
  });

  it('allows "user meta get 1 nickname"', () => {
    expect(isCommandAllowed('user meta get 1 nickname', false)).toEqual({ allowed: true });
  });
});

// ── isCommandAllowed: BLOCKED_COMMANDS ────────────────────────────

describe('isCommandAllowed — blocked commands', () => {
  const blocked = ['eval', 'eval-file', 'shell'];

  for (const cmd of blocked) {
    it(`blocks "${cmd}" even with writes enabled`, () => {
      const result = isCommandAllowed(cmd, true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
      expect(result.reason).toContain('arbitrary code execution');
    });
  }

  it('blocks "eval \'echo 1;\'" even with writes', () => {
    const result = isCommandAllowed("eval 'echo 1;'", true);
    expect(result.allowed).toBe(false);
  });

  it('blocks "eval-file /tmp/script.php" even with writes', () => {
    const result = isCommandAllowed('eval-file /tmp/script.php', true);
    expect(result.allowed).toBe(false);
  });
});

// ── isCommandAllowed: write commands ──────────────────────────────

describe('isCommandAllowed — write commands', () => {
  const writeCommands = [
    'plugin activate akismet',
    'plugin deactivate akismet',
    'plugin install akismet',
    'plugin delete akismet',
    'theme activate twentytwentyfour',
    'theme install twentytwentyfour',
    'theme delete twentytwentyfour',
    'user create admin admin@example.com',
    'user delete 42',
    'post create --post_title=Test',
    'post update 42 --post_title=Updated',
    'post delete 42',
    'post meta update 42 _key value',
    'post meta add 42 _key value',
    'post meta delete 42 _key',
    'option update blogname "My Site"',
    'option add custom_key value',
    'option delete custom_key',
    'term create category Test',
    'term update 5 --name=Updated',
    'term delete category 5',
    'comment create --comment_post_ID=1',
    'comment delete 1',
    'config set WP_DEBUG true',
    'search-replace old new',
    'db import dump.sql',
    'db export dump.sql',
    'db reset',
    'db optimize',
    'db repair',
    'core update',
    'core download',
    'core install --url=example.com',
    'cron event run --all',
    'rewrite flush',
    'transient delete --all',
    'cache flush',
    'maintenance-mode activate',
    'maintenance-mode deactivate',
    'scaffold plugin my-plugin',
    'package install wp-cli/doctor-command',
  ];

  for (const cmd of writeCommands) {
    it(`blocks "${cmd}" when writes disabled`, () => {
      const result = isCommandAllowed(cmd, false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('WPCLI_ALLOW_WRITES');
    });

    it(`allows "${cmd}" when writes enabled`, () => {
      const result = isCommandAllowed(cmd, true);
      expect(result.allowed).toBe(true);
    });
  }
});

// ── isCommandAllowed: edge cases ──────────────────────────────────

describe('isCommandAllowed — edge cases', () => {
  it('handles extra whitespace gracefully', () => {
    expect(isCommandAllowed('  plugin   list  ', false)).toEqual({ allowed: true });
  });

  it('handles command with many args', () => {
    expect(isCommandAllowed('post list --post_type=page --post_status=publish --fields=ID,post_title', false))
      .toEqual({ allowed: true });
  });

  it('does not confuse "post" (1-part) as safe for "post create"', () => {
    // "post" alone is NOT in SAFE_COMMANDS — only "post list" and "post get"
    const result = isCommandAllowed('post create', false);
    expect(result.allowed).toBe(false);
  });

  it('does not confuse "plugin" (1-part) as safe for "plugin activate"', () => {
    const result = isCommandAllowed('plugin activate', false);
    expect(result.allowed).toBe(false);
  });

  it('distinguishes "maintenance-mode status" (safe) from "maintenance-mode activate" (write)', () => {
    expect(isCommandAllowed('maintenance-mode status', false)).toEqual({ allowed: true });
    const result = isCommandAllowed('maintenance-mode activate', false);
    expect(result.allowed).toBe(false);
  });

  it('distinguishes "cron event list" (safe) from "cron event run" (write)', () => {
    expect(isCommandAllowed('cron event list', false)).toEqual({ allowed: true });
    const result = isCommandAllowed('cron event run', false);
    expect(result.allowed).toBe(false);
  });

  it('distinguishes "post meta list" (safe) from "post meta update" (write)', () => {
    expect(isCommandAllowed('post meta list 42', false)).toEqual({ allowed: true });
    const result = isCommandAllowed('post meta update 42 _key value', false);
    expect(result.allowed).toBe(false);
  });
});

// ── getActionVerb ─────────────────────────────────────────────────

describe('getActionVerb', () => {
  it('finds a read-only verb in position 2', () => {
    expect(getActionVerb(['wc', 'product', 'list'])).toBe('list');
  });

  it('finds a read-only verb before flags', () => {
    expect(getActionVerb(['wc', 'product', 'list', '--field=name'])).toBe('list');
  });

  it('finds "get" in position 2', () => {
    expect(getActionVerb(['post', 'get', '42'])).toBe('get');
  });

  it('finds "get" in position 3 (3-part command)', () => {
    expect(getActionVerb(['post', 'meta', 'get', '42', '--format=json'])).toBe('get');
  });

  it('returns undefined for single-word commands', () => {
    expect(getActionVerb(['help'])).toBeUndefined();
  });

  it('finds verb in position 4 (deeply nested plugin command)', () => {
    expect(getActionVerb(['wc', 'product', 'variation', 'list', '123'])).toBe('list');
  });

  it('returns undefined when no read-only verb is present', () => {
    expect(getActionVerb(['wc', 'product', 'create', '--name=Test'])).toBeUndefined();
  });

  it('returns undefined for unknown action verbs', () => {
    expect(getActionVerb(['elementor', 'flush-css'])).toBeUndefined();
  });

  it('finds "search" as a read-only verb', () => {
    expect(getActionVerb(['wc', 'shop_order', 'search', 'test'])).toBe('search');
  });
});

// ── READ_ONLY_SUBCOMMANDS pattern ─────────────────────────────────

describe('isCommandAllowed — read-only subcommand pattern (plugin commands)', () => {
  // Plugin commands with read-only verbs should be allowed without writes
  const pluginReadOnly = [
    'wc product list',
    'wc order list --status=completed',
    'wc customer get 42',
    'wc product variation list 123',
    'yoast index status',
    'acf field list',
    'acf field get my-group',
    'wc shop_order search test',
    'elementor library info',
    'jetpack status',
  ];

  for (const cmd of pluginReadOnly) {
    it(`allows plugin command "${cmd}" without writes enabled`, () => {
      expect(isCommandAllowed(cmd, false)).toEqual({ allowed: true });
    });
  }

  // Plugin commands with write verbs should be blocked without writes
  const pluginWrite = [
    'wc product create --name=Test',
    'wc order update 42 --status=completed',
    'wc product delete 42',
    'yoast index run',
    'acf field create my-group',
    'elementor flush-css',
  ];

  for (const cmd of pluginWrite) {
    it(`blocks plugin command "${cmd}" when writes disabled`, () => {
      const result = isCommandAllowed(cmd, false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('WPCLI_ALLOW_WRITES');
    });

    it(`allows plugin command "${cmd}" when writes enabled`, () => {
      expect(isCommandAllowed(cmd, true)).toEqual({ allowed: true });
    });
  }
});

// ── WPCLI_SAFE_COMMANDS env var ───────────────────────────────────

describe('WPCLI_SAFE_COMMANDS custom safe commands', () => {
  afterEach(() => {
    delete process.env.WPCLI_SAFE_COMMANDS;
  });

  it('getCustomSafeCommands returns empty set when env not set', () => {
    delete process.env.WPCLI_SAFE_COMMANDS;
    expect(getCustomSafeCommands().size).toBe(0);
  });

  it('getCustomSafeCommands parses comma-separated commands', () => {
    process.env.WPCLI_SAFE_COMMANDS = 'wc report sales,wc report customers';
    const cmds = getCustomSafeCommands();
    expect(cmds.has('wc report sales')).toBe(true);
    expect(cmds.has('wc report customers')).toBe(true);
    expect(cmds.size).toBe(2);
  });

  it('getCustomSafeCommands trims whitespace', () => {
    process.env.WPCLI_SAFE_COMMANDS = '  wc report sales , wc report customers  ';
    const cmds = getCustomSafeCommands();
    expect(cmds.has('wc report sales')).toBe(true);
    expect(cmds.has('wc report customers')).toBe(true);
  });

  it('getCustomSafeCommands ignores empty entries', () => {
    process.env.WPCLI_SAFE_COMMANDS = 'wc report sales,,, ,wc report customers';
    expect(getCustomSafeCommands().size).toBe(2);
  });

  it('allows a custom safe command without writes enabled', () => {
    process.env.WPCLI_SAFE_COMMANDS = 'wc report sales';
    expect(isCommandAllowed('wc report sales', false)).toEqual({ allowed: true });
  });

  it('allows a custom safe command with extra args', () => {
    process.env.WPCLI_SAFE_COMMANDS = 'wc report sales';
    // 3-part match: "wc report sales" matches even with extra args
    expect(isCommandAllowed('wc report sales --date_min=2024-01-01', false)).toEqual({ allowed: true });
  });

  it('does not allow unrelated commands via custom safe list', () => {
    process.env.WPCLI_SAFE_COMMANDS = 'wc report sales';
    const result = isCommandAllowed('wc product create', false);
    expect(result.allowed).toBe(false);
  });
});

// ── validateArgs ─────────────────────────────────────────────────

describe('validateArgs — blocked flags', () => {
  it('allows normal args', () => {
    expect(validateArgs(['--status=active', '--format=json'])).toEqual({ valid: true });
  });

  it('allows positional args', () => {
    expect(validateArgs(['42', 'my-value', '--fields=ID,title'])).toEqual({ valid: true });
  });

  it('blocks --require flag (=value form)', () => {
    const result = validateArgs(['--require=/tmp/evil.php']);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('--require');
    expect(result.reason).toContain('blocked');
  });

  it('blocks --require flag (space-separated, flag only)', () => {
    const result = validateArgs(['--require', '/tmp/evil.php']);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('--require');
  });

  it('blocks --exec flag', () => {
    const result = validateArgs(['--exec=echo hello']);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('--exec');
  });

  it('blocks --skip-plugins flag', () => {
    const result = validateArgs(['--skip-plugins']);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('--skip-plugins');
  });

  it('blocks --skip-themes flag', () => {
    const result = validateArgs(['--skip-themes']);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('--skip-themes');
  });

  it('blocks flags case-insensitively', () => {
    const result = validateArgs(['--REQUIRE=/tmp/evil.php']);
    expect(result.valid).toBe(false);
  });

  it('detects blocked flag among safe flags', () => {
    const result = validateArgs(['--format=json', '--require=/tmp/evil.php', '--fields=ID']);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('--require');
  });

  it('allows empty args array', () => {
    expect(validateArgs([])).toEqual({ valid: true });
  });

  it('blocks shell metacharacters in args (semicolon)', () => {
    const result = validateArgs(['; rm -rf /']);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('metacharacter');
  });

  it('blocks shell metacharacters in args (pipe)', () => {
    const result = validateArgs(['| cat /etc/passwd']);
    expect(result.valid).toBe(false);
  });

  it('blocks shell metacharacters in args (backtick)', () => {
    const result = validateArgs(['`whoami`']);
    expect(result.valid).toBe(false);
  });

  it('blocks shell metacharacters in args ($())', () => {
    const result = validateArgs(['$(id)']);
    expect(result.valid).toBe(false);
  });
});

// ── isCommandAllowed — shell metacharacter defense ───────────────

describe('isCommandAllowed — shell metacharacter defense', () => {
  it('blocks commands with semicolons', () => {
    const result = isCommandAllowed('plugin list; rm -rf /', false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('metacharacter');
  });

  it('blocks commands with pipes', () => {
    const result = isCommandAllowed('plugin list | cat /etc/passwd', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks commands with backticks', () => {
    const result = isCommandAllowed('option get `whoami`', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks commands with $() substitution', () => {
    const result = isCommandAllowed('option get $(id)', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks commands with && chaining', () => {
    const result = isCommandAllowed('plugin list && rm -rf /', false);
    expect(result.allowed).toBe(false);
  });

  it('allows normal commands without metacharacters', () => {
    expect(isCommandAllowed('plugin list --format=json', false)).toEqual({ allowed: true });
  });
});
