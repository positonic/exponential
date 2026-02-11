# Worktree Agent

> Safety instructions for an AI agent working inside a git worktree while another session is active in the main directory.

## Usage

A **global version** of this prompt is available as a Claude Code skill at `~/.claude/skills/worktree-agent/SKILL.md`. In any project, just run `/worktree-agent` to load the safety rules.

This project-specific version adds exponential-specific rules (Prisma, database safety). Load it by telling Claude:

```
Read .claude/prompts/worktree-agent.md and follow those rules for this session.
```

Or paste the section below directly into a new session.

---

## System / Role Prompt

You are working inside a **git worktree**, not the main project directory. Another developer or AI agent is actively working in the main directory at the same time. Your actions must be scoped to avoid interfering with their work.

## Your Environment

- **Main project directory**: The parent repo (DO NOT modify files there)
- **Your worktree**: `.worktrees/<name>/` — all your work happens here
- **Shared resources**: Git history, database, and remote origin are shared across all worktrees

Before starting any work, confirm:
1. Your current working directory is inside the worktree
2. `git status` shows the expected branch
3. Dependencies are installed (`node_modules/` exists)

## Rules

### NEVER DO — These affect shared state and will break the other session

- `git checkout` or `git switch` — branches are locked to their worktree
- `git stash` — stashes are shared across all worktrees
- `git rebase` or `git merge` on any branch you don't own
- `git reset --hard` — affects shared ref history
- `git push --force` on any branch
- `npx prisma db push` — FORBIDDEN, causes data loss (see CLAUDE.md)
- `npx prisma migrate dev` — ask the user first; migrations affect the shared database
- Edit, read, or reference files outside your worktree directory
- Run `npm run dev` on port 3000 (reserved for the main directory)
- Delete or modify `.env` files in the main directory

### SAFE TO DO — These are scoped to your worktree

- Edit files within your worktree directory
- `git add`, `git commit`, `git push -u origin <your-branch>` for your branch only
- `npm install` within your worktree
- `npm run check`, `npm run lint`, `npm run typecheck`
- `npm run dev -- -p 3001` (use 3001, 3002, etc. — never 3000)
- `npx prisma generate` (client generation is local to node_modules)
- `gh pr create` for your branch
- Read the main project's `CLAUDE.md` for coding standards (but don't edit it)

### Database Awareness

All worktrees share the same PostgreSQL database. This means:
- Your schema changes are immediately visible to the other session
- Never run migrations without asking the user
- If you need schema changes, document them and flag to the user
- Prefer additive changes (new columns/tables) over destructive ones

### Port Convention

| Directory | Port |
|-----------|------|
| Main project | 3000 (reserved) |
| First worktree | 3001 |
| Second worktree | 3002 |
| Third worktree | 3003 |

Pick a port and use it consistently for your session.

### Git Workflow

1. Make changes within your worktree only
2. Commit to your branch with descriptive messages
3. Push with `git push -u origin <branch-name>`
4. Create a PR with `gh pr create` when ready
5. Let the user handle merging and cleanup

## Constraints

- Always follow the coding standards in the project's `CLAUDE.md` (no hardcoded colors, use `npm run check`, etc.)
- Do not over-engineer — keep changes focused on your assigned task
- If you encounter a conflict with the shared database or another branch, stop and ask the user
- If you are unsure whether an action affects shared state, ask before proceeding

## Output Style

- When starting work, confirm your worktree path and branch
- Flag any shared-state concerns immediately
- At the end of a session, summarize what was committed and whether anything needs the user's attention (migrations, PR review, etc.)
