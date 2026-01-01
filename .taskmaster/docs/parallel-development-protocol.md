# Parallel Development Protocol Using Git Worktrees and Taskmaster Tags

## Overview

This protocol establishes the standard procedure for running parallel development workflows on the same codebase using Git worktrees and Taskmaster tags. This enables multiple developers (or AI assistants) to work on different features simultaneously without code conflicts.

## Use Cases

- Working on a new feature while maintaining existing code
- Running multiple Claude Code instances for parallel AI development
- Separating experimental work from stable development
- Managing complex multi-feature development cycles

## Prerequisites

- Git repository with clean working tree (no uncommitted changes)
- Taskmaster installed and initialized in the repository
- Sufficient disk space for duplicate node_modules (~500MB per worktree)
- Understanding of Git branches and Taskmaster tags

## Protocol Steps

### Step 1: Pre-Flight Checklist

Before creating a worktree, ensure:

```bash
# 1. Check for uncommitted changes
git status

# 2. If changes exist, either commit or stash them:
git add -A && git commit -m "WIP: Current work state"
# OR
git stash push -m "Work in progress before worktree creation"

# 3. Verify no existing worktrees
git worktree list
```

### Step 2: Create Taskmaster Tag for New Work Stream

```bash
# Create a new tag for the parallel work
task-master add-tag <feature-name> --description="<Feature description>"

# Example:
task-master add-tag whatsapp --description="WhatsApp integration development"
```

### Step 3: Create Git Worktree

```bash
# Create worktree with new branch
git worktree add ../<project-name>-<feature> -b feature/<feature-name>

# Example:
git worktree add ../todo-whatsapp -b feature/whatsapp-integration

# This creates:
# /path/to/project (main branch, original tag)
# /path/to/project-feature (new branch, new tag)
```

### Step 4: Set Up New Worktree Environment

```bash
# Navigate to new worktree
cd ../<project-name>-<feature>

# Copy environment variables
cp ../<project-name>/.env .

# Install dependencies
bun install
# OR
npm install
# OR
yarn install

# Copy any other necessary config files
# Examples: .env.local, config.json, etc.
```

### Step 5: Configure Taskmaster in New Worktree

```bash
# In the new worktree, switch to the appropriate tag
task-master use-tag <feature-name>

# Verify correct tag is active
task-master list-tags
```

### Step 6: Open Development Environments

**For Main Development:**
```bash
cd /path/to/project
code .  # or cursor .
claude  # if using Claude Code
task-master use-tag master
```

**For Feature Development:**
```bash
cd /path/to/project-feature
code .  # or cursor .
claude  # if using Claude Code
task-master use-tag <feature-name>
```

## Important Considerations

### Shared Resources

The following files/directories are shared between worktrees:
- `.taskmaster/` directory (including tasks.json)
- Git hooks
- Git configuration

### Isolated Resources

Each worktree has its own:
- Working directory files
- Node modules
- Build artifacts
- Git index (staging area)
- Currently checked out branch

### Best Practices

1. **Always commit or stash** before creating worktrees
2. **Use descriptive branch names** that match the Taskmaster tag
3. **Keep tags synchronized** with the branch purpose
4. **Don't modify shared resources** without coordination
5. **Communicate database schema changes** between parallel workers

### Potential Issues and Solutions

| Issue | Solution |
|-------|----------|
| Uncommitted changes block worktree creation | Commit or stash changes first |
| Missing dependencies in new worktree | Run package manager install |
| Environment variables missing | Copy .env file from main worktree |
| Taskmaster shows wrong tasks | Switch to correct tag with `task-master use-tag` |
| Database migration conflicts | Coordinate schema changes between teams |
| Memory/CPU usage high | Close unnecessary applications |

## Database Considerations

When working with database changes:

1. **Coordinate migrations** between worktrees
2. **Use separate database branches** if possible
3. **Communicate schema changes** immediately
4. **Test migrations** before merging

## Cleanup Procedures

When feature development is complete:

```bash
# 1. Merge feature branch
git checkout main
git merge feature/<feature-name>

# 2. Remove worktree
git worktree remove ../<project-name>-<feature>

# 3. Delete feature branch
git branch -d feature/<feature-name>

# 4. Optionally remove Taskmaster tag
task-master delete-tag <feature-name>
```

## Example Workflow

```bash
# Main developer working on authentication
cd /Users/dev/project
task-master use-tag master
# Working on auth tasks...

# Parallel developer working on WhatsApp integration
cd /Users/dev/project-whatsapp
task-master use-tag whatsapp
# Working on WhatsApp tasks...

# Both can work simultaneously without conflicts
```

## Emergency Procedures

If worktrees become corrupted:

```bash
# Force remove worktree
git worktree remove --force <path>

# Prune worktree list
git worktree prune

# Verify clean state
git worktree list
```

## Benefits of This Approach

1. **True parallel development** - No branch switching needed
2. **Isolated environments** - Each worktree is independent
3. **Shared task management** - Taskmaster tags keep tasks organized
4. **No merge conflicts** - Work on different branches
5. **Flexible workflow** - Easy context switching

## Conclusion

This protocol enables efficient parallel development while maintaining code quality and preventing conflicts. By combining Git worktrees with Taskmaster tags, teams can maximize productivity and work on multiple features simultaneously.

---

*Protocol Version: 1.0*  
*Last Updated: [Current Date]*  
*Next Review: [Quarterly]*