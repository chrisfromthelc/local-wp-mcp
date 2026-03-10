#!/usr/bin/env node

// Handle --setup flag before importing MCP dependencies
if (process.argv.includes('--setup')) {
  const { runSetup } = await import('./setup.js');
  await runSetup();
  process.exit(0);
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerWpCliTools } from './tools/wp-cli-tools.js';
import { registerDbTools } from './tools/db-tools.js';
import { registerFsTools } from './tools/fs-tools.js';
import { closePool } from './services/mysql-client.js';

const server = new McpServer({
  name: 'local-wp-mcp',
  version: '1.0.0',
});

// Register all tool groups
registerWpCliTools(server);
registerDbTools(server);
registerFsTools(server);

// Graceful shutdown
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('[local-wp-mcp] Server started on stdio transport');
