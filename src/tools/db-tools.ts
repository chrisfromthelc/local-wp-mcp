import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { selectSite } from '../services/local-detector.js';
import { executeQuery, getSchema } from '../services/mysql-client.js';

export function registerDbTools(server: McpServer): void {
  server.registerTool('mysql_query', {
    title: 'Run MySQL Query',
    description:
      'Execute a SQL query against the WordPress database. ' +
      'SELECT, SHOW, DESCRIBE, and EXPLAIN are always allowed. ' +
      'INSERT, UPDATE, DELETE require MYSQL_ALLOW_WRITES=true.',
    inputSchema: {
      query: z
        .string()
        .describe('SQL query to execute (e.g., "SELECT * FROM wp_options WHERE option_name = \'siteurl\'")'),
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain. Uses env var if not specified.'),
    },
    annotations: {
      title: 'Run MySQL Query',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ query, site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);
      const result = await executeQuery(site, query);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { rowCount: result.rowCount, fields: result.fields, rows: result.rows },
              null,
              2
            ),
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

  server.registerTool('mysql_schema', {
    title: 'Get Database Schema',
    description:
      'Get the schema of the WordPress database. ' +
      'Without a table name, lists all tables. With a table name, shows column details.',
    inputSchema: {
      table: z
        .string()
        .optional()
        .describe('Table name to inspect (e.g., "wp_options"). Omit to list all tables.'),
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain. Uses env var if not specified.'),
    },
    annotations: {
      title: 'Get Database Schema',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ table, site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);
      const schema = await getSchema(site, table);

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(schema, null, 2) },
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

  server.registerTool('wp_active_plugins', {
    title: 'Get Active Plugins (DB)',
    description: 'Query the database directly to get the list of active WordPress plugins.',
    inputSchema: {
      site: z
        .string()
        .optional()
        .describe('Site name, ID, or domain. Uses env var if not specified.'),
    },
    annotations: {
      title: 'Get Active Plugins (DB)',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ site: siteIdentifier }) => {
    try {
      const site = await selectSite(siteIdentifier);
      const result = await executeQuery(
        site,
        "SELECT option_value FROM wp_options WHERE option_name = 'active_plugins'"
      );

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No active plugins found.' }],
        };
      }

      const serialized = (result.rows[0] as any).option_value;
      return {
        content: [
          { type: 'text' as const, text: `Active plugins (serialized PHP):\n${serialized}` },
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
