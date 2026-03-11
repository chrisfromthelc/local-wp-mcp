import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { selectSite } from '../services/local-detector.js';
import { readFile, writeFile, listDirectory, searchFiles } from '../services/filesystem.js';

export function registerFsTools(server: McpServer): void {
  server.registerTool('read_site_file', {
    title: 'Read Site File',
    description:
      'Read a file from the Local by Flywheel site directory. ' +
      'Path is relative to the site root (e.g., "app/public/wp-config.php"). ' +
      'Files are limited to 512KB. All paths are validated against the site directory.',
    inputSchema: {
      path: z
        .string()
        .describe('Relative path from site root (e.g., "app/public/wp-content/themes/mytheme/style.css")'),
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain. Uses env var if not specified.'),
    },
    annotations: {
      title: 'Read Site File',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ path: filePath, site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);
      const result = await readFile(filePath, site);

      return {
        content: [
          { type: 'text' as const, text: result.content },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${(err as Error).message}` },
        ],
        isError: true,
      };
    }
  });

  server.registerTool('write_site_file', {
    title: 'Write Site File',
    description:
      'Write content to a file in the Local by Flywheel site directory. ' +
      'Requires FS_ALLOW_WRITES=true. ' +
      'Cannot write to wp-admin/ or wp-includes/ (WordPress core). ' +
      'Path is relative to the site root.',
    inputSchema: {
      path: z
        .string()
        .describe('Relative path from site root (e.g., "app/public/wp-content/themes/mytheme/functions.php")'),
      content: z
        .string()
        .describe('File content to write'),
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain. Uses env var if not specified.'),
    },
    annotations: {
      title: 'Write Site File',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  }, async ({ path: filePath, content, site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);
      const result = await writeFile(filePath, content, site);

      return {
        content: [
          {
            type: 'text' as const,
            text: `File written: ${result.path} (${result.size} bytes)`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${(err as Error).message}` },
        ],
        isError: true,
      };
    }
  });

  server.registerTool('list_site_directory', {
    title: 'List Site Directory',
    description:
      'List files and directories in a Local by Flywheel site directory. ' +
      'Path is relative to the site root. Returns file names, types, and sizes.',
    inputSchema: {
      path: z
        .string()
        .optional()
        .default('.')
        .describe('Relative path from site root (default: site root). E.g., "app/public/wp-content/plugins"'),
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain. Uses env var if not specified.'),
    },
    annotations: {
      title: 'List Site Directory',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ path: dirPath, site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);
      const result = await listDirectory(dirPath || '.', site);

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result.entries, null, 2) },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${(err as Error).message}` },
        ],
        isError: true,
      };
    }
  });

  server.registerTool('search_site_files', {
    title: 'Search Site Files',
    description:
      'Search for files by name pattern within the Local site directory. ' +
      'Searches recursively up to 10 levels deep, max 100 results. ' +
      'Skips node_modules, vendor, and dotfiles.',
    inputSchema: {
      pattern: z
        .string()
        .describe('File name pattern to search for (e.g., "functions.php", ".css")'),
      path: z
        .string()
        .optional()
        .default('.')
        .describe('Directory to start search from, relative to site root'),
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain. Uses env var if not specified.'),
    },
    annotations: {
      title: 'Search Site Files',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ pattern, path: dirPath, site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);
      const result = await searchFiles(pattern, dirPath || '.', site);

      return {
        content: [
          {
            type: 'text' as const,
            text: result.matches.length > 0
              ? `Found ${result.matches.length} files:\n${result.matches.join('\n')}`
              : `No files matching "${pattern}" found.`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${(err as Error).message}` },
        ],
        isError: true,
      };
    }
  });
}
