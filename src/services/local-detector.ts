import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { LocalSiteConfig, SitesJson } from '../types.js';

const SITES_JSON_PATHS: Record<string, string> = {
  darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Local', 'sites.json'),
  linux: path.join(os.homedir(), '.config', 'Local', 'sites.json'),
};

const LOCAL_DATA_DIRS: Record<string, string> = {
  darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Local'),
  linux: path.join(os.homedir(), '.config', 'Local'),
};

export function getLocalDataDir(): string {
  const dir = LOCAL_DATA_DIRS[process.platform];
  if (!dir) {
    throw new Error(`Unsupported platform: ${process.platform}. Local by Flywheel supports macOS and Linux.`);
  }
  return dir;
}

export function getSitesJsonPath(): string {
  const p = SITES_JSON_PATHS[process.platform];
  if (!p) {
    throw new Error(`Unsupported platform: ${process.platform}. Local by Flywheel supports macOS and Linux.`);
  }
  return p;
}

export async function loadSitesJson(): Promise<SitesJson> {
  const sitesPath = getSitesJsonPath();
  try {
    const raw = await fs.readFile(sitesPath, 'utf-8');
    return JSON.parse(raw) as SitesJson;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Local by Flywheel sites.json not found at ${sitesPath}. Is Local installed?`
      );
    }
    throw new Error(`Failed to parse sites.json: ${(err as Error).message}`);
  }
}

export async function listSites(): Promise<LocalSiteConfig[]> {
  const sites = await loadSitesJson();
  return Object.values(sites);
}

/**
 * Resolve a site by ID, name (case-insensitive), or domain.
 * Priority: SITE_ID env > SITE_NAME env > explicit argument.
 */
export async function selectSite(identifier?: string): Promise<LocalSiteConfig> {
  const sites = await loadSitesJson();
  const siteList = Object.values(sites);

  if (siteList.length === 0) {
    throw new Error('No Local by Flywheel sites found in sites.json.');
  }

  // Priority cascade: env vars > explicit argument > single-site fallback
  const siteId = process.env.SITE_ID;
  const siteName = process.env.SITE_NAME;
  const lookup = siteId || siteName || identifier;

  if (!lookup) {
    if (siteList.length === 1) {
      return siteList[0];
    }
    throw new Error(
      `Multiple sites found. Set SITE_NAME or SITE_ID env var, or pass a site identifier. ` +
      `Available sites: ${siteList.map((s) => s.name).join(', ')}`
    );
  }

  // Match by ID
  if (sites[lookup]) {
    return sites[lookup];
  }

  // Match by name (case-insensitive)
  const byName = siteList.find(
    (s) => s.name.toLowerCase() === lookup.toLowerCase()
  );
  if (byName) return byName;

  // Match by domain
  const byDomain = siteList.find(
    (s) => s.domain.toLowerCase() === lookup.toLowerCase()
  );
  if (byDomain) return byDomain;

  throw new Error(
    `Site "${lookup}" not found. Available sites: ${siteList.map((s) => `${s.name} (${s.id})`).join(', ')}`
  );
}

export function resolvePath(p: string): string {
  return p.replace(/^~/, os.homedir());
}

export function getPlatformBinDir(): string {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin';
  }
  return 'linux';
}

export function getPhpBinDir(site: LocalSiteConfig): string {
  const dataDir = getLocalDataDir();
  const platform = getPlatformBinDir();
  return path.join(
    dataDir, 'lightning-services',
    `php-${site.services.php.version}`, 'bin', platform, 'bin'
  );
}

export function getMysqlBinDir(site: LocalSiteConfig): string {
  const dataDir = getLocalDataDir();
  const platform = getPlatformBinDir();
  return path.join(
    dataDir, 'lightning-services',
    `mysql-${site.services.mysql.version}`, 'bin', platform, 'bin'
  );
}

export function getMysqlSocketPath(site: LocalSiteConfig): string {
  const runData = resolvePath(site.paths.runData);
  return path.join(runData, 'mysql', 'mysqld.sock');
}

export function getWebRoot(site: LocalSiteConfig): string {
  return resolvePath(site.paths.webRoot);
}
