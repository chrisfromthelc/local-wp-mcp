import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { selectSite } from '../services/local-detector.js';
import { executeWpCli } from '../services/wp-cli.js';

export function registerWpCliTools(server: McpServer): void {
  server.registerTool('wp_cli_run', {
    title: 'Run WP-CLI Command',
    description:
      'Execute a WP-CLI command against a Local by Flywheel WordPress site. ' +
      'Commands like "plugin list", "option get siteurl", "core version" are always allowed. ' +
      'Write commands require WPCLI_ALLOW_WRITES=true. ' +
      'Commands "eval", "eval-file", and "shell" are blocked for security.',
    inputSchema: {
      command: z
        .string()
        .describe(
          'WP-CLI subcommand to run (e.g., "plugin list", "option get siteurl", "core version", "user list")'
        ),
      args: z
        .array(z.string())
        .optional()
        .describe('Additional arguments to pass to the command'),
      format: z
        .enum(['table', 'json', 'csv', 'yaml', 'count'])
        .optional()
        .describe('Output format. Defaults to json for structured data.'),
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain to target. Uses SITE_NAME/SITE_ID env var if not specified.'),
    },
    annotations: {
      title: 'Run WP-CLI Command',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ command, args, format, site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);
      const result = await executeWpCli(command, site, {
        args,
        format: format || 'json',
      });

      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `WP-CLI command failed (exit code ${result.exitCode}):\n${result.stderr || result.stdout}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: result.stdout || '(no output)',
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

  server.registerTool('wp_site_info', {
    title: 'Get WordPress Site Info',
    description:
      'Get detailed information about the current Local by Flywheel WordPress site, ' +
      'including the site URL, WordPress version, active theme, and PHP version.',
    inputSchema: {
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain. Uses env var if not specified.'),
    },
    annotations: {
      title: 'Get WordPress Site Info',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);

      // Run multiple WP-CLI commands to gather site info
      const [version, siteUrl, theme, plugins] = await Promise.all([
        executeWpCli('core version', site),
        executeWpCli('option get siteurl', site),
        executeWpCli('theme list', site, { format: 'json' }),
        executeWpCli('plugin list', site, { format: 'json' }),
      ]);

      const info = {
        localSite: {
          id: site.id,
          name: site.name,
          domain: site.domain,
          phpVersion: site.services.php.version,
          mysqlVersion: site.services.mysql.version,
        },
        wordpress: {
          version: version.stdout.trim(),
          siteUrl: siteUrl.stdout.trim(),
        },
        themes: theme.stdout,
        plugins: plugins.stdout,
      };

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(info, null, 2) },
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

  server.registerTool('wp_list_sites', {
    title: 'List Local Sites',
    description:
      'List all WordPress sites configured in Local by Flywheel, ' +
      'including their names, domains, IDs, and service versions.',
    inputSchema: {},
    annotations: {
      title: 'List Local Sites',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async () => {
    try {
      const { listSites } = await import('../services/local-detector.js');
      const sites = await listSites();

      const summary = sites.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        path: s.path,
        php: s.services.php.version,
        mysql: s.services.mysql.version,
      }));

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(summary, null, 2) },
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
