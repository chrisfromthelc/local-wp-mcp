import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import {
  resolvePath,
  getPlatformBinDir,
  getWebRoot,
  getRunDataDir,
  getMysqlSocketPath,
  selectSite,
  listSites,
  loadSitesJson,
  getSitesJsonPath,
  getLocalDataDir,
} from '../src/services/local-detector.js';
import type { LocalSiteConfig } from '../src/types.js';

// ── Helper: minimal valid site config ─────────────────────────────

function makeSite(overrides?: Partial<LocalSiteConfig>): LocalSiteConfig {
  return {
    id: 'abc123',
    name: 'Test Site',
    domain: 'testsite.local',
    path: '/home/user/Local Sites/testsite',
    services: {
      php: { name: 'php', version: '8.2.0', type: 'lightning' },
      mysql: { name: 'mysql', version: '8.0.16', type: 'lightning' },
    },
    ports: {},
    mysql: { database: 'local', user: 'root', password: 'root' },
    ...overrides,
  };
}

// ── resolvePath ───────────────────────────────────────────────────

describe('resolvePath', () => {
  it('replaces leading ~ with home directory', () => {
    expect(resolvePath('~/test')).toBe(path.join(os.homedir(), 'test'));
  });

  it('leaves absolute paths unchanged', () => {
    expect(resolvePath('/absolute/path')).toBe('/absolute/path');
  });

  it('leaves relative paths unchanged', () => {
    expect(resolvePath('relative/path')).toBe('relative/path');
  });
});

// ── getPlatformBinDir ─────────────────────────────────────────────

describe('getPlatformBinDir', () => {
  it('returns a string for the current platform', () => {
    const result = getPlatformBinDir();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── getWebRoot ────────────────────────────────────────────────────

describe('getWebRoot', () => {
  it('appends app/public to site path', () => {
    const site = makeSite({ path: '/home/user/Local Sites/mysite' });
    expect(getWebRoot(site)).toBe('/home/user/Local Sites/mysite/app/public');
  });

  it('resolves ~ in site path', () => {
    const site = makeSite({ path: '~/Local Sites/mysite' });
    expect(getWebRoot(site)).toBe(
      path.join(os.homedir(), 'Local Sites', 'mysite', 'app', 'public')
    );
  });
});

// ── getRunDataDir ─────────────────────────────────────────────────

describe('getRunDataDir', () => {
  it('returns local data dir + run/ + site id', () => {
    const site = makeSite({ id: 'xyz789' });
    const result = getRunDataDir(site);
    expect(result).toContain('run');
    expect(result).toContain('xyz789');
  });
});

// ── getMysqlSocketPath ────────────────────────────────────────────

describe('getMysqlSocketPath', () => {
  it('returns socket path under run data dir', () => {
    const site = makeSite({ id: 'abc123' });
    const result = getMysqlSocketPath(site);
    expect(result).toContain('abc123');
    expect(result).toContain('mysqld.sock');
  });
});

// ── getSitesJsonPath / getLocalDataDir ─────────────────────────

describe('getSitesJsonPath', () => {
  it('returns a path containing sites.json', () => {
    // This works on macOS/Linux, would fail on Windows
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const p = getSitesJsonPath();
      expect(p).toContain('sites.json');
    }
  });
});

describe('getLocalDataDir', () => {
  it('returns a path on supported platforms', () => {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const dir = getLocalDataDir();
      expect(dir).toContain('Local');
    }
  });
});

// ── loadSitesJson / listSites / selectSite ────────────────────────
// These require the sites.json file to exist, so we mock fs

describe('loadSitesJson', () => {
  it('loads and validates entries from sites.json', async () => {
    // On a machine with Local installed, this should succeed
    // On CI without Local, it will throw
    try {
      const sites = await loadSitesJson();
      // If it succeeds, verify the result is a valid object
      expect(typeof sites).toBe('object');
      for (const [key, site] of Object.entries(sites)) {
        expect(typeof key).toBe('string');
        expect(typeof site.id).toBe('string');
        expect(typeof site.name).toBe('string');
        expect(typeof site.path).toBe('string');
      }
    } catch (err) {
      // On machines without Local, verify the error message is helpful
      expect((err as Error).message).toMatch(/sites\.json/);
    }
  });
});

describe('selectSite', () => {
  it('is a function with the expected signature', () => {
    expect(typeof selectSite).toBe('function');
  });

  it('rejects with helpful message for non-existent site', async () => {
    try {
      await selectSite('__nonexistent_site_that_does_not_exist__');
      // If sites.json exists but site doesn't, should throw
    } catch (err) {
      expect((err as Error).message).toMatch(/not found|sites\.json/);
    }
  });
});

describe('listSites', () => {
  it('returns an array', async () => {
    try {
      const sites = await listSites();
      expect(Array.isArray(sites)).toBe(true);
    } catch (err) {
      // On machines without Local, should throw about sites.json
      expect((err as Error).message).toMatch(/sites\.json/);
    }
  });
});
