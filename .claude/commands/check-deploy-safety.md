Analyze the current branch for deployment safety and recommend merge strategy.

Steps:
1. Get current branch name and status
2. Check for database-related changes:
   - Schema modifications: `git diff origin/main...HEAD -- prisma/schema.prisma`
   - New migrations: `git diff origin/main...HEAD --name-only -- prisma/migrations/`
   - Migration keywords in commits: "migrate", "schema", "database", "table"
3. Check for conflicts:
   - With main branch
   - With develop branch
   - Identify conflicting files
4. Analyze risk level:
   - **Low Risk**: No DB changes, no conflicts → fast-track ready
   - **Medium Risk**: No DB changes but has conflicts → needs careful review
   - **High Risk**: Has DB changes → must go through develop
5. Check test coverage:
   - Look for test file changes
   - Warn if changes without tests
6. Provide recommendation:
   - Suggested target branch (main or develop)
   - Recommended command (/fast-track or /smart-merge)
   - Any warnings or concerns
   - Migration coordination reminders if applicable

Output format:
```
🔍 Deployment Safety Check
Branch: feature/your-branch
Target: main (recommended) or develop

✅ No database changes detected
✅ No merge conflicts
⚠️  No test changes found

Recommendation: Safe to /fast-track to main
```