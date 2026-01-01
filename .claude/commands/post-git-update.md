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