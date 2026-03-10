import fs from 'fs/promises';
import path from 'path';
import { loadSitesJson, resolvePath } from './services/local-detector.js';

interface McpJsonConfig {
  mcpServers: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Detect which Local site the current working directory belongs to
 * by matching cwd against site paths in sites.json.
 */
async function detectSiteFromCwd(): Promise<{ id: string; name: string } | null> {
  try {
    const sites = await loadSitesJson();
    const cwd = process.cwd();

    for (const site of Object.values(sites)) {
      const sitePath = resolvePath(site.path);
      if (cwd.startsWith(sitePath)) {
        return { id: site.id, name: site.name };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function runSetup(): Promise<void> {
  const mcpJsonPath = path.join(process.cwd(), '.mcp.json');

  // Detect site
  const detected = await detectSiteFromCwd();
  if (detected) {
    console.log(`Detected Local site: "${detected.name}" (${detected.id})`);
  } else {
    console.log('Could not auto-detect Local site from current directory.');
    console.log('Set SITE_NAME manually in .mcp.json after setup.');
  }

  // Build the server config entry
  const serverEntry = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@chrisfromthelc/local-wp-mcp'],
    env: {
      ...(detected ? { SITE_NAME: detected.name } : {}),
      WPCLI_ALLOW_WRITES: 'false',
      MYSQL_ALLOW_WRITES: 'false',
    },
  };

  // Read existing .mcp.json or start fresh
  let config: McpJsonConfig;
  let existed = false;

  try {
    const raw = await fs.readFile(mcpJsonPath, 'utf-8');
    config = JSON.parse(raw) as McpJsonConfig;
    existed = true;

    // Ensure mcpServers object exists
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      config.mcpServers = {};
    }
  } catch {
    config = { mcpServers: {} };
  }

  // Check if local-wp already exists
  if (config.mcpServers['local-wp']) {
    console.log('local-wp already exists in .mcp.json — skipping (remove it first to re-run setup).');
    return;
  }

  // Add the server entry
  config.mcpServers['local-wp'] = serverEntry;

  // Write back
  await fs.writeFile(mcpJsonPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  if (existed) {
    console.log(`Added local-wp to existing ${mcpJsonPath}`);
  } else {
    console.log(`Created ${mcpJsonPath}`);
  }

  console.log('\nConfiguration written:');
  console.log(JSON.stringify({ 'local-wp': serverEntry }, null, 2));
  console.log('\nRestart Claude Code to connect.');
}
