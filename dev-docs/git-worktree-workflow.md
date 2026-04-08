# Git Worktree Development Workflow

## Table of Contents
- [Overview](#overview)
- [Why Use Git Worktrees?](#why-use-git-worktrees)
- [Implementation Example: Outcomes Delete Feature](#implementation-example-outcomes-delete-feature)
- [Claude Code Custom Commands](#claude-code-custom-commands)
- [Step-by-Step Workflow](#step-by-step-workflow)
- [Common Gotchas](#common-gotchas)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [Critical Analysis](#critical-analysis)
- [Future Improvements](#future-improvements)

## Overview

Git worktrees allow you to have multiple working directories attached to the same repository. This enables parallel development on different features without the need to stash changes or switch branches in your main working directory.

In this project, we've implemented a structured workflow using git worktrees with Claude Code custom commands to automate the setup and management process.

## Why Use Git Worktrees?

### Benefits
- **Parallel Development**: Work on multiple features simultaneously
- **No Context Switching**: Keep your main branch stable while experimenting
- **Isolated Testing**: Run multiple versions of your app on different ports
- **Preserve State**: No need to stash/unstash when switching between features
- **Code Review**: Easy to compare features side-by-side

### Use Cases
- Developing a new feature while maintaining the ability to hotfix production
- Testing how multiple features interact before merging
- Reviewing PRs while continuing development
- Running different database migrations in isolation

## Implementation Example: Outcomes Delete Feature

As a practical example, we implemented delete functionality for the outcomes page using a worktree:

### What We Built
1. **Backend Changes**:
   ```typescript
   // Added to outcome router
   deleteOutcome: protectedProcedure
     .input(z.object({ id: z.string() }))
     .mutation(deleteOutcome),
   
   deleteOutcomes: protectedProcedure
     .input(z.object({ ids: z.array(z.string()) }))
     .mutation(deleteOutcomes),
   ```

2. **Frontend Changes**:
   - Delete button (trash icon) on each outcome row
   - Bulk edit mode with checkboxes
   - Select all functionality
   - Bulk delete with confirmation
   - Success/error notifications
   - Optimistic UI updates

3. **Security Features**:
   - Authorization checks ensuring users can only delete their own outcomes
   - Proper error handling and user feedback
   - Loading states during operations

## Claude Code Custom Commands

We've created six custom commands to streamline worktree management:

### 1. `/create-feature-worktree <name>`
Creates a new worktree with complete setup:
```bash
# Example
/create-feature-worktree user-authentication

# This will:
# 1. Create branch: feature/user-authentication
# 2. Create worktree at: .worktrees/user-authentication
# 3. Copy .env and .env.local files
# 4. Install dependencies
# 5. Provide next steps
```

### 2. `/setup-worktree <name>`
Sets up an existing worktree (useful after cloning or when dependencies are missing):
```bash
/setup-worktree outcomes-delete
```

### 3. `/list-worktrees`
Shows all worktrees with their status:
```bash
/list-worktrees

# Output includes:
# - Worktree paths and branches
# - Uncommitted changes
# - Dependency status
# - Environment file status
```

### 4. `/cleanup-worktree <name>`
Safely removes a worktree:
```bash
/cleanup-worktree outcomes-delete

# Safety checks:
# - Warns about uncommitted changes
# - Checks if branch is merged
# - Prevents accidental data loss
```

### 5. `/switch-worktree <name>`
Helps navigate between worktrees:
```bash
/switch-worktree user-authentication
```

### 6. `/worktree-dev <name> [port]`
Runs development server in a specific worktree:
```bash
/worktree-dev outcomes-delete 3001
```

## Step-by-Step Workflow

### 1. Starting a New Feature

```bash
# Create a new worktree for your feature
/create-feature-worktree my-awesome-feature

# Navigate to the worktree
cd .worktrees/my-awesome-feature

# Start development server
npm run dev -- -p 3001
```

### 2. Development Process

```bash
# Make your changes
# Edit files as normal

# Commit changes
git add .
git commit -m "feat: implement awesome feature"

# Run tests and linting
npm run check
```

### 3. Testing Multiple Features

You can run multiple worktrees simultaneously:
```bash
# Terminal 1: Main application
npm run dev  # http://localhost:3000

# Terminal 2: Feature 1
cd .worktrees/feature-1 && npm run dev -- -p 3001

# Terminal 3: Feature 2
cd .worktrees/feature-2 && npm run dev -- -p 3002
```

### 4. Pushing and Creating PR

```bash
# Push your branch
git push -u origin feature/my-awesome-feature

# Create PR using GitHub CLI
gh pr create
```

### 5. After PR is Merged

```bash
# Clean up the worktree
/cleanup-worktree my-awesome-feature

# Update main branch
git checkout main
git pull origin main
```

## Common Gotchas

### 1. Environment Variables
**Problem**: Each worktree needs its own `.env` file  
**Solution**: Always use `/setup-worktree` or copy manually when env vars change
```bash
cp .env .worktrees/my-feature/
```

### 2. Dependency Synchronization
**Problem**: Package updates in main don't automatically sync to worktrees  
**Solution**: Run `bun install` in worktrees after package updates
```bash
cd .worktrees/my-feature && bun install
```

### 3. Database Migrations
**Problem**: All worktrees share the same database  
**Solution**: Be careful with migrations; consider using migration branches
```bash
# Always ask before running migrations in worktrees
# Never run: npx prisma db push (data loss risk!)
```

### 4. Port Conflicts
**Problem**: Can't run multiple dev servers on the same port  
**Solution**: Use consistent port numbering:
- Main: 3000
- Worktree 1: 3001
- Worktree 2: 3002

### 5. Branch Checkout Conflicts
**Problem**: "fatal: 'branch' is already used by worktree"  
**Solution**: A branch can only be checked out in one place. Use `/list-worktrees` to find it.

## Troubleshooting

### "Next.js package not found" Error
```bash
# Solution 1: Setup the worktree
/setup-worktree feature-name

# Solution 2: Manual install
cd .worktrees/feature-name && bun install
```

### Missing Environment Variables
```bash
# Check if .env exists
ls -la .worktrees/feature-name/.env

# Copy from main if missing
cp .env .worktrees/feature-name/
```

### Type Errors After Package Updates
```bash
# Update all active worktrees
for dir in .worktrees/*/; do
  echo "Updating $dir"
  (cd "$dir" && bun install)
done
```

### Disk Space Issues
```bash
# Check worktree sizes
du -sh .worktrees/*

# Remove unused worktrees
/cleanup-worktree old-feature
```

## Best Practices

### 1. Naming Conventions
- Use descriptive feature names: `user-auth`, `payment-integration`
- Avoid generic names: `fix`, `update`, `test`

### 2. Regular Cleanup
- Remove worktrees immediately after PR merge
- Run `/list-worktrees` weekly to identify stale worktrees

### 3. Documentation
- Document special setup requirements in the worktree
- Update team on active worktrees in standups

### 4. Resource Management
- Limit active worktrees to 3-4 maximum
- Monitor memory usage when running multiple dev servers

### 5. Git Hygiene
- Keep worktree branches up-to-date with main
- Use conventional commit messages

## Critical Analysis

### Strengths

1. **Developer Productivity**
   - Eliminates context switching overhead
   - Enables true parallel development
   - Preserves mental model across features

2. **Testing Capabilities**
   - Test feature interactions before merging
   - Run A/B comparisons easily
   - Isolate experimental changes

3. **Automation**
   - Claude Code commands reduce setup friction
   - Consistent environment across worktrees
   - Reduced human error in setup

### Weaknesses and Risks

1. **Resource Consumption**
   - Each worktree duplicates `node_modules` (~500MB-1GB)
   - Multiple dev servers consume significant RAM
   - No built-in resource monitoring

2. **Synchronization Complexity**
   - Manual env variable propagation
   - Package updates need coordination
   - Global config changes affect all worktrees

3. **Database Conflicts**
   - Shared database state can cause issues
   - Migration conflicts between worktrees
   - No isolation for database changes

4. **Missing Safeguards**
   - No disk space checks before creation
   - Limited protection for uncommitted changes
   - No automatic cleanup mechanisms

5. **Security Considerations**
   - `.env` file proliferation
   - Potential for sensitive data in multiple locations
   - No audit trail for worktree access

## Future Improvements

### 1. Resource Management
```bash
# Add to /create-feature-worktree
- Check available disk space (need at least 2GB)
- Warn if >3 worktrees already exist
- Show estimated resource usage
```

### 2. Synchronization Tools
```bash
# New command: /sync-worktrees
- Update all worktrees with latest packages
- Sync environment variables
- Apply global config changes
```

### 3. Database Isolation
```javascript
// Consider per-worktree database schemas
DATABASE_URL="postgresql://...?schema=worktree_${WORKTREE_NAME}"
```

### 4. Monitoring Dashboard
```bash
# New command: /worktree-dashboard
- Show all worktrees with resource usage
- Display last activity time
- Highlight stale worktrees for cleanup
```

### 5. Automated Cleanup
```bash
# Add scheduled cleanup
- Remove worktrees unused for >30 days
- Archive worktrees from merged PRs
- Send cleanup reminders
```

### 6. Team Collaboration
```bash
# New command: /share-worktree
- Generate shareable worktree config
- Include setup instructions
- Export/import worktree state
```

### 7. Enhanced Safety
```bash
# Add to all destructive commands
- Backup uncommitted changes
- Create restoration points
- Implement undo functionality
```

## Conclusion

Git worktrees provide powerful capabilities for parallel development, but require discipline and understanding of their limitations. The Claude Code commands we've created significantly reduce the friction of worktree management, making this workflow accessible to the entire team.

Remember: with great power comes great responsibility. Use worktrees wisely, clean up after yourself, and always be mindful of resource consumption.

---

*Last updated: [Current Date]*  
*For questions or improvements, please open an issue or submit a PR.*