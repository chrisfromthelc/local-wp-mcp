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

There are two ways to run this MCP server: **from npm** (recommended for general use) or **from a local clone** (for development or customization).

> **Important**: All `env` values must be strings (e.g., `"true"` not `true`).

---

### Option A: Install from npm (recommended)

This is the simplest approach. npm downloads and caches the package automatically — no cloning or building required.

#### Automatic setup (Claude Code)

From your Local site's project directory:

```bash
cd ~/Local\ Sites/mysite/app/public
npx -y @chrisfromthelc/local-wp-mcp --setup
```

This will auto-detect the Local site, create a `.mcp.json` (or merge into an existing one), and pre-fill `SITE_NAME` with write permissions set to `false`. Restart Claude Code to connect.

#### Manual setup

Choose your agent below. Each example uses `npx` to run the server — replace `"My Site Name"` with the name shown in Local.

<details>
<summary><strong>Claude Code</strong></summary>

Add a `.mcp.json` to your project root (e.g., `~/Local Sites/mysite/app/public/.mcp.json`):

```json
{
  "mcpServers": {
    "local-wp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chrisfromthelc/local-wp-mcp"],
      "env": {
        "SITE_NAME": "My Site Name",
        "WPCLI_ALLOW_WRITES": "false",
        "MYSQL_ALLOW_WRITES": "false",
        "FS_ALLOW_WRITES": "false"
      }
    }
  }
}
```

Or add via the CLI:

```bash
claude mcp add -s project local-wp -- npx -y @chrisfromthelc/local-wp-mcp
```

Then set environment variables with `claude mcp add-json` or by editing `.mcp.json` directly.

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit the config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "local-wp": {
      "command": "npx",
      "args": ["-y", "@chrisfromthelc/local-wp-mcp"],
      "env": {
        "SITE_NAME": "My Site Name",
        "WPCLI_ALLOW_WRITES": "false",
        "MYSQL_ALLOW_WRITES": "false",
        "FS_ALLOW_WRITES": "false"
      }
    }
  }
}
```

Restart Claude Desktop to connect.

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add a `.cursor/mcp.json` to your project root, or edit `~/.cursor/mcp.json` for global config:

```json
{
  "mcpServers": {
    "local-wp": {
      "command": "npx",
      "args": ["-y", "@chrisfromthelc/local-wp-mcp"],
      "env": {
        "SITE_NAME": "My Site Name",
        "WPCLI_ALLOW_WRITES": "false",
        "MYSQL_ALLOW_WRITES": "false",
        "FS_ALLOW_WRITES": "false"
      }
    }
  }
}
```

Or add from Cursor Settings > Tools & MCP > New MCP Server.

</details>

<details>
<summary><strong>VS Code (GitHub Copilot)</strong></summary>

Add a `.vscode/mcp.json` to your workspace root:

```json
{
  "servers": {
    "local-wp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chrisfromthelc/local-wp-mcp"],
      "env": {
        "SITE_NAME": "My Site Name",
        "WPCLI_ALLOW_WRITES": "false",
        "MYSQL_ALLOW_WRITES": "false",
        "FS_ALLOW_WRITES": "false"
      }
    }
  }
}
```

> **Note**: VS Code uses `"servers"` (not `"mcpServers"`) and requires `"type": "stdio"`.

Or use the Command Palette: **MCP: Add Server**.

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Edit the config file:
- macOS: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "local-wp": {
      "command": "npx",
      "args": ["-y", "@chrisfromthelc/local-wp-mcp"],
      "env": {
        "SITE_NAME": "My Site Name",
        "WPCLI_ALLOW_WRITES": "false",
        "MYSQL_ALLOW_WRITES": "false",
        "FS_ALLOW_WRITES": "false"
      }
    }
  }
}
```

Or use the Command Palette: **MCP: Add Server**.

</details>

---

### Option B: Install from source (development)

Use this if you want to modify the server, run tests, or contribute changes. You clone the repo, build it once, and point `.mcp.json` at your local build output.

#### 1. Clone and build

```bash
git clone https://github.com/chrisfromthelc/local-wp-mcp.git
cd local-wp-mcp
npm install
npm run build
```

#### 2. Configure your agent

Point your agent's config at the local `dist/index.js` instead of using npx. Use the same config format shown in the [manual setup](#manual-setup) section for your agent, but replace `command` and `args`:

```json
"command": "node",
"args": ["/absolute/path/to/local-wp-mcp/dist/index.js"]
```

> **Note**: The path must be absolute (e.g., `/Users/you/Projects/local-wp-mcp/dist/index.js`). Relative paths won't resolve correctly when the agent spawns the process.

#### 3. Rebuild after changes

After editing source files, rebuild before restarting your agent:

```bash
npm run build
```

You can also use `npm run dev` to watch for changes and rebuild automatically during development.

#### Development commands

```bash
npm run lint            # ESLint
npm run build           # TypeScript compile
npm test                # unit tests (single run)
npm run test:watch      # unit tests (watch mode)
npm run test:coverage   # unit tests with coverage report
```

---

### Switching between npm and local

To switch from npm to local (or vice versa), update `command` and `args` in your agent's config:

| Method | `command` | `args` |
|--------|-----------|--------|
| npm (npx) | `"npx"` | `["-y", "@chrisfromthelc/local-wp-mcp"]` |
| Local clone | `"node"` | `["/absolute/path/to/dist/index.js"]` |

Everything else (`env`, server name) stays the same. Restart your agent after switching.

---

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SITE_NAME` | Site name as shown in Local (e.g., `"My Site"`) | Auto-detected if only one site exists |
| `SITE_ID` | Site ID from Local (takes precedence over `SITE_NAME`) | — |
| `WPCLI_ALLOW_WRITES` | Enable write WP-CLI commands (`plugin install`, `post create`, etc.) | `"false"` |
| `MYSQL_ALLOW_WRITES` | Enable `INSERT`/`UPDATE`/`DELETE`/`ALTER` queries | `"false"` |
| `FS_ALLOW_WRITES` | Enable writing files via `write_site_file` (WordPress core dirs are always read-only) | `"false"` |
| `WPCLI_SAFE_COMMANDS` | Comma-separated list of additional read-only commands (see [Plugin CLI commands](#plugin-cli-commands)) | — |

If only one site exists in Local, `SITE_NAME` and `SITE_ID` can both be omitted — the server will connect to it automatically.

## Plugin CLI commands

This MCP server isn't limited to core WP-CLI commands — it automatically supports commands registered by plugins (WooCommerce, ACF, Yoast, Elementor, etc.).

### How it works

WP-CLI commands are classified using a three-tier system:

| Tier | Behavior | Examples |
|------|----------|----------|
| **Blocked** | Always rejected (arbitrary code execution) | `eval`, `eval-file`, `shell` |
| **Read-only** | Always allowed | Core safe commands + any command with a read-only action verb |
| **Write** | Requires `WPCLI_ALLOW_WRITES=true` | Everything else |

**Read-only action verbs** — any command whose subcommand is one of these is automatically allowed, regardless of whether it's a core or plugin command:

`list`, `get`, `search`, `check`, `status`, `path`, `info`, `version`, `is-installed`, `check-update`, `pluck`, `has`

This means commands like `wc product list`, `acf field get my-group`, or `yoast index status` work out of the box — no configuration needed.

Commands with write-action verbs like `wc product create`, `acf field delete`, or `yoast index run` are blocked unless `WPCLI_ALLOW_WRITES=true` is set.

### Custom safe commands

If a plugin has read-only commands that don't match the built-in verb patterns (e.g., `wc report sales`), you can whitelist them with the `WPCLI_SAFE_COMMANDS` environment variable:

```json
{
  "mcpServers": {
    "local-wp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chrisfromthelc/local-wp-mcp"],
      "env": {
        "SITE_NAME": "My Site Name",
        "WPCLI_ALLOW_WRITES": "false",
        "MYSQL_ALLOW_WRITES": "false",
        "WPCLI_SAFE_COMMANDS": "wc report sales,wc report customers,my-plugin dump-config"
      }
    }
  }
}
```

Commands in `WPCLI_SAFE_COMMANDS` are always allowed without writes enabled. Use comma-separated values, matching the first 2–3 words of the command.

## Security

- All commands use `spawn()` with argument arrays — no shell interpretation
- Shell metacharacters rejected in both commands and arguments as defense-in-depth
- WP-CLI `eval`, `eval-file`, and `shell` are always blocked
- Dangerous flags (`--exec`, `--require`, `--ssh`, etc.) are blocked in all commands
- Write operations require explicit opt-in via env vars
- Plugin commands with read-only verbs are auto-detected and allowed
- File paths are validated with `realpath()` to prevent symlink traversal
- File reads and writes use open handles to mitigate TOCTOU race conditions
- WordPress core directories (`wp-admin/`, `wp-includes/`) are read-only
- Child processes inherit only necessary environment variables
- Directory searches are capped at 10,000 files to prevent resource exhaustion
- Output is truncated at 25,000 characters to preserve context windows

## Requirements

- [Local by Flywheel](https://localwp.com/) installed
- Node.js 18+
- Site must be running in Local (services started)

## License

MIT
