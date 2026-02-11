# Claude Agent Prompts

This directory contains reusable system prompts for specialized Claude agents. Each prompt defines a specific persona, methodology, and output format that can be loaded into a new Claude session.

## What This Directory Is For

Agent prompts are pre-configured "personalities" that give Claude specific expertise, constraints, and workflows. Unlike slash commands (which execute actions), these prompts transform Claude into a specialized consultant or analyst for the duration of a session.

Use cases:
- **Strategic analysis** - Product strategy, market positioning, competitive analysis
- **Technical reviews** - Architecture reviews, code audits, security assessments
- **Creative work** - Copywriting, content strategy, brand voice development
- **Research** - User research synthesis, literature reviews, trend analysis

## Available Agents

| Agent | File | Purpose |
|-------|------|---------|
| Product Strategist | [product-strategist.md](./product-strategist.md) | Sense-making for early-stage products. Builds mental models, identifies value propositions, assesses narrative readiness. |
| Worktree Agent | [worktree-agent.md](./worktree-agent.md) | Safety rules for AI agents working inside a git worktree while another session is active in the main directory. |

## How to Use an Agent Prompt

### Method 1: Copy-Paste (Recommended for External Sessions)

1. Open the agent prompt file (e.g., `product-strategist.md`)
2. Copy the entire content starting from "## System / Role Prompt"
3. Start a new Claude session (Claude.ai, API, or Claude Code)
4. Paste the prompt as your first message
5. Follow with your actual request/inputs

### Method 2: Reference in Claude Code

In Claude Code, you can reference these prompts directly:

```
Please read .claude/prompts/product-strategist.md and adopt that persona for this session. Then analyze the following documentation...
```

### Method 3: Create a Slash Command (For Frequent Use)

Create a command file at `.claude/commands/strategist.md`:

```markdown
Load the product strategist agent and analyze: $ARGUMENTS

1. Read and adopt the persona from `.claude/prompts/product-strategist.md`
2. Apply the full 8-step analysis framework to the provided inputs
3. Ensure all sections are completed without skipping steps
```

Then invoke with: `/strategist [your inputs or file references]`

## Creating New Agent Prompts

### Template

```markdown
# [Agent Name]

> One-line description of the agent's purpose.

## Usage

Brief instructions on how to use this agent.

---

## System / Role Prompt

You are a [role description].

Your mandate is [core purpose].

You specialize in:
- [Specialty 1]
- [Specialty 2]
- [Specialty 3]

You think in terms of:
- [Mental model 1]
- [Mental model 2]

You are comfortable saying:
- [Honest statement 1]
- [Honest statement 2]

## Objective

[What the user is trying to accomplish with this agent]

## Inputs You Will Receive

[What kind of materials/context the user will provide]

## Your Tasks

### 1. [First Task]
[Detailed instructions]

### 2. [Second Task]
[Detailed instructions]

[Continue for all tasks...]

## Constraints

- [Constraint 1]
- [Constraint 2]

## Output Style

- [Style guideline 1]
- [Style guideline 2]

Assume your audience is:
- [Audience 1]
- [Audience 2]
```

### Best Practices for Agent Prompts

1. **Be specific about the mandate** - What is this agent trying to accomplish?
2. **Define the persona clearly** - What expertise does this agent have?
3. **Structure the workflow** - Break complex analysis into numbered steps
4. **Include constraints** - What should the agent avoid doing?
5. **Specify output format** - What should the final deliverable look like?
6. **Name uncomfortable truths** - What honest things should the agent be willing to say?

### Naming Convention

- Use lowercase with hyphens: `product-strategist.md`, `code-reviewer.md`
- Be descriptive but concise
- Avoid generic names like `helper.md` or `assistant.md`

## Ideas for Future Agents

- `homepage-optimizer.md` - Takes strategist output and generates landing page copy
- `technical-writer.md` - Converts complex systems into clear documentation
- `user-researcher.md` - Synthesizes interview transcripts into insights
- `code-architect.md` - Reviews system design and suggests improvements
- `competitive-analyst.md` - Analyzes market landscape and positioning

## Relationship to Other `.claude` Directories

| Directory | Purpose |
|-----------|---------|
| `prompts/` | Reusable personas/agents (this directory) |
| `commands/` | Slash commands that execute actions |
| `agents/` | Agent definitions for Task tool subagents |
| `templates/` | Boilerplate files and setup scripts |
