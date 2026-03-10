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

### Install from source

```bash
git clone https://github.com/chrisfromthelc/local-wp-mcp.git
cd local-wp-mcp
npm install
```

### With Claude Code (project-scoped)

Add a `.mcp.json` to your WordPress project root. This config is **project-scoped** and takes precedence over user-level settings in `~/.claude.json`:

```json
{
  "mcpServers": {
    "local-wp": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/local-wp-mcp/dist/index.js"],
      "env": {
        "SITE_NAME": "your-site-name",
        "WPCLI_ALLOW_WRITES": "true",
        "MYSQL_ALLOW_WRITES": "true"
      }
    }
  }
}
```

> **Important**: All `env` values must be strings (e.g., `"true"` not `true`).

Or add via CLI:

```bash
claude mcp add local-wp --project -- node /absolute/path/to/local-wp-mcp/dist/index.js
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
