# Serena MCP Server Guide

## Overview

Serena is an IDE assistant that integrates with Claude Code through the Model Context Protocol (MCP). It provides enhanced code understanding, navigation, and assistance by indexing your project's symbols and structure.

## What is MCP?

MCP (Model Context Protocol) is a standard that allows AI assistants like Claude to connect to external tools and services. Serena uses MCP to provide IDE-like capabilities to Claude Code.

## Installation and Setup

### 1. MCP Configuration

The Serena MCP server is already configured in `.mcp.json`:

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
        "/Users/james/code/todo"
      ]
    }
  }
}
```

### 2. Project Indexing

Serena needs to index your project to understand its structure. This creates a cache of all symbols (functions, classes, variables, etc.) in your codebase.

**Command:**
```bash
uvx --from git+https://github.com/oraios/serena serena project index
```

This command:
- Scans all TypeScript/JavaScript files in your project
- Extracts symbols and their relationships
- Saves the index to `.serena/cache/`
- Takes about 30 seconds for a medium-sized project

## When to Re-index

You should re-index your project when:

1. **Major code changes**: After significant refactoring or adding new modules
2. **New dependencies**: After installing new packages that you'll be working with
3. **Project structure changes**: Moving files, renaming directories
4. **Weekly maintenance**: As a general practice, re-index weekly
5. **Performance issues**: If Serena seems to be missing symbols or giving outdated suggestions

## Creating a Claude Code Command

Create a convenient command for re-indexing:

### Create `/serena-index` Command

Create `.claude/commands/serena-index.md`:

```markdown
Re-index the project with Serena MCP for improved code assistance.

Steps:
1. Run the Serena indexing command
2. Show progress and completion status
3. Confirm the index was saved successfully
4. Remind user to restart Claude Code if needed

Command to run:
uvx --from git+https://github.com/oraios/serena serena project index
```

## How to Use Serena MCP in Claude Code

### 1. Available Features

Once Serena is running, Claude Code gains these capabilities:

- **Enhanced code navigation**: Better understanding of code relationships
- **Symbol search**: Find functions, classes, and variables across the project
- **Contextual awareness**: Understands imports, exports, and dependencies
- **Type information**: Provides TypeScript type context
- **Project structure**: Understands folder organization and conventions

### 2. Example Usage

When Serena is active, you can ask Claude things like:

- "Find all functions that call `updateProject`"
- "Show me where `ProjectStatus` type is defined"
- "What components use the `useAuth` hook?"
- "Analyze the dependency graph for the Projects component"

### 3. MCP Tools Available

Serena provides several MCP tools that Claude can use automatically:

- `search_symbols`: Find symbols by name or type
- `get_file_symbols`: Get all symbols in a specific file
- `get_symbol_definition`: Get the definition of a symbol
- `get_symbol_references`: Find all references to a symbol
- `analyze_dependencies`: Understand import/export relationships

## Workflow Integration

### Daily Development

1. **Start of day**: Run `/serena-index` if you pulled new changes
2. **During coding**: Claude automatically uses Serena for better code understanding
3. **After major changes**: Re-index to keep the cache current

### Team Collaboration

- Add `.serena/cache/` to `.gitignore` (each developer maintains their own index)
- Document re-indexing in your team's onboarding process
- Consider adding indexing to your development setup scripts

### Performance Tips

- The index is cached, so subsequent uses are fast
- First indexing might be slow (30-60 seconds)
- The cache persists between Claude Code sessions
- Clear cache with `rm -rf .serena/cache/` if you encounter issues

## Troubleshooting

### Common Issues

1. **"Serena MCP server not found"**
   - Restart Claude Code after adding to `.mcp.json`
   - Check that uvx is installed: `pip install uv`

2. **"Index seems outdated"**
   - Run the re-index command
   - Clear cache and re-index if problems persist

3. **"Slow performance"**
   - Check if `.serena/cache/` exists
   - Re-index might be needed
   - Large projects (1000+ files) may take longer

### Debug Commands

```bash
# Check if Serena is installed correctly
uvx --from git+https://github.com/oraios/serena serena --help

# View current project configuration
uvx --from git+https://github.com/oraios/serena serena project health-check

# Check what files would be indexed
uvx --from git+https://github.com/oraios/serena serena project is_ignored_path <path>
```

## Best Practices

1. **Regular indexing**: Set a reminder to re-index weekly
2. **Post-merge indexing**: Re-index after merging significant PRs
3. **Team communication**: Let team know if you add Serena-specific features
4. **Cache management**: Don't commit the cache directory
5. **Context selection**: Use `--context ide-assistant` for code projects

## Advanced Configuration

### Custom Contexts

Serena supports different contexts for different types of assistance:

- `ide-assistant`: General IDE features (default)
- `code-reviewer`: Focus on code quality
- `refactoring-assistant`: Help with code refactoring
- `test-writer`: Assist with test creation

### Project-Specific Settings

Create `.serena/project.yml` for custom configuration:

```yaml
# Example configuration
ignore_patterns:
  - "dist/**"
  - "build/**"
  - "*.test.ts"
  
index_extensions:
  - .ts
  - .tsx
  - .js
  - .jsx
```

## Summary

Serena MCP enhances Claude Code with IDE-like capabilities through intelligent project indexing. By maintaining an up-to-date index of your codebase, Claude can provide more accurate and context-aware assistance.

Key points:
- Index regularly for best results
- Use the `/serena-index` command for convenience
- Restart Claude Code after configuration changes
- The index improves code navigation and understanding

---

*Last updated: January 2025*  
*For issues: https://github.com/oraios/serena*