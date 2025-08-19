# Serena MCP Setup for Claude Code

This package helps you quickly set up Serena MCP (IDE assistant) for any project using Claude Code.

## Quick Install

### Option 1: One-line Setup (Recommended)

From your project root, run:

```bash
bash <(curl -s https://raw.githubusercontent.com/[your-github]/serena-claude-setup/main/setup.sh)
```

### Option 2: Manual Setup

1. Copy these files to your project:
   - `.claude/commands/serena-index.md`
   - `.claude/commands/serena-check.md` 
   - `.claude/commands/post-git-update.md`
   - `docs/SERENA_MCP_GUIDE.md`

2. Add Serena to your `.mcp.json`:
```json
{
  "mcpServers": {
    "serena": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/oraios/serena",
        "serena",
        "start-mcp-server",
        "--context",
        "ide-assistant",
        "--project",
        "/your/project/path"
      ]
    }
  }
}
```

3. Add to `.gitignore`:
```
# Serena MCP cache
.serena/cache/
```

4. Run initial indexing:
```bash
uvx --from git+https://github.com/oraios/serena serena project index
```

5. Restart Claude Code

## What You Get

- **Enhanced code intelligence** in Claude Code
- **Automatic index management** with Claude commands
- **Symbol search** across your entire codebase
- **Better code navigation** and understanding

## Files Included

```
.claude/
├── commands/
│   ├── serena-index.md      # Re-index command
│   ├── serena-check.md      # Status check command
│   └── post-git-update.md   # Post-git maintenance
└── templates/
    ├── serena-setup.sh      # Setup script
    ├── SERENA_MCP_GUIDE.md  # Full documentation
    └── SERENA_SETUP_README.md # This file

docs/
└── SERENA_MCP_GUIDE.md      # User documentation
```

## Sharing With Other Projects

1. Copy the `.claude/templates/` folder to your new project
2. Run `.claude/templates/serena-setup.sh`
3. Done!

Or create a GitHub repo with these files and share the one-liner setup command.

## Requirements

- Claude Code (with MCP support)
- Python with `uv` installed (`pip install uv`)
- Git (for version control integration)