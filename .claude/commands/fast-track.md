Fast-track safe changes directly to main branch, bypassing develop.

Use this for:
- UI/UX updates
- Documentation changes
- Bug fixes without database changes
- Styling updates
- Refactoring without schema changes

Steps:
1. Verify current branch is not main or develop
2. Double-check no database changes:
   - No modifications to `prisma/schema.prisma`
   - No new migration files
   - Warn and abort if database changes detected
3. Ensure all changes are committed and pushed
4. Create PR directly to main:
   - Use branch name for title
   - Add label: "fast-track"
   - Note in body: "Fast-tracked: No database changes"
5. Display PR URL
6. Remind user to:
   - Get PR reviewed
   - After merge, run `/sync-branches` to update develop

Safety checks:
- Confirm no schema.prisma changes
- Verify no migration files
- Check for merge conflicts with main