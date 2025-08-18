Intelligently create and merge a PR based on whether it contains database changes.

Steps:
1. Check current branch name and ensure we're not on main or develop
2. Analyze changes to detect database modifications:
   - Check for changes to `prisma/schema.prisma`
   - Check for new files in `prisma/migrations/`
   - Look for migration-related keywords in commit messages
3. Determine target branch:
   - If has database changes → target `develop`
   - If no database changes → target `main`
4. Create PR with appropriate base branch:
   - Use descriptive title from branch name or recent commits
   - Add labels: "has-migrations" if applicable
   - Include database warning in body if needed
5. Show PR URL and next steps
6. If fast-tracked to main, remind to sync develop later

Important checks:
- Ensure all changes are committed
- Verify branch is pushed to origin
- Check for merge conflicts with target branch