Keep develop and main branches in sync, especially after fast-track merges.

Steps:
1. Save current branch name for later return
2. Fetch latest from origin:
   - `git fetch origin main:main`
   - `git fetch origin develop:develop`
3. Check if develop is behind main:
   - Count commits: `git rev-list --count develop..main`
   - List commits if any: `git log --oneline develop..main`
4. If develop is behind main:
   - Checkout develop: `git checkout develop`
   - Merge main: `git merge main -m "chore: sync develop with main"`
   - Push to origin: `git push origin develop`
5. Check for divergence:
   - Commits in develop not in main: `git log --oneline main..develop`
   - If found, list them and note upcoming batch release
6. Return to original branch
7. Provide status summary:
   - Sync status (up-to-date, synced, or diverged)
   - Any migrations pending in develop
   - Next recommended actions

Additional checks:
- Warn if local branches are out of date
- Suggest pulling latest changes
- Remind about weekly develop→main merge if migrations are pending