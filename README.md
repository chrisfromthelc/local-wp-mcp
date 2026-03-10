# local-wp-mcp

MCP server providing WP-CLI, MySQL, and filesystem access for [Local by Flywheel](https://localwp.com/) WordPress sites.

Unlike REST API-based WordPress MCP servers, this connects directly through Local's native filesystem and process architecture — no application passwords, HTTP endpoints, or network requests needed.

## Features

- **WP-CLI execution** via Local's bundled PHP binary with command allowlisting
- **Direct MySQL queries** via Unix socket connection pooling
- **Filesystem operations** with path validation and WordPress core protection
- **Multi-site support** with automatic site detection from `sites.json`
- **Security-first**: `spawn()` only (no `exec()`), symlink-safe path validation, tiered command permissions

## Tools

| Tool | Description |
|------|-------------|
| `wp_cli_run` | Execute any WP-CLI command |
| `wp_site_info` | Get WordPress version, URL, themes, plugins |
| `wp_list_sites` | List all Local by Flywheel sites |
| `mysql_query` | Run SQL queries (read-only by default) |
| `mysql_schema` | Inspect database tables and columns |
| `wp_active_plugins` | Get active plugins via direct DB query |
| `read_site_file` | Read files from the site directory |
| `write_site_file` | Write files (wp-content only, core protected) |
| `list_site_directory` | List directory contents |
| `search_site_files` | Search for files by name pattern |

## Setup

### Quick setup (recommended)

Run this from your Local site's project directory (e.g., `~/Local Sites/mysite/app/public/`):

```bash
npx -y @chrisfromthelc/local-wp-mcp --setup
```

This will:
- Auto-detect the Local site from your current directory
- Create or merge into an existing `.mcp.json`
- Pre-fill `SITE_NAME` and set write permissions to `false`

Then restart Claude Code to connect.

### Manual setup

Add a `.mcp.json` to your WordPress project root (e.g., your Local site's `app/public/` folder):

```json
{
  "mcpServers": {
    "local-wp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chrisfromthelc/local-wp-mcp"],
      "env": {
        "SITE_NAME": "your-site-name",
        "WPCLI_ALLOW_WRITES": "false",
        "MYSQL_ALLOW_WRITES": "false"
      }
    }
  }
}
```

> **Important**: All `env` values must be strings (e.g., `"true"` not `true`).

Or add via CLI:

```bash
claude mcp add -s project local-wp -- npx -y @chrisfromthelc/local-wp-mcp
```

### From source (development)

```bash
git clone https://github.com/chrisfromthelc/local-wp-mcp.git
cd local-wp-mcp
npm install
```

Then use a local path in `.mcp.json` instead:

```json
{
  "mcpServers": {
    "local-wp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/local-wp-mcp/dist/index.js"],
      "env": {
        "SITE_NAME": "your-site-name",
        "WPCLI_ALLOW_WRITES": "false",
        "MYSQL_ALLOW_WRITES": "false"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SITE_NAME` | Site name to connect to (from Local) |
| `SITE_ID` | Site ID (takes precedence over SITE_NAME) |
| `WPCLI_ALLOW_WRITES` | Set to `true` to enable write WP-CLI commands |
| `MYSQL_ALLOW_WRITES` | Set to `true` to enable INSERT/UPDATE/DELETE queries |

If only one site exists in Local, it's selected automatically.

## Security

- All commands use `spawn()` with argument arrays — no shell interpretation
- WP-CLI `eval`, `eval-file`, and `shell` are always blocked
- Write operations require explicit opt-in via env vars
- File paths are validated with `realpath()` to prevent symlink traversal
- WordPress core directories (`wp-admin/`, `wp-includes/`) are read-only
- Output is truncated at 25,000 characters to preserve context windows

## Requirements

- [Local by Flywheel](https://localwp.com/) installed
- Node.js 18+
- Site must be running in Local (services started)

## License

MIT
