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

/**
 * The sites.json version (e.g., "8.4.4") may not exactly match the
 * lightning-services folder name (e.g., "php-8.4.4+2"). Glob to find
 * the matching directory.
 */
async function findServiceDir(serviceName: string, version: string): Promise<string> {
  const dataDir = getLocalDataDir();
  const servicesDir = path.join(dataDir, 'lightning-services');

  try {
    const entries = await fs.readdir(servicesDir);
    // Look for exact match first (service-version), then prefix match (service-version+N)
    const prefix = `${serviceName}-${version}`;
    const exact = entries.find((e) => e === prefix);
    if (exact) return path.join(servicesDir, exact);

    const prefixed = entries
      .filter((e) => e.startsWith(prefix))
      .sort()
      .reverse(); // highest patch first
    if (prefixed.length > 0) return path.join(servicesDir, prefixed[0]);

    throw new Error(`No lightning-services directory found for ${serviceName}-${version}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`lightning-services directory not found at ${servicesDir}`);
    }
    throw err;
  }
}

export async function getPhpBinDir(site: LocalSiteConfig): Promise<string> {
  const platform = getPlatformBinDir();
  const serviceDir = await findServiceDir('php', site.services.php.version);
  return path.join(serviceDir, 'bin', platform, 'bin');
}

/**
 * Get the DB service entry — supports both mysql and mariadb.
 */
function getDbService(site: LocalSiteConfig): { name: string; version: string } {
  const mysql = site.services.mysql;
  if (mysql) return { name: 'mysql', version: mysql.version };

  const mariadb = site.services.mariadb;
  if (mariadb) return { name: 'mariadb', version: mariadb.version };

  throw new Error(`No database service found for site "${site.name}"`);
}

export async function getMysqlBinDir(site: LocalSiteConfig): Promise<string> {
  const platform = getPlatformBinDir();
  const db = getDbService(site);
  const serviceDir = await findServiceDir(db.name, db.version);
  return path.join(serviceDir, 'bin', platform, 'bin');
}

/**
 * Derive paths not present in sites.json:
 * - webRoot: {site.path}/app/public
 * - runData: {localDataDir}/run/{site.id}
 */
export function getWebRoot(site: LocalSiteConfig): string {
  return path.join(resolvePath(site.path), 'app', 'public');
}

export function getRunDataDir(site: LocalSiteConfig): string {
  return path.join(getLocalDataDir(), 'run', site.id);
}

export function getMysqlSocketPath(site: LocalSiteConfig): string {
  return path.join(getRunDataDir(site), 'mysql', 'mysqld.sock');
}
