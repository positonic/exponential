#!/bin/bash
# Serena MCP Setup Script
# This script sets up Serena MCP for any project

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up Serena MCP for your project${NC}"

# Get the absolute path of the current directory
PROJECT_ROOT=$(pwd)
echo -e "${GREEN}Project root: $PROJECT_ROOT${NC}"

# 1. Create necessary directories
echo -e "\n${YELLOW}Creating directories...${NC}"
mkdir -p .claude/commands
mkdir -p docs

# 2. Add Serena to .mcp.json
echo -e "\n${YELLOW}Configuring MCP...${NC}"
if [ -f .mcp.json ]; then
    # Backup existing file
    cp .mcp.json .mcp.json.backup
    echo "Backed up existing .mcp.json to .mcp.json.backup"
    
    # Check if serena already exists
    if grep -q '"serena"' .mcp.json; then
        echo "Serena already configured in .mcp.json"
    else
        # Add Serena to existing config using a temporary file
        jq '.mcpServers.serena = {
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
                "'$PROJECT_ROOT'"
            ]
        }' .mcp.json > .mcp.json.tmp && mv .mcp.json.tmp .mcp.json
        echo "Added Serena to existing .mcp.json"
    fi
else
    # Create new .mcp.json
    cat > .mcp.json << EOF
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
                "$PROJECT_ROOT"
            ]
        }
    }
}
EOF
    echo "Created new .mcp.json"
fi

# 3. Copy Serena commands
echo -e "\n${YELLOW}Installing Claude commands...${NC}"

# Create serena-index command
cat > .claude/commands/serena-index.md << 'EOF'
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
EOF

# Create serena-check command
cat > .claude/commands/serena-check.md << 'EOF'
Check Serena MCP index status and automatically re-index if needed.

Steps:
1. Check if `.serena/cache/` directory exists
   - If not, run indexing immediately
2. Check age of cache files:
   - Look for `.serena/cache/typescript/document_symbols_cache_*.pkl`
   - If older than 7 days, suggest re-indexing
3. Check recent git activity:
   - Run `git log --oneline -1 --pretty=format:"%ar"`
   - If recent pull/merge, check changed files count
   - If >10 files changed, suggest re-indexing
4. Provide status summary:
   - Cache age
   - Last git activity
   - Recommendation (index, re-index, or cache is fresh)
5. If re-indexing is needed, run it automatically after confirmation

This helps maintain optimal Serena performance for code intelligence.
EOF

# Create post-git-update command
cat > .claude/commands/post-git-update.md << 'EOF'
Run necessary maintenance after git pull, merge, or checkout operations.

Steps:
1. Check what changed in the latest git operation:
   ```bash
   git diff --name-only HEAD@{1} HEAD | wc -l
   ```
2. If more than 10 files changed:
   - Notify about significant changes
   - Run `/serena-index` to update code intelligence
3. Check for package.json changes:
   ```bash
   git diff --name-only HEAD@{1} HEAD | grep -E "(package\.json|bun\.lockb)"
   ```
   - If changed, remind to run `bun install`
4. Check for schema.prisma changes:
   ```bash
   git diff --name-only HEAD@{1} HEAD | grep "schema\.prisma"
   ```
   - If changed, remind about database migrations
5. Check for new Claude commands:
   ```bash
   git diff --name-only HEAD@{1} HEAD | grep "\.claude/commands/"
   ```
   - If new commands added, list them
6. Provide summary of actions needed

This ensures the development environment stays in sync after git operations.
EOF

echo "Created Claude commands"

# 4. Copy documentation
echo -e "\n${YELLOW}Installing documentation...${NC}"
# This will be created by the next part of the script

# 5. Update .gitignore
echo -e "\n${YELLOW}Updating .gitignore...${NC}"
if ! grep -q "^.serena/cache/" .gitignore 2>/dev/null; then
    echo -e "\n# Serena MCP cache\n.serena/cache/" >> .gitignore
    echo "Added .serena/cache/ to .gitignore"
else
    echo ".serena/cache/ already in .gitignore"
fi

# 6. Initial indexing
echo -e "\n${YELLOW}Running initial project indexing...${NC}"
echo "This may take 30-60 seconds depending on project size..."
uvx --from git+https://github.com/oraios/serena serena project index

echo -e "\n${GREEN}✅ Serena MCP setup complete!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Restart Claude Code to connect to the Serena MCP server"
echo "2. Use /serena-index to re-index after major changes"
echo "3. Use /serena-check to verify index status"
echo "4. Check docs/SERENA_MCP_GUIDE.md for detailed usage"

# Check if we should update CLAUDE.md
if [ -f CLAUDE.md ]; then
    echo -e "\n${YELLOW}Update your CLAUDE.md with Serena instructions? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        # Add Serena section to CLAUDE.md if not already present
        if ! grep -q "Serena MCP" CLAUDE.md; then
            cat >> CLAUDE.md << 'EOF'

## IDE Enhancement with Serena MCP

The project uses Serena MCP server for enhanced code intelligence. See `/docs/SERENA_MCP_GUIDE.md` for details.

### Automatic Serena Management

**IMPORTANT**: Claude should proactively manage Serena indexing:

1. **Auto-index on session start**: When starting a new Claude session, check if index is older than 7 days
2. **Post-merge indexing**: After running `git pull` or merging branches, suggest re-indexing
3. **Major change detection**: After creating/moving/deleting multiple files, run `/serena-index`
4. **Performance issues**: If symbol search seems slow or inaccurate, re-index automatically

### Quick Commands
- **Re-index**: `/serena-index` - Updates the symbol cache
- **Check age**: Look for `.serena/cache/typescript/document_symbols_cache_*.pkl` modification time
- **Features**: Enhanced code navigation, symbol search, and contextual awareness

### Serena Workflow Rules
- If `.serena/cache/` doesn't exist → Run indexing immediately
- If cache is older than 7 days → Suggest re-indexing
- After `git pull` with 10+ file changes → Auto re-index
- When user reports "can't find symbol" → Re-index and retry
EOF
            echo "Added Serena section to CLAUDE.md"
        else
            echo "Serena section already exists in CLAUDE.md"
        fi
    fi
fi

echo -e "\n${GREEN}🎉 Setup complete!${NC}"