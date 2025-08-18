# Development Workflow

This document describes the git workflow and deployment process for the Todo application.

## Overview

We use a hybrid git flow optimized for a small team (2 developers) that balances safety for database migrations with speed for other changes.

## Branch Strategy

- **`main`** - Production branch
  - Protected branch (requires PR)
  - Auto-deploys to production via Vercel
  - Always stable and deployable
  
- **`develop`** - Integration branch for database migrations
  - Auto-deploys to staging environment
  - Where all database migrations are tested first
  - Merged to main weekly (or as needed)

- **Feature branches** - Individual development
  - Created from `develop` (if has migrations) or `main` (if no migrations)
  - Named: `feature/description`, `fix/description`, `chore/description`

## Smart Routing System

We use Claude Code commands to automatically route PRs based on their content:

### No Database Changes → Fast Track
- PRs without schema changes can go directly to `main`
- Includes: UI updates, bug fixes, documentation, refactoring
- `develop` is automatically updated from `main` after merge

### Has Database Changes → Safe Track  
- PRs with schema/migration changes must go through `develop`
- Includes: Any changes to `prisma/schema.prisma` or new migration files
- Tested with shared test database before production

## Database Strategy

- **Production Database** (Railway)
  - Only accessed by `main` branch deployments
  - Protected from direct migration experiments
  
- **Test Database** (Railway)
  - Shared by `develop` branch and all PR preview deployments
  - Reset weekly or as needed
  - Where migration conflicts are discovered and resolved

## Daily Workflow

### 1. Starting New Work

```bash
# For features WITHOUT database changes
git checkout main
git pull origin main
git checkout -b feature/my-feature

# For features WITH database changes
git checkout develop
git pull origin develop  
git checkout -b feature/my-feature-with-migrations
```

### 2. During Development

```bash
# Make changes
# If adding migrations:
npx prisma migrate dev --name descriptive_name

# Commit regularly
git add .
git commit -m "feat: description"
git push origin feature/my-feature
```

### 3. Creating PR - Use Smart Commands

```bash
# Let Claude Code figure out the routing
/smart-merge

# Or explicitly fast-track safe changes
/fast-track

# Check safety first
/check-deploy-safety
```

### 4. PR Review Process

- All PRs require review before merge
- Migration PRs get extra scrutiny
- Preview deployments available on Vercel
- Test database used for all previews

### 5. After Merge

- Direct to `main` → Deployed to production immediately
- To `develop` → Deployed to staging, awaits batch release
- Branches automatically cleaned up

## Claude Code Commands

### `/smart-merge`
Analyzes your PR and routes it appropriately:
- Detects database changes
- Creates PR to correct base branch
- Adds appropriate labels
- Notifies team if coordination needed

### `/fast-track`  
For changes you know are safe:
- Creates PR directly to main
- Skips develop branch
- Auto-updates develop after merge

### `/check-deploy-safety`
Pre-flight check before merging:
- Detects migration conflicts
- Checks schema compatibility  
- Suggests appropriate merge strategy

### `/sync-branches`
Keeps branches in sync:
- Updates develop from main
- Checks for divergence
- Resolves simple conflicts

## Migration Coordination

### Weekly Release Cycle
- Monday: Merge `develop` → `main`
- Tuesday-Friday: Active development
- Migrations accumulate in `develop`
- Hot fixes can still go direct to `main`

### Daily Sync
- Quick Slack/Discord check: "Any migrations today?"
- Coordinate on shared test database usage
- Flag any blocking migrations

### Migration Best Practices
1. Always add migrations, never modify existing ones
2. Make migrations reversible when possible
3. Test migrations on test database first
4. Include migration purpose in the name
5. Document breaking changes in PR

## Emergency Procedures

### Hot Fix to Production
```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug
# Fix issue (no migrations!)
/fast-track
```

### Migration Conflict Resolution
1. Communicate in team channel
2. Decide on merge order
3. Reset test database if needed
4. Rebase and resolve conflicts
5. Test thoroughly before proceeding

### Rollback Procedure
1. Revert PR in GitHub
2. Deploy reverted code
3. Handle database rollback if needed (rare)
4. Document lessons learned

## Deployment Environments

### Production (main)
- URL: https://exponential.im
- Database: Production (Railway)
- Auto-deploys on merge to main
- Monitoring enabled

### Staging (develop)
- URL: https://develop-todo.vercel.app
- Database: Test (Railway) 
- Auto-deploys on merge to develop
- For integration testing

### Preview (PRs)
- URL: https://todo-pr-[number].vercel.app
- Database: Test (Railway - shared)
- Auto-created for every PR
- Destroyed on PR close

## Why This Workflow?

### Benefits
1. **Safety for migrations** - Never break production database
2. **Speed for other changes** - Ship UI/fixes immediately  
3. **Automation** - Claude Code commands reduce decisions
4. **Flexibility** - Can adapt based on change type
5. **Simplicity** - Only 2 branches to think about

### Trade-offs
1. **Shared test database** - Requires coordination
2. **Two merge paths** - Adds some complexity
3. **Weekly ceremony** - Batch migration releases

## Quick Reference

| Change Type | Route | Command | Deploy Time |
|------------|-------|---------|-------------|
| UI/UX | main | `/fast-track` | Immediate |
| Bug fix (no DB) | main | `/fast-track` | Immediate |
| Docs | main | `/fast-track` | Immediate |  
| New feature (no DB) | main | `/smart-merge` | Immediate |
| Schema change | develop | `/smart-merge` | Weekly |
| New migration | develop | `/smart-merge` | Weekly |

## Getting Started

1. Clone the repository
2. Install Claude Code
3. Copy `.env.example` to `.env`
4. Run `bun install`
5. Check out appropriate branch based on your work
6. Use Claude Code commands for PRs

---

*Last updated: January 2025*  
*Questions? Ask in #dev-workflow channel*