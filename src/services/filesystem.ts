import fs from 'fs/promises';
import path from 'path';
import type { LocalSiteConfig } from '../types.js';
import { resolvePath, getWebRoot } from './local-detector.js';

const MAX_FILE_SIZE = 512 * 1024; // 512KB read limit
const MAX_OUTPUT_LINES = 500;

/**
 * Validate that a resolved path is within the site's directory tree.
 * Uses realpath to defeat symlink traversal.
 */
async function validatePath(filePath: string, site: LocalSiteConfig): Promise<string> {
  const sitePath = resolvePath(site.path);
  const resolved = path.resolve(sitePath, filePath);

  // Use realpath when the path exists to resolve symlinks
  let real: string;
  try {
    real = await fs.realpath(resolved);
  } catch {
    // If file doesn't exist yet (for writes), validate the parent
    const parent = path.dirname(resolved);
    try {
      const realParent = await fs.realpath(parent);
      if (!realParent.startsWith(sitePath)) {
        throw new Error(`Path escapes site directory: ${filePath}`);
      }
      real = path.join(realParent, path.basename(resolved));
    } catch {
      throw new Error(`Parent directory does not exist: ${path.dirname(filePath)}`);
    }
  }

  const realSitePath = await fs.realpath(sitePath);
  if (!real.startsWith(realSitePath)) {
    throw new Error(`Path escapes site directory: ${filePath}`);
  }

  return real;
}

/**
 * Check if a path is in a read-only zone (wp-admin, wp-includes).
 */
function isReadOnlyPath(filePath: string, webRoot: string): boolean {
  const relative = path.relative(webRoot, filePath);
  return relative.startsWith('wp-admin') || relative.startsWith('wp-includes');
}

export async function readFile(
  filePath: string,
  site: LocalSiteConfig,
): Promise<{ content: string; path: string; size: number }> {
  const resolved = await validatePath(filePath, site);
  const stat = await fs.stat(resolved);

  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large (${(stat.size / 1024).toFixed(1)}KB). Max: ${MAX_FILE_SIZE / 1024}KB.`
    );
  }

  const content = await fs.readFile(resolved, 'utf-8');
  return {
    content,
    path: resolved,
    size: stat.size,
  };
}

export async function writeFile(
  filePath: string,
  content: string,
  site: LocalSiteConfig,
): Promise<{ path: string; size: number }> {
  const resolved = await validatePath(filePath, site);
  const webRoot = getWebRoot(site);

  if (isReadOnlyPath(resolved, webRoot)) {
    throw new Error(`Cannot write to WordPress core directory: ${filePath}`);
  }

  await fs.writeFile(resolved, content, 'utf-8');
  const stat = await fs.stat(resolved);
  return { path: resolved, size: stat.size };
}

export async function listDirectory(
  dirPath: string,
  site: LocalSiteConfig,
): Promise<{ entries: Array<{ name: string; type: string; size: number }> }> {
  const resolved = await validatePath(dirPath, site);
  const stat = await fs.stat(resolved);

  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const results: Array<{ name: string; type: string; size: number }> = [];

  for (const entry of entries.slice(0, MAX_OUTPUT_LINES)) {
    let size = 0;
    if (entry.isFile()) {
      try {
        const s = await fs.stat(path.join(resolved, entry.name));
        size = s.size;
      } catch {
        // skip stat errors
      }
    }
    results.push({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      size,
    });
  }

  return { entries: results };
}

export async function searchFiles(
  pattern: string,
  dirPath: string,
  site: LocalSiteConfig,
): Promise<{ matches: string[] }> {
  const resolved = await validatePath(dirPath, site);
  const matches: string[] = [];
  const sitePath = resolvePath(site.path);

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 10 || matches.length >= 100) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'vendor') {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.includes(pattern)) {
        matches.push(path.relative(sitePath, fullPath));
      }

      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      }
    }
  }

  await walk(resolved, 0);
  return { matches };
}
