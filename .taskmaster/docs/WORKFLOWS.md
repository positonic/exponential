# Task Master Workflows & Best Practices

This guide covers practical workflows for using Task Master effectively with Claude Code, from project initialization to daily development patterns.

## 🚀 Quick Start Workflows

### 1. New Project Setup
**When**: Starting a fresh project with Task Master
```bash
# Initialize Task Master
task-master init

# Create PRD document
# Edit .taskmaster/docs/prd.txt with your requirements

# Parse PRD into tasks
task-master parse-prd .taskmaster/docs/prd.txt --research

# Analyze and expand complex tasks
task-master analyze-complexity --research
task-master expand --all --research
```

### 2. Daily Development Flow
**When**: Regular development sessions
```bash
# Start your day
/project:tm/next plan        # Get next task with planning phase
# or
task-master next             # CLI alternative

# Work on the task
/project:tm/set-status/to-in-progress <id>
# ... implement ...
/project:tm/set-status/to-done <id>

# Quick status check
task-master list             # See all tasks
task-master status          # Project dashboard
```

## 📋 Core Workflows

### Planning-First Development
**Best for**: Complex features, architectural changes, tasks with complexity > 7
```bash
1. /project:tm/next plan              # Get task with planning
2. Review generated plan
3. Update task with refined plan
4. Begin implementation
5. Update subtasks as you progress
```

### Rapid Implementation
**Best for**: Simple tasks, bug fixes, well-defined features
```bash
1. task-master next                   # Get next task
2. task-master set-status --id=<id> --status=in-progress
3. Implement directly
4. task-master set-status --id=<id> --status=done
```

### Batch Processing
**Best for**: Clearing backlogs, similar tasks, refactoring
```bash
# Automated implementation of all tasks
/project:tm/workflows/auto-implement-all-tasks

# Or headless mode
claude --no-interactive -p "Execute /project:tm/workflows/auto-implement-all-tasks"
```

## 🎯 Specialized Workflows

### 1. Research-Heavy Features
**When**: Implementing unfamiliar technology or complex integrations
```bash
# Add task with research
task-master add-task --prompt="implement OAuth integration" --research

# Expand with research context
task-master expand --id=<id> --research --force

# Update with findings
task-master update-subtask --id=<id> --prompt="research findings..."
```

### 2. Dependency Management
**When**: Tasks have complex interdependencies
```bash
# Check dependency health
task-master validate-dependencies

# Add dependencies
task-master add-dependency --id=<id> --depends-on=<other-id>

# View dependency chain
task-master show <id>  # Shows dependencies
```

### 3. Sprint Planning
**When**: Planning weekly/bi-weekly work
```bash
# Get complexity overview
task-master analyze-complexity
task-master complexity-report

# Expand high-complexity tasks
task-master expand --id=<complex-task-id> --num=5

# Reorder tasks
task-master move --from=<id> --to=<new-position>
```

### 4. Multi-Context Development
**When**: Working on different features/branches simultaneously
```bash
# Create context-specific tags
task-master add-tag --name=feature-auth --copyFromCurrent
task-master add-tag --name=bugfixes

# Switch contexts
task-master use-tag feature-auth
task-master list  # Shows only auth tasks

# Work in different terminals/worktrees
cd ../project-auth-worktree
task-master use-tag feature-auth
```

## 💡 Advanced Patterns

### Progressive Task Refinement
```bash
1. Create high-level task
   task-master add-task --prompt="create user dashboard"

2. Analyze complexity
   task-master analyze-complexity --ids=<id>

3. Expand based on complexity
   task-master expand --id=<id> --num=<suggested-number>

4. Refine subtasks
   task-master update-subtask --id=<id.1> --prompt="additional requirements..."
```

### Continuous Documentation
```bash
# During implementation
task-master update-subtask --id=<id> --prompt="Implemented X using Y approach"

# After completing module
task-master update-task --id=<id> --prompt="Module complete, key decisions..."

# Export for team
task-master sync-readme
```

### Error Recovery Workflow
```bash
# Task blocked or failed
task-master set-status --id=<id> --status=blocked
task-master add-task --prompt="investigate blocker for task <id>"

# After resolution
task-master set-status --id=<blocker-id> --status=done
task-master set-status --id=<original-id> --status=in-progress
```

## 🔄 Integration Workflows

### Git + Task Master
```bash
# Branch per task
git checkout -b task-<id>-description

# Commit with task reference
git commit -m "feat: implement user auth (task #<id>)"

# PR description
gh pr create --body "Implements task #<id>: <description>"
```

### CI/CD Integration
```bash
# In CI pipeline
./auto-implement-all-tasks.sh test  # Dry run

# Nightly automation
0 2 * * * cd /project && ./auto-implement-all-tasks.sh
```

### Team Collaboration
```bash
# Morning sync
task-master status > daily-status.md
task-master list --status=in-progress

# Task assignment (via tags)
task-master add-tag --name=team-frontend
task-master move --from=<id> --to=<frontend-section>
```

## 📊 Reporting Workflows

### Progress Tracking
```bash
# Weekly review
task-master list --status=done  # Completed this week
task-master complexity-report    # Remaining complexity

# Generate reports
task-master sync-readme
git commit -m "docs: update task progress"
```

### Stakeholder Updates
```bash
# Export current state
task-master generate
task-master sync-readme

# Create summary
/project:tm/utils/analyze-project
```

## 🎨 Workflow Customization

### Custom Command Chains
Create `.claude/commands/my-workflow.md`:
```markdown
Execute my custom workflow for feature development:

1. Get next high-priority task
2. Create feature branch
3. Run planning phase
4. Set up test structure
5. Begin implementation
```

### Automated Workflows
```bash
# Morning routine
alias tm-morning='task-master status && task-master next'

# End of day
alias tm-eod='task-master list --status=in-progress && git status'
```

## 🚫 Anti-Patterns to Avoid

1. **Skipping Planning** on complex tasks (> 7 complexity)
2. **Not Updating Tasks** with implementation details
3. **Ignoring Dependencies** when reordering tasks
4. **Working on Blocked Tasks** without resolving blockers
5. **Manual Task File Editing** (always use commands)

## 🔑 Key Principles

1. **Plan Before Coding**: Use `/project:tm/next plan` for complex tasks
2. **Document as You Go**: Update tasks/subtasks with learnings
3. **Respect Dependencies**: Check before starting new tasks
4. **Automate Repetitive Work**: Use batch commands for similar tasks
5. **Maintain Context**: Use tags for multi-feature development

## 🆘 Quick Reference

**Start Work**: `task-master next`
**Plan First**: `/project:tm/next plan`
**Quick Status**: `task-master list`
**Mark Done**: `task-master set-status --id=<id> --status=done`
**Get Help**: `task-master help`

---

Remember: Task Master is designed to reduce friction in your development workflow. Choose the workflow that matches your current context and complexity needs.