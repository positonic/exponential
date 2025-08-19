# Serena MCP Server Guide

## Overview

Serena is an IDE assistant that integrates with Claude Code through the Model Context Protocol (MCP). It provides enhanced code understanding, navigation, and assistance by indexing your project's symbols and structure.

## What is MCP?

MCP (Model Context Protocol) is a standard that allows AI assistants like Claude to connect to external tools and services. Serena uses MCP to provide IDE-like capabilities to Claude Code.

## Installation and Setup

### Quick Setup

Run the setup script from your project root:

```bash
curl -sSL https://raw.githubusercontent.com/your-repo/serena-setup/main/serena-setup.sh | bash
```

Or if you have the script locally:

```bash
./.claude/templates/serena-setup.sh
```

### Manual Setup

1. **Add to `.mcp.json`**:
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
        "/path/to/your/project"
      ]
    }
  }
}
```

2. **Index your project**:
```bash
uvx --from git+https://github.com/oraios/serena serena project index
```

3. **Add to `.gitignore`**:
```
# Serena MCP cache
.serena/cache/
```

## When to Re-index

You should re-index your project when:

1. **Major code changes**: After significant refactoring or adding new modules
2. **New dependencies**: After installing new packages that you'll be working with
3. **Project structure changes**: Moving files, renaming directories
4. **Weekly maintenance**: As a general practice, re-index weekly
5. **Performance issues**: If Serena seems to be missing symbols or giving outdated suggestions

## Claude Code Commands

- `/serena-index` - Re-index the project
- `/serena-check` - Check index status and auto-reindex if needed
- `/post-git-update` - Run after git operations to maintain environment

## How It Works

Serena provides Claude with:
- **Symbol search**: Find functions, classes, and variables across the project
- **Type information**: Understand TypeScript/JavaScript types
- **Dependency tracking**: Know what imports what
- **Code navigation**: Jump to definitions and find references
- **Project awareness**: Understand folder structure and conventions

## Troubleshooting

### Common Issues

1. **"Serena MCP server not found"**
   - Restart Claude Code after setup
   - Ensure `uvx` is installed: `pip install uv`

2. **"Index seems outdated"**
   - Run `/serena-index`
   - Clear cache: `rm -rf .serena/cache/`

3. **"Command not found: uvx"**
   - Install uv: `pip install uv`
   - Or use `pipx`: `pipx install uv`

## Best Practices

1. **Regular indexing**: Set weekly reminders
2. **Post-merge indexing**: After pulling significant changes
3. **Cache management**: Don't commit `.serena/cache/`
4. **Team usage**: Each developer maintains their own index

---

*For more details, see the [Serena GitHub repository](https://github.com/oraios/serena)*