#!/usr/bin/env node

// Handle CLI flags before importing MCP dependencies
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const { createRequire: cr } = await import('module');
  const req = cr(import.meta.url);
  const pkg = req('../package.json') as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`local-wp-mcp - MCP server for Local by Flywheel WordPress sites

Usage:
  npx @chrisfromthelc/local-wp-mcp [options]

Options:
  --setup     Auto-detect Local site and create .mcp.json
  --version   Show version number
  --help      Show this help message

Environment variables:
  SITE_NAME            Site name as shown in Local
  SITE_ID              Site ID (takes precedence over SITE_NAME)
  WPCLI_ALLOW_WRITES   Enable write WP-CLI commands (default: false)
  MYSQL_ALLOW_WRITES   Enable write SQL queries (default: false)
  FS_ALLOW_WRITES      Enable file writes (default: false)
  WPCLI_SAFE_COMMANDS  Comma-separated additional read-only commands`);
  process.exit(0);
}

if (process.argv.includes('--setup')) {
  const { runSetup } = await import('./setup.js');
  await runSetup();
  process.exit(0);
}

import { createRequire } from 'module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerWpCliTools } from './tools/wp-cli-tools.js';
import { registerDbTools } from './tools/db-tools.js';
import { registerFsTools } from './tools/fs-tools.js';
import { closePool } from './services/mysql-client.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const server = new McpServer({
  name: 'local-wp-mcp',
  version,
});

// Register all tool groups
registerWpCliTools(server);
registerDbTools(server);
registerFsTools(server);

// Graceful shutdown
async function shutdown(): Promise<void> {
  try {
    await closePool();
  } catch {
    // Ignore errors during shutdown
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('[local-wp-mcp] Server started on stdio transport');
