import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { isReadOnlyPath, readFile, writeFile, listDirectory, searchFiles } from '../src/services/filesystem.js';
import type { LocalSiteConfig } from '../src/types.js';

// ── isReadOnlyPath ────────────────────────────────────────────────

describe('isReadOnlyPath', () => {
  const webRoot = '/home/user/Local Sites/mysite/app/public';

  // WordPress core directories should be read-only
  it('marks wp-admin/ as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-admin', 'index.php'), webRoot)).toBe(true);
  });

  it('marks wp-admin nested paths as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-admin', 'includes', 'class-wp-screen.php'), webRoot)).toBe(true);
  });

  it('marks wp-includes/ as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-includes', 'version.php'), webRoot)).toBe(true);
  });

  it('marks wp-includes nested paths as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-includes', 'rest-api', 'endpoints', 'class-wp-rest-posts-controller.php'), webRoot)).toBe(true);
  });

  // wp-content and other directories should be writable
  it('allows wp-content/themes/', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-content', 'themes', 'mytheme', 'style.css'), webRoot)).toBe(false);
  });

  it('allows wp-content/plugins/', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-content', 'plugins', 'myplugin', 'plugin.php'), webRoot)).toBe(false);
  });

  it('allows wp-content/uploads/', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-content', 'uploads', '2024', '01', 'image.jpg'), webRoot)).toBe(false);
  });

  it('allows wp-config.php in webroot', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-config.php'), webRoot)).toBe(false);
  });

  it('allows .htaccess in webroot', () => {
    expect(isReadOnlyPath(path.join(webRoot, '.htaccess'), webRoot)).toBe(false);
  });

  it('allows wp-content/mu-plugins/', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-content', 'mu-plugins', 'custom.php'), webRoot)).toBe(false);
  });

  // Edge cases: files that start with "wp-admin" or "wp-includes" but aren't in those dirs
  it('allows a file named wp-admin-helper.php in webroot', () => {
    const filePath = path.join(webRoot, 'wp-admin-helper.php');
    expect(isReadOnlyPath(filePath, webRoot)).toBe(false);
  });

  it('allows a file named wp-includes-extra.php in webroot', () => {
    const filePath = path.join(webRoot, 'wp-includes-extra.php');
    expect(isReadOnlyPath(filePath, webRoot)).toBe(false);
  });

  it('marks the wp-admin directory itself as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-admin'), webRoot)).toBe(true);
  });

  it('marks the wp-includes directory itself as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-includes'), webRoot)).toBe(true);
  });
});

// ── Path traversal validation (integration tests using real tmp dirs) ─

describe('filesystem path validation', () => {
  let tmpDir: string;
  let site: LocalSiteConfig;

  // Create a temporary site directory structure for testing
  async function setupTmpSite(): Promise<void> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lwmcp-test-'));
    // Create minimal site structure
    await fs.mkdir(path.join(tmpDir, 'app', 'public', 'wp-content', 'themes'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'app', 'public', 'wp-admin'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'app', 'public', 'wp-content', 'themes', 'test.css'), 'body {}');
    await fs.writeFile(path.join(tmpDir, 'app', 'public', 'index.php'), '<?php // test');

    site = {
      id: 'test-site-id',
      name: 'Test Site',
      domain: 'test.local',
      path: tmpDir,
      services: {
        php: { name: 'php', version: '8.2.0', type: 'lightning' },
        mysql: { name: 'mysql', version: '8.0.16', type: 'lightning' },
      },
      ports: {},
      mysql: { database: 'local', user: 'root', password: 'root' },
    };
  }

  async function cleanupTmpSite(): Promise<void> {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  it('readFile succeeds for a file inside the site directory', async () => {
    await setupTmpSite();
    try {
      const result = await readFile('app/public/index.php', site);
      expect(result.content).toContain('<?php');
      expect(result.size).toBeGreaterThan(0);
    } finally {
      await cleanupTmpSite();
    }
  });

  it('readFile rejects path traversal with ../', async () => {
    await setupTmpSite();
    try {
      await expect(readFile('../../../etc/passwd', site)).rejects.toThrow(/escapes site directory|does not exist/);
    } finally {
      await cleanupTmpSite();
    }
  });

  it('readFile rejects absolute path outside site', async () => {
    await setupTmpSite();
    try {
      // path.resolve will make this relative to site path, but realpath check should catch it
      await expect(readFile('/etc/passwd', site)).rejects.toThrow();
    } finally {
      await cleanupTmpSite();
    }
  });

  it('listDirectory succeeds for a directory inside the site', async () => {
    await setupTmpSite();
    try {
      const result = await listDirectory('app/public', site);
      expect(result.entries.length).toBeGreaterThan(0);
      const names = result.entries.map(e => e.name);
      expect(names).toContain('wp-content');
    } finally {
      await cleanupTmpSite();
    }
  });

  it('listDirectory rejects path traversal', async () => {
    await setupTmpSite();
    try {
      await expect(listDirectory('../../../tmp', site)).rejects.toThrow(/escapes site directory|does not exist/);
    } finally {
      await cleanupTmpSite();
    }
  });

  it('searchFiles returns matches within site', async () => {
    await setupTmpSite();
    try {
      const result = await searchFiles('test.css', 'app', site);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0]).toContain('test.css');
    } finally {
      await cleanupTmpSite();
    }
  });

  it('writeFile requires FS_ALLOW_WRITES', async () => {
    await setupTmpSite();
    const originalEnv = process.env.FS_ALLOW_WRITES;
    try {
      delete process.env.FS_ALLOW_WRITES;
      await expect(
        writeFile('app/public/wp-content/themes/test-new.css', 'body {}', site)
      ).rejects.toThrow(/FS_ALLOW_WRITES/);
    } finally {
      process.env.FS_ALLOW_WRITES = originalEnv;
      await cleanupTmpSite();
    }
  });

  it('writeFile rejects writes to wp-admin when enabled', async () => {
    await setupTmpSite();
    // Ensure wp-admin/evil.php parent exists for the path validation
    const originalEnv = process.env.FS_ALLOW_WRITES;
    try {
      process.env.FS_ALLOW_WRITES = 'true';
      // Write to existing wp-admin directory (created in setup)
      await expect(
        writeFile(path.join('app', 'public', 'wp-admin', 'evil.php'), '<?php evil();', site)
      ).rejects.toThrow(/WordPress core directory/);
    } finally {
      process.env.FS_ALLOW_WRITES = originalEnv;
      await cleanupTmpSite();
    }
  });

  it('writeFile succeeds for wp-content when enabled', async () => {
    await setupTmpSite();
    const originalEnv = process.env.FS_ALLOW_WRITES;
    try {
      process.env.FS_ALLOW_WRITES = 'true';
      // Write to a file within the existing themes directory
      const result = await writeFile(
        path.join('app', 'public', 'wp-content', 'themes', 'new-file.css'),
        'h1 { color: red; }',
        site
      );
      expect(result.size).toBeGreaterThan(0);
      // Verify the file was actually written
      const content = await fs.readFile(result.path, 'utf-8');
      expect(content).toBe('h1 { color: red; }');
    } finally {
      process.env.FS_ALLOW_WRITES = originalEnv;
      await cleanupTmpSite();
    }
  });
});
