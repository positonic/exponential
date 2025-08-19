Re-index the project with Serena MCP for improved code assistance.

Steps:
1. Run the Serena indexing command
2. Show progress and completion status
3. Confirm the index was saved successfully
4. Remind user to restart Claude Code if needed for new MCP connections

Command to run:
```bash
uvx --from git+https://github.com/oraios/serena serena project index
```

This will scan all project files and update the symbol cache that Serena uses to provide better code understanding and navigation.