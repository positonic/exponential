---
title: CLI reference
description: Every command of the exponential command-line tool, generated from the CLI itself, with how to install it and sign in
section: developers
order: 3
icon: IconTerminal2
---

The `exponential` command-line tool gives you, your scripts and your agents the same objects the app has: actions, projects, goals and OKRs, meetings, decisions, products, tickets, features, epics, pages, CRM contacts, deals and time entries. Every command prints readable output in a terminal and JSON when piped or given `--json`, so it works as well inside an agent's shell as in yours.

## Where to find it

The tool is the `exponential-cli` package on npm; its source is at [github.com/positonic/exponential-cli](https://github.com/positonic/exponential-cli). It talks to whatever installation you point it at.

## How to install and sign in

1. Install it globally:

   ```bash
   npm install -g exponential-cli
   ```

2. Create a **JWT Token** under [Settings → API keys](/settings/api-keys) (see [API tokens](/docs/developers/api-tokens)). An [external agent](/docs/developers/external-agents) uses its own `exp_agent_` key instead, and everything it does is attributed to the agent.
3. Sign in, naming the address you open Exponential at:

   ```bash
   exponential auth login --token <your token> --api-url https://<your-exponential-host>
   ```

4. Check it worked:

   ```bash
   exponential auth status
   ```

Credentials are stored in your home directory. `exponential auth logout` removes them.

## How to read this reference

- Every command group is a section below; every subcommand shows its usage line, arguments and options. The tables are generated from the CLI's own definitions, so they match the version named at the top of the reference.
- Most list and create commands take `--workspace <slug|id>`; product-scoped commands (`tickets`, `features`) take `--product <slug|id>` and need `--workspace` when the product is given by slug. Ids are CUIDs; a ticket can also be addressed by its short id.
- Add `--json` (or pipe the output) for machine-readable output.

## How it connects

- **API tokens** — the key the CLI signs in with: [API tokens](/docs/developers/api-tokens).
- **External agents** — agent-owned keys and attribution: [External agents](/docs/developers/external-agents).
- **Time tracking** — worked examples of `time log`, `time list` and `time confirm`: [Time tracking](/docs/do/time-tracking).

## FAQ

**The reference is behind the CLI I installed.**
Run `npm install -g exponential-cli@latest`; the version this page was generated from is stated at the top of the reference. To regenerate the page, run `npm run docs:cli` in the Exponential repository with `EXPONENTIAL_CLI_DIR` pointing at a CLI checkout.

**Can I use it against a self-hosted installation?**
Yes. Pass that installation's address to `--api-url` when you sign in.

## Commands

<!-- AUTO-GENERATED: everything below is written by scripts/generate-cli-docs.ts — do not edit by hand -->

_Generated from exponential-cli 1.18.1._

| Command | What it does |
|---|---|
| [`auth`](#auth) | Authentication commands |
| [`actions`](#actions) | Manage actions/tasks |
| [`contacts`](#contacts) | Manage CRM contacts |
| [`decisions`](#decisions) | Log and manage decisions and open questions (the workspace Decision Log). |
| [`deals`](#deals) | Manage pipeline deals |
| [`epics`](#epics) | Manage epics. Epics are workspace-scoped and group actions and tickets across products. |
| [`features`](#features) | Manage features. A feature lives under a product and groups user stories, scopes, and tickets. |
| [`labels`](#labels) | Manage labels (orthogonal tags applied to actions, tickets, features, and epics). |
| [`meetings`](#meetings) | Manage meetings and their notes (recorded, imported, or manually created) |
| [`organizations`](#organizations) | Manage CRM organizations |
| [`pages`](#pages) | Manage Knowledge pages (PRDs, research, technical specs). Link one to a feature with "features link-page". |
| [`products`](#products) | Manage products. A workspace contains products; a product holds features and tickets. |
| [`projects`](#projects) | Manage projects |
| [`search`](#search) | Global search across projects, actions, goals, workspaces and more — same coverage as the app's Cmd+K palette |
| [`tickets`](#tickets) | Manage product backlog tickets. Tickets live under a product, link to features/epics, depend on each other, and can be implemented via actions. |
| [`time`](#time) | Time entries — log the day's work and list it. Run with an external-agent key, the entry belongs to the agent's OWNER and is always PROPOSED; a personal token logs your own time, CONFIRMED by default. |
| [`workspaces`](#workspaces) | Manage workspaces |
| [`goals`](#goals) | Manage goals (objectives) and their key results. Objectives have integer ids; key results are CUIDs. |
| [`okrs`](#okrs) | OKRs — objectives with their key results nested. Manage the parts with `goals` and `goals kr`. |

## `auth`

Authentication commands

### `auth login`

Configure CLI with your API token

```bash
exponential auth login [options]
```

| Option | Description |
|---|---|
| `--token <token>` | JWT token from /settings/api-keys |
| `--api-url <url>` | API URL (e.g., https://www.exponential.im) |

### `auth logout`

Remove stored credentials

```bash
exponential auth logout [options]
```

### `auth whoami`

Show current authentication status

```bash
exponential auth whoami [options]
```

### `auth show`

Print parts of the current credentials. Use --token to print the raw JWT (for piping into other tools, e.g. `gh secret set EXPONENTIAL_TOKEN < <(exponential auth show --token)`).

```bash
exponential auth show [options]
```

| Option | Description |
|---|---|
| `--token` | Print the raw JWT to stdout with no trailing newline |

### `auth status`

Show detailed authentication status

```bash
exponential auth status [options]
```

## `actions`

Manage actions/tasks

### `actions list`

List all actions

```bash
exponential actions list [options]
```

| Option | Description |
|---|---|
| `--project <id>` | Filter by project ID |
| `--status <status>` | Filter by kanban status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE) |
| `--assignee <id>` | Filter by assignee ID |

### `actions today`

What's on your plate: overdue, today, and inbox

```bash
exponential actions today [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Filter by workspace ID |
| `--due-only` | Only actions whose dueDate is today (the pre-1.8 shape — excludes overdue) |

### `actions overdue`

Why the overdue pile is that size: bulk-created cohorts vs real debt

```bash
exponential actions overdue [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Filter by workspace ID |

### `actions defer`

Amnesty: clear dates so actions fall back to their project backlog untimed

```bash
exponential actions defer [options]
```

| Option | Description |
|---|---|
| `--ids <ids>` | Comma-separated action IDs |

### `actions reschedule`

Move actions to a new do-date (use "actions defer" if they were never really due)

```bash
exponential actions reschedule [options]
```

| Option | Description |
|---|---|
| `--ids <ids>` | Comma-separated action IDs |
| `--to <date>` | New do-date (YYYY-MM-DD, or "today") |

### `actions range`

Get actions by date range

```bash
exponential actions range [options]
```

| Option | Description |
|---|---|
| `--start <date>` | Start date (YYYY-MM-DD) |
| `--end <date>` | End date (YYYY-MM-DD) |
| `--workspace <id>` | Filter by workspace ID |

### `actions kanban`

Get kanban board actions

```bash
exponential actions kanban [options]
```

| Option | Description |
|---|---|
| `--project <id>` | Filter by project ID |
| `--status <status>` | Filter by kanban status |
| `--assignee <id>` | Filter by assignee ID |

### `actions update`

Update an existing action

```bash
exponential actions update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Action ID to update |
| `-n, --name <name>` | New action name |
| `-d, --description <text>` | New description |
| `-p, --project <id>` | Move to project ID |
| `--priority <priority>` | Priority (Quick, Scheduled, 1st Priority, etc.) |
| `--status <status>` | Status (ACTIVE, COMPLETED, CANCELLED) |
| `--kanban <status>` | Kanban status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE) |
| `--due <date>` | Due date (YYYY-MM-DD or "null" to clear) |
| `--scheduled-start <datetime>` | Do-date: when you plan to work on it (YYYY-MM-DD, ISO datetime, or "null" to clear). This is what /today partitions on. |
| `--scheduled-end <datetime>` | End of the time block (YYYY-MM-DD, ISO datetime, or "null" to clear) |

### `actions create`

Create a new action

```bash
exponential actions create [options]
```

| Option | Description |
|---|---|
| `-n, --name <name>` | Action name/title |
| `-d, --description <text>` | Action description |
| `-p, --project <id>` | Project ID to assign the action to |
| `--priority <priority>` | Priority (Quick, Scheduled, 1st Priority, etc.) |
| `--due <date>` | Due date (YYYY-MM-DD) |
| `--effort <minutes>` | Effort estimate in minutes |
| `--ticket <id>` | Link action to a product ticket (CUID) after creation |
| `--epic <id>` | Epic CUID to attach the action to |

### `actions upsert`

One Action per external source: find by (--workspace, --source-type, --source-id), refresh its title and links, else create it. The Daily worklog uses --source-type claude-session --source-id <conversation id>.

```bash
exponential actions upsert [options]
```

| Option | Description |
|---|---|
| `--source-type <type>` | e.g. claude-session |
| `--source-id <id>` | The source's own id; the same pair always maps to the same Action |
| `-t, --title <title>` | Action title (refreshed on every call) |
| `-w, --workspace <slug\|id>` | Workspace (defaults to your default workspace) |
| `-d, --description <text>` | Description |
| `--project <id>` | Link to a project CUID in the same workspace |
| `--ticket <id>` | Link to a ticket CUID whose product is in the same workspace |

### `actions comment`

Manage comments on an action

### `actions comment list`

List comments on an action

```bash
exponential actions comment list [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Action ID |

### `actions comment add`

Add a comment to an action

```bash
exponential actions comment add [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Action ID |
| `-m, --message <text>` | Comment content (markdown supported) |

### `actions comment update`

Update one of your own comments

```bash
exponential actions comment update [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |
| `-m, --message <text>` | New comment content |

### `actions comment delete`

Delete one of your own comments

```bash
exponential actions comment delete [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |

## `contacts`

Manage CRM contacts

### `contacts list`

List contacts

```bash
exponential contacts list [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Workspace ID |
| `--search <query>` | Search by name or email |
| `--tags <tags>` | Filter by tags (comma-separated) |
| `--organization <id>` | Filter by organization ID |
| `--limit <n>` | Max results to return |
| `--cursor <cursor>` | Pagination cursor |

### `contacts get`

Get a contact by ID

```bash
exponential contacts get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes | Contact ID |

| Option | Description |
|---|---|
| `--interactions` | Include interaction history |

### `contacts create`

Create a new contact

```bash
exponential contacts create [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Workspace ID |
| `--first-name <name>` | First name |
| `--last-name <name>` | Last name |
| `--email <email>` | Email address |
| `--phone <phone>` | Phone number |
| `--linkedin <url>` | LinkedIn URL |
| `--telegram <handle>` | Telegram handle |
| `--twitter <handle>` | Twitter/X handle |
| `--github <handle>` | GitHub username |
| `--bluesky <handle>` | Bluesky handle |
| `--about <text>` | About / bio |
| `--profile-type <type>` | Profile type |
| `--skills <skills>` | Skills (comma-separated) |
| `--tags <tags>` | Tags (comma-separated) |
| `--organization <id>` | Organization ID |
| `--organization-name <name>` | Organization name (find-or-create; ignored if --organization is set) |

### `contacts update`

Update an existing contact

```bash
exponential contacts update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Contact ID |
| `--first-name <name>` | First name |
| `--last-name <name>` | Last name |
| `--email <email>` | Email (use "null" to clear) |
| `--phone <phone>` | Phone (use "null" to clear) |
| `--linkedin <url>` | LinkedIn URL (use "null" to clear) |
| `--telegram <handle>` | Telegram handle (use "null" to clear) |
| `--twitter <handle>` | Twitter/X handle (use "null" to clear) |
| `--github <handle>` | GitHub username (use "null" to clear) |
| `--bluesky <handle>` | Bluesky handle (use "null" to clear) |
| `--about <text>` | About / bio |
| `--profile-type <type>` | Profile type |
| `--skills <skills>` | Skills (comma-separated) |
| `--tags <tags>` | Tags (comma-separated) |
| `--organization <id>` | Organization ID (use "null" to clear) |
| `--organization-name <name>` | Organization name (find-or-create; ignored if --organization is set) |

### `contacts delete`

Delete a contact

```bash
exponential contacts delete [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes | Contact ID |

### `contacts add-interaction`

Add an interaction to a contact

```bash
exponential contacts add-interaction [options]
```

| Option | Description |
|---|---|
| `--contact <id>` | Contact ID |
| `--type <type>` | Interaction type (EMAIL, TELEGRAM, PHONE_CALL, MEETING, NOTE, LINKEDIN, OTHER) |
| `--direction <dir>` | Direction (INBOUND, OUTBOUND) |
| `--subject <text>` | Subject line |
| `--notes <text>` | Notes |

### `contacts enrich`

Queue a web-search enrichment job for an existing contact (runs regardless of the workspace auto-enrich setting)

```bash
exponential contacts enrich [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes | Contact ID |

## `decisions`

Log and manage decisions and open questions (the workspace Decision Log).

An OPEN QUESTION is a decision with --status OPEN — there is no separate model, and that is exactly what a meeting's "Open questions" panel shows.

Statuses: OPEN (an open question) · PROPOSED · ACCEPTED · SUPERSEDED · DEPRECATED.
SUPERSEDED and DEPRECATED are reached with "decisions status", never at creation.

### `decisions list`

List decisions, newest decided first. Pass --status OPEN for open questions only. An OPEN QUESTION is a decision with --status OPEN — there is no separate model, and that is exactly what a meeting's "Open questions" panel shows.

```bash
exponential decisions list [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |
| `--meeting <id>` | One meeting's decisions and open questions (includes drafts if you can edit it) |
| `--status <status>` | Filter by status (repeatable): OPEN, PROPOSED, ACCEPTED, SUPERSEDED, DEPRECATED |
| `--source <source>` | Filter by source (repeatable): MEETING, MANUAL, AGENT |
| `--product <slug\|id>` | Filter by product, or "workspace" for decisions with no product |
| `--include-workspace-wide` | With --product: also include decisions that have no product |
| `--project <id>` | Filter by project CUID |
| `--search <text>` | Free-text over statement and body |
| `--number <n>` | One decision by its workspace sequence number (D-0003 is 3) |
| `--limit <n>` | Cap the rows returned (1-500) |
| `--adr <id>` | Decisions formalised as this ADR document |

### `decisions get`

Show one decision in full: body, evidence, deciders, chain and links

```bash
exponential decisions get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |

### `decisions create`

Log a decision, or an open question with --status OPEN. An OPEN QUESTION is a decision with --status OPEN — there is no separate model, and that is exactly what a meeting's "Open questions" panel shows. Bodies are Markdown: use --body-file <path> (or - for stdin) rather than a shell argument. Bulk: --from-file <path|-> takes a JSON array of decisions; the other flags become its defaults.

```bash
exponential decisions create [options]
```

| Option | Description |
|---|---|
| `-s, --statement <text>` | The decision, or the open question (max 500 chars) |
| `-b, --body <markdown>` | Markdown detail: context, alternatives, consequences |
| `--body-file <path>` | Read the body from a file ("-" = stdin) |
| `--status <status>` | OPEN (open question), PROPOSED (default) or ACCEPTED |
| `--source <source>` | MEETING, MANUAL or AGENT |
| `--meeting <id>` | Meeting (transcriptionSessionId) this came out of — needs edit access to it |
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |
| `--product <slug\|id>` | Link to a product |
| `--project <id>` | Link to a project CUID |
| `--goal <id>` | Link to a goal (integer id) |
| `--key-result <id>` | Link to a key result CUID |
| `--occurrence <id>` | Link to a ceremony occurrence CUID |
| `--decided-at <iso>` | When it was decided (e.g. 2026-09-10T14:00) |
| `--owner <userId>` | Owner user ID |
| `--decider <"Name <email>">` | Someone who made the decision (repeatable); external people need no account |
| `--evidence-file <path>` | JSON array of {turnIndex, text} transcript quotes ("-" = stdin). Needs --meeting: the server checks every quote against that transcript and silently drops the ones that do not match. |
| `--from-file <path>` | Bulk create from a JSON array of decisions ("-" = stdin) |

### `decisions update`

Update a decision's content and scope; only the fields you pass are written. Status changes go through "decisions status".

```bash
exponential decisions update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Decision CUID |
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |
| `-s, --statement <text>` | New statement |
| `-b, --body <markdown>` | New Markdown body (or "null" to clear) |
| `--body-file <path>` | Read the new body from a file ("-" = stdin) |
| `--decided-at <iso>` | When it was decided (or "null" to clear) |
| `--owner <userId>` | Owner user ID (or "null" to clear) |
| `--product <slug\|id>` | Product (or "null" to detach) |
| `--project <id>` | Project CUID (or "null" to detach) |
| `--goal <id>` | Goal integer id (or "null" to detach) |
| `--key-result <id>` | Key result CUID (or "null" to detach) |
| `--adr <id>` | ADR document CUID (or "null" to detach) |

### `decisions status`

Move a decision through its lifecycle — including answering an open question by moving it from OPEN to ACCEPTED.

```bash
exponential decisions status [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Decision CUID |
| `--status <status>` | OPEN, PROPOSED, ACCEPTED, SUPERSEDED or DEPRECATED |
| `--superseded-by <id>` | The decision that replaced this one (with --status SUPERSEDED) |
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |

### `decisions link`

Record what implements a decision: a ticket or a feature. Idempotent.

```bash
exponential decisions link [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Decision CUID |
| `--ticket <id>` | Ticket CUID |
| `--feature <id>` | Feature CUID |
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |

### `decisions unlink`

Remove one "implemented by" link. Takes the LINK id (shown by "decisions get"), not the ticket or feature id.

```bash
exponential decisions unlink [options]
```

| Option | Description |
|---|---|
| `--link <id>` | DecisionLink CUID |
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |

### `decisions draft`

Review decisions an agent proposed but nobody has confirmed yet (visible only on their source meeting)

### `decisions draft extract`

Propose draft decisions from a meeting's notes and transcript, for someone to confirm. Idempotent: existing drafts are returned rather than regenerated, and a meeting that already has confirmed decisions is left alone.

```bash
exponential decisions draft extract [options]
```

| Option | Description |
|---|---|
| `--meeting <id>` | Meeting CUID (transcriptionSessionId) |

### `decisions draft confirm`

Publish a draft decision into the log

```bash
exponential decisions draft confirm [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Decision CUID |
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |

### `decisions draft reject`

Reject a draft. A confirmed decision is never rejected — deprecate or supersede it with "decisions status".

```bash
exponential decisions draft reject [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Decision CUID |
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |

### `decisions draft delete`

Permanently delete a draft or rejected decision. Confirmed decisions are never deleted.

```bash
exponential decisions draft delete [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Decision CUID |
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |

## `deals`

Manage pipeline deals

### `deals pipeline`

Get pipeline overview with stages

```bash
exponential deals pipeline [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Workspace ID |

### `deals stages`

List pipeline stages

```bash
exponential deals stages [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Workspace ID |

### `deals list`

List all deals

```bash
exponential deals list [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Workspace ID |

### `deals get`

Get a deal by ID

```bash
exponential deals get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes | Deal ID |

### `deals create`

Create a new deal

```bash
exponential deals create [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Workspace ID |
| `--stage <id>` | Pipeline stage ID |
| `--title <title>` | Deal title |
| `--description <text>` | Deal description |
| `--value <amount>` | Deal value |
| `--currency <code>` | Currency code (default: USD) |
| `--probability <pct>` | Win probability (0-100) |
| `--close-date <date>` | Expected close date (YYYY-MM-DD) |
| `--contact <id>` | Contact ID |
| `--organization <id>` | Organization ID |
| `--assigned-to <id>` | Assigned user ID |

### `deals update`

Update an existing deal

```bash
exponential deals update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Deal ID |
| `--title <title>` | Deal title |
| `--description <text>` | Description (use "null" to clear) |
| `--value <amount>` | Deal value (use "null" to clear) |
| `--currency <code>` | Currency code |
| `--probability <pct>` | Win probability (use "null" to clear) |
| `--close-date <date>` | Expected close date (YYYY-MM-DD or "null" to clear) |
| `--contact <id>` | Contact ID (use "null" to clear) |
| `--organization <id>` | Organization ID (use "null" to clear) |
| `--assigned-to <id>` | Assigned user ID (use "null" to clear) |

### `deals move`

Move a deal to a different stage

```bash
exponential deals move [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Deal ID |
| `--stage <id>` | Target stage ID |
| `--order <n>` | Position within stage (default: `0`) |

### `deals delete`

Delete a deal

```bash
exponential deals delete [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes | Deal ID |

## `epics`

Manage epics. Epics are workspace-scoped and group actions and tickets across products.

### `epics list`

List epics in a workspace

```bash
exponential epics list [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace slug or CUID |
| `--status <status>` | Filter by status: OPEN, IN_PROGRESS, DONE, CANCELLED |

### `epics get`

Get an epic by CUID

```bash
exponential epics get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `epics create`

Create a new epic in a workspace

```bash
exponential epics create [options]
```

| Option | Description |
|---|---|
| `-n, --name <name>` | Epic name |
| `-d, --description <text>` | Description |
| `--priority <priority>` | Priority: HIGH, MEDIUM, LOW, NONE |
| `--start <date>` | Start date (YYYY-MM-DD) |
| `--target <date>` | Target date (YYYY-MM-DD) |
| `--workspace <slug\|id>` | Workspace slug or CUID |

### `epics update`

Update an existing epic

```bash
exponential epics update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Epic CUID |
| `-n, --name <name>` | New name |
| `-d, --description <text>` | New description (or "null" to clear) |
| `--status <status>` | Status: OPEN, IN_PROGRESS, DONE, CANCELLED |
| `--priority <priority>` | Priority: HIGH, MEDIUM, LOW, NONE |
| `--start <date>` | Start date (YYYY-MM-DD or "null") |
| `--target <date>` | Target date (YYYY-MM-DD or "null") |

## `features`

Manage features. A feature lives under a product and groups user stories, scopes, and tickets.

### `features list`

List features in a product

```bash
exponential features list [options]
```

| Option | Description |
|---|---|
| `--product <slug\|id>` | Product slug or CUID |
| `--workspace <slug\|id>` | Workspace (required when --product is a slug) |
| `--status <status>` | Filter by status: IDEA, DEFINED, IN_PROGRESS, SHIPPED, DEPRECATED, ARCHIVED |

### `features get`

Get a feature by CUID

```bash
exponential features get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `features create`

Create a new feature in a product

```bash
exponential features create [options]
```

| Option | Description |
|---|---|
| `--product <slug\|id>` | Product slug or CUID |
| `-n, --name <name>` | Feature name |
| `-d, --description <text>` | Description (markdown supported) |
| `--vision <text>` | Vision / target outcome |
| `--status <status>` | Status: IDEA, DEFINED, IN_PROGRESS, SHIPPED, DEPRECATED, ARCHIVED |
| `--priority <n>` | Priority 0-4 (lower = higher) |
| `--effort <n>` | Effort estimate |
| `--area <id>` | Area CUID (per-product bucket) to file the feature under |
| `--workspace <slug\|id>` | Workspace (required when --product is a slug) |

### `features update`

Update an existing feature

```bash
exponential features update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Feature CUID |
| `-n, --name <name>` | New name |
| `-d, --description <text>` | New description |
| `--vision <text>` | New vision text |
| `--status <status>` | Status: IDEA, DEFINED, IN_PROGRESS, SHIPPED, DEPRECATED, ARCHIVED |
| `--priority <n>` | Priority 0-4 |
| `--effort <n>` | Effort estimate |
| `--area <id>` | Area CUID ("none" to clear) |
| `--goal <id\|none>` | Objective (goal) id this feature serves ("none" to clear). For progress rollup, link the finer Feature→key-result edge with `goals kr link --feature`. |

### `features delete`

Delete a feature. Refuses if it still has tickets — deleting a feature does not delete its tickets, it unlinks them (Ticket.featureId is SetNull), silently orphaning them in the product backlog.

```bash
exponential features delete [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

| Option | Description |
|---|---|
| `--with-tickets` | Delete the feature's tickets first, then the feature (destructive) |
| `--orphan-tickets` | Delete the feature anyway, leaving its tickets in the backlog unlinked |

### `features link-page`

Link a Knowledge page (PRD, spec, research) to a feature

```bash
exponential features link-page [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature CUID |
| `--page <id>` | Page CUID |
| `--scope <id>` | Feature scope CUID to pin the page to |

### `features unlink-page`

Unlink a Knowledge page from a feature

```bash
exponential features unlink-page [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature CUID |
| `--page <id>` | Page CUID |

### `features stories`

Manage a feature's native, structured user stories (As a / I want / So that).

### `features stories add`

Add user stories to a feature.

Flag mode: pass --as-a/--i-want/--so-that (plus optional --acceptance/--scope) to add one story.
Batch mode: pipe a JSON array of { asA?, iWant?, soThat?, acceptanceCriteria?, scopeId? } on stdin
            to add many at once (per-item success/failure is reported).

```bash
exponential features stories add [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature CUID |
| `--as-a <text>` | "As a ..." actor |
| `--i-want <text>` | "I want ..." capability |
| `--so-that <text>` | "So that ..." outcome |
| `--acceptance <text>` | Acceptance criteria |
| `--scope <id>` | Feature scope CUID to group the story under |

### `features stories list`

List a feature's user stories in display order

```bash
exponential features stories list [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature CUID |

### `features scopes`

Manage a feature's scopes: shippable increments ("V1", "V2"), each with its own lifecycle.

### `features scopes list`

List a feature's scopes

```bash
exponential features scopes list [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature CUID |

### `features scopes add`

Add a scope to a feature

```bash
exponential features scopes add [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature CUID |
| `--version <label>` | Short label for the increment, e.g. "V1" |
| `-d, --description <text>` | What this scope delivers (markdown supported) |
| `--status <status>` | Status: PLANNED, IN_PROGRESS, SHIPPED, DEPRECATED (default PLANNED) |

### `features scopes update`

Update a scope (setting SHIPPED stamps shippedAt and rolls the feature status up)

```bash
exponential features scopes update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Scope CUID |
| `--version <label>` | New version label |
| `-d, --description <text>` | New description |
| `--status <status>` | Status: PLANNED, IN_PROGRESS, SHIPPED, DEPRECATED |

### `features scopes rm`

Delete a scope

```bash
exponential features scopes rm [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Scope CUID |

### `features requirements`

Manage a feature's requirements: atomic, testable EARS-style "shall" statements, checkable met/unmet.

### `features requirements add`

Add requirements to a feature.

Flag mode: pass -s/--statement (plus optional --kind/--scope) to add one requirement.
Batch mode: pipe a JSON array of { statement, kind?, scopeId? } on stdin
            to add many at once (per-item success/failure is reported).

```bash
exponential features requirements add [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature CUID |
| `-s, --statement <text>` | One EARS-style "shall" statement |
| `--kind <kind>` | Kind: FUNCTIONAL, NON_FUNCTIONAL, CONSTRAINT |
| `--scope <id>` | Feature scope CUID to pin the requirement to |

### `features requirements list`

List a feature's requirements

```bash
exponential features requirements list [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature CUID |
| `--scope <id>` | Only requirements pinned to this scope |

### `features requirements check`

Mark a requirement met (or unmet with --unmet)

```bash
exponential features requirements check [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Requirement CUID |
| `--unmet` | Mark unmet instead of met |

### `features requirements rm`

Delete a requirement

```bash
exponential features requirements rm [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Requirement CUID |

### `features areas`

Manage a product's areas: the buckets features are filed under (a feature has exactly one or none).

### `features areas list`

List a product's areas

```bash
exponential features areas list [options]
```

| Option | Description |
|---|---|
| `--product <slug\|id>` | Product slug or CUID |
| `--workspace <slug\|id>` | Workspace (required when --product is a slug) |

### `features areas create`

Create an area in a product

```bash
exponential features areas create [options]
```

| Option | Description |
|---|---|
| `--product <slug\|id>` | Product slug or CUID |
| `-n, --name <name>` | Area name (unique per product) |
| `-d, --description <text>` | What belongs in this area |
| `--workspace <slug\|id>` | Workspace (required when --product is a slug) |

### `features comment`

Read and post comments on a feature. Mention teammates with --mention.

### `features comment list`

List comments on a feature

```bash
exponential features comment list [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature ID |

### `features comment add`

Add a comment to a feature

```bash
exponential features comment add [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature ID |
| `-m, --message <text>` | Comment body (markdown supported) |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |
| `--scope <id>` | Attach to a scope's activity feed instead of the feature |

### `features comment reply`

Reply to a comment on a feature

```bash
exponential features comment reply [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID to reply to |
| `-m, --message <text>` | Reply body (markdown supported) |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |

### `features comment update`

Update one of your own comments

```bash
exponential features comment update [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |
| `-m, --message <text>` | New comment body |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |

### `features comment rm`

Delete one of your own comments

```bash
exponential features comment rm [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |

### `features comment resolve`

Resolve an anchored comment thread

```bash
exponential features comment resolve [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature ID |
| `--thread <id>` | Thread ID (anchored comments only) |

### `features comment unresolve`

Reopen a resolved comment thread

```bash
exponential features comment unresolve [options]
```

| Option | Description |
|---|---|
| `--feature <id>` | Feature ID |
| `--thread <id>` | Thread ID (anchored comments only) |

## `labels`

Manage labels (orthogonal tags applied to actions, tickets, features, and epics).

### `labels list`

List labels visible in a workspace

```bash
exponential labels list [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace slug or CUID |
| `--category <category>` | Filter by category. Use "label" for general labels, "null" for category-less labels, or omit to list all. |

### `labels create`

Create a workspace-scoped label

```bash
exponential labels create [options]
```

| Option | Description |
|---|---|
| `-n, --name <name>` | Label name |
| `--color <token>` | Color token (e.g. avatar-green, brand-primary) |
| `-d, --description <text>` | Description |
| `--category <category>` | Category. Omit (or pass "null") to create a general label. |
| `--workspace <slug\|id>` | Workspace slug or CUID |

### `labels seed-triage`

Idempotently seed the five canonical triage labels into a workspace.

```bash
exponential labels seed-triage [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace slug or CUID |

## `meetings`

Manage meetings and their notes (recorded, imported, or manually created)

### `meetings list`

List meetings you can see (owned, attended, or shared via project/workspace). JSON rows carry hasNotes/hasSummary/hasTranscript flags instead of the bodies — use "get" for content.

```bash
exponential meetings list [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Restrict to one workspace |
| `--mine` | Only meetings you own or attended |
| `--archived` | Include archived meetings |

### `meetings get`

Get a meeting: details, summary, and notes

```bash
exponential meetings get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

| Option | Description |
|---|---|
| `--transcript` | Also print the raw transcript (pretty mode; JSON always includes it) |

### `meetings create`

Create a meeting manually. Transcript: --transcript text, --transcript-file <path>, or --transcript-file - for stdin.

```bash
exponential meetings create [options]
```

| Option | Description |
|---|---|
| `-t, --title <title>` | Meeting title |
| `--transcript <text>` | Transcript text (required by the API) |
| `--transcript-file <path>` | Read the transcript from a file ("-" = stdin) |
| `--notes <markdown>` | Meeting notes |
| `--notes-file <path>` | Read the notes from a file ("-" = stdin) |
| `--description <text>` | Short description |
| `--date <iso>` | When the meeting occurred (e.g. 2026-08-25T14:00; a bare date is local midnight) |
| `--project <id>` | Link to a project (the meeting inherits its workspace) |
| `--workspace <slug\|id>` | Workspace (omit for a personal meeting) |

### `meetings update`

Update a meeting; only the fields you pass are written. Title and other fields are two API calls — on a mid-flight failure the title may already be saved.

```bash
exponential meetings update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Meeting CUID |
| `-t, --title <title>` | New title |
| `--notes <markdown>` | Replace the meeting notes |
| `--notes-file <path>` | Read the new notes from a file ("-" = stdin) |
| `--summary <text>` | Replace the summary |
| `--description <text>` | Replace the description |
| `--date <iso>` | When the meeting occurred |

### `meetings delete`

Permanently delete meetings you own. Pass one or more ids, and/or --ids-file with whitespace-separated ids ("-" = stdin). Deleting more than one id requires --force. Exit 0 only when everything requested was deleted.

```bash
exponential meetings delete [options] [ids...]
```

| Argument | Required | Description |
|---|---|---|
| `ids` | no |  |

| Option | Description |
|---|---|
| `--ids-file <path>` | Read whitespace-separated meeting ids from a file ("-" = stdin) |
| `--force` | Confirm deleting more than one meeting in a single call |

### `meetings notes`

Read and write a meeting's notes

### `meetings notes get`

Print the meeting notes as raw Markdown (safe to redirect to a file); pass --json for a {id, notes} envelope

```bash
exponential meetings notes get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `meetings notes set`

Replace the meeting notes. Body: inline, --file <path>, or --file - for stdin.

```bash
exponential meetings notes set [options] <id> [notes]
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |
| `notes` | no |  |

| Option | Description |
|---|---|
| `--file <path>` | Read the notes from a file ("-" = stdin) |

### `meetings notes append`

Append a block to the meeting notes (separated by a blank line). Read-modify-write: concurrent appends can lose one side.

```bash
exponential meetings notes append [options] <id> [notes]
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |
| `notes` | no |  |

| Option | Description |
|---|---|
| `--file <path>` | Read the block from a file ("-" = stdin) |

## `organizations`

Alias: `orgs`

Manage CRM organizations

### `organizations list`

List organizations

```bash
exponential organizations list [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Workspace ID |
| `--search <query>` | Search by name or description |
| `--industry <industry>` | Filter by industry |
| `--limit <n>` | Max results to return |
| `--cursor <cursor>` | Pagination cursor |

### `organizations get`

Get an organization by ID

```bash
exponential organizations get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes | Organization ID |

### `organizations create`

Create a new organization

```bash
exponential organizations create [options]
```

| Option | Description |
|---|---|
| `--workspace <id>` | Workspace ID |
| `--name <name>` | Organization name |
| `--website-url <url>` | Website URL |
| `--logo-url <url>` | Logo URL |
| `--description <text>` | Description |
| `--industry <industry>` | Industry |
| `--size <size>` | Company size (1-10, 11-50, 51-200, 201-500, 501-1000, 1000+) |

## `pages`

Manage Knowledge pages (PRDs, research, technical specs). Link one to a feature with "features link-page".

### `pages list`

List pages in a workspace

```bash
exponential pages list [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace (defaults to the configured default) |
| `--search <text>` | Filter by title/content |

### `pages get`

Get a page by CUID (body is Markdown)

```bash
exponential pages get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `pages create`

Create a page. Body: -b text, --body-file <path>, or --body-file - for stdin.

```bash
exponential pages create [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace (defaults to the configured default) |
| `-t, --title <title>` | Page title |
| `-b, --body <markdown>` | Markdown body |
| `--body-file <path>` | Read the Markdown body from a file ("-" = stdin) |

### `pages update`

Update a page. Sending a body is a Markdown-source write: the Markdown becomes canonical.

```bash
exponential pages update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Page CUID |
| `-t, --title <title>` | New title |
| `-b, --body <markdown>` | New Markdown body (replaces the whole body) |
| `--body-file <path>` | Read the new Markdown body from a file ("-" = stdin) |

### `pages comment`

Read and post comments on a page. Mention teammates with --mention.

### `pages comment list`

List comments on a page

```bash
exponential pages comment list [options]
```

| Option | Description |
|---|---|
| `--page <id>` | Page ID |

### `pages comment add`

Add a comment to a page

```bash
exponential pages comment add [options]
```

| Option | Description |
|---|---|
| `--page <id>` | Page ID |
| `-m, --message <text>` | Comment body (markdown supported) |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |

### `pages comment update`

Update one of your own comments

```bash
exponential pages comment update [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |
| `-m, --message <text>` | New comment body |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |

### `pages comment rm`

Delete one of your own comments

```bash
exponential pages comment rm [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |

## `products`

Manage products. A workspace contains products; a product holds features and tickets.

### `products list`

List products in a workspace

```bash
exponential products list [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace slug or CUID (defaults to configured workspace) |

### `products get`

Get a product by slug or CUID

```bash
exponential products get [options] <slugOrId>
```

| Argument | Required | Description |
|---|---|---|
| `slugOrId` | yes |  |

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace (required when using a slug) |

### `products create`

Create a new product

```bash
exponential products create [options]
```

| Option | Description |
|---|---|
| `-n, --name <name>` | Product name |
| `--slug <slug>` | Kebab-case slug (matches /^[a-z0-9-]+$/) |
| `-d, --description <text>` | Description |
| `--icon <icon>` | Icon shortcode |
| `--color <color>` | Color |
| `--workspace <slug\|id>` | Workspace slug or CUID |

## `projects`

Manage projects

### `projects list`

List all projects

```bash
exponential projects list [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace slug or CUID |
| `--include-actions` | Include actions in output |

### `projects get`

Get one project with its objectives, key results, DRI and actions — none of which `projects list` carries. Accepts a CUID, a slug, or the slug-cuid form from app URLs.

```bash
exponential projects get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `projects update`

Update a project. Only the fields you pass are written; the rest are read back from the project and re-sent unchanged.

```bash
exponential projects update [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Project CUID |
| `-n, --name <name>` | New name |
| `-d, --description <text>` | New description |
| `--status <status>` | Status: ACTIVE, ON_HOLD, COMPLETED, CANCELLED |
| `--priority <priority>` | Priority: HIGH, MEDIUM, LOW, NONE |
| `--product <cuid\|none>` | Product to file the project under ("none" to unlink) |
| `--dri <userId\|none>` | Directly responsible individual ("none" to clear) |

### `projects delete`

Delete a project. Refuses while it still has actions or is linked to an objective or key result, unless --force.

```bash
exponential projects delete [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Project CUID |
| `--force` | Delete anyway, taking the actions and links with it |

## `search`

Global search across projects, actions, goals, workspaces and more — same coverage as the app's Cmd+K palette

```bash
exponential search [options] <query>
```

| Argument | Required | Description |
|---|---|---|
| `query` | yes | Text to search for |

| Option | Description |
|---|---|
| `-w, --workspace <slug>` | Restrict results to one workspace (slug or ID) |
| `-l, --limit <n>` | Max results per entity type (1-25, default 10) |

## `tickets`

Manage product backlog tickets. Tickets live under a product, link to features/epics, depend on each other, and can be implemented via actions.

### `tickets list`

List tickets in a product, or workspace-wide when --pr or --branch is supplied

```bash
exponential tickets list [options]
```

| Option | Description |
|---|---|
| `--product <slug\|id>` | Product slug or CUID (required unless --pr or --branch is supplied) |
| `--workspace <slug\|id>` | Workspace (required when --product is a slug) |
| `--status <status>` | Filter by status: BACKLOG, NEEDS_REFINEMENT, READY_TO_PLAN, COMMITTED, IN_PROGRESS, BLOCKED, QA, DONE, DEPLOYED, ARCHIVED |
| `--type <type>` | Filter by type: BUG, FEATURE, CHORE, IMPROVEMENT, SPIKE, RESEARCH |
| `--feature <id>` | Filter by feature CUID |
| `--epic <id>` | Filter by epic CUID |
| `--assignee <id>` | Filter by assignee user ID |
| `--pr <url>` | Workspace-wide lookup by Ticket.prUrl (exact match). Makes --product optional. |
| `--branch <name>` | Workspace-wide lookup by Ticket.branchName (exact match). Makes --product optional. |
| `--label <slug-or-id>` | Filter to tickets carrying this label (repeatable; AND semantics) |

### `tickets get`

Show a ticket with dependencies, actions, and comments

```bash
exponential tickets get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `tickets show`

Alias for `tickets get`

```bash
exponential tickets show [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `tickets create`

Create a new ticket in a product

```bash
exponential tickets create [options]
```

| Option | Description |
|---|---|
| `--product <slug\|id>` | Product slug or CUID |
| `-t, --title <title>` | Ticket title |
| `-b, --body <text>` | Body (markdown supported) |
| `--type <type>` | Ticket type: BUG, FEATURE, CHORE, IMPROVEMENT, SPIKE, RESEARCH |
| `--status <status>` | Initial status: BACKLOG, NEEDS_REFINEMENT, READY_TO_PLAN, COMMITTED, IN_PROGRESS, BLOCKED, QA, DONE, DEPLOYED, ARCHIVED |
| `--priority <n>` | Priority 0-4 (lower = higher) |
| `--points <n>` | Story points |
| `--feature <id>` | Feature CUID to attach to |
| `--scope <id>` | Feature scope CUID to attach to (requires --feature) |
| `--epic <id>` | Epic CUID to attach to |
| `--cycle <id>` | Cycle CUID to assign to |
| `--assignee <id>` | Assignee user ID |
| `--branch <name>` | Branch name |
| `--pr <url>` | Pull request URL |
| `--workspace <slug\|id>` | Workspace (required when --product is a slug) |
| `--label <slug-or-id>` | Label to attach (repeatable) |

### `tickets update`

Update an existing ticket

```bash
exponential tickets update [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Ticket CUID |
| `-t, --title <title>` | New title |
| `-b, --body <text>` | New body |
| `--type <type>` | Type: BUG, FEATURE, CHORE, IMPROVEMENT, SPIKE, RESEARCH |
| `--status <status>` | Status: BACKLOG, NEEDS_REFINEMENT, READY_TO_PLAN, COMMITTED, IN_PROGRESS, BLOCKED, QA, DONE, DEPLOYED, ARCHIVED |
| `--priority <n>` | Priority 0-4 (or "null" to clear) |
| `--points <n>` | Story points (or "null" to clear) |
| `--feature <id>` | Feature CUID (or "null" to detach) |
| `--epic <id>` | Epic CUID (or "null" to detach) |
| `--cycle <id>` | Cycle CUID (or "null" to detach) |
| `--assignee <id>` | Assignee user ID (or "null" to unassign) |
| `--branch <name>` | Branch name (or "null") |
| `--pr <url>` | PR URL (or "null") |
| `--add-label <slug-or-id>` | Label to attach to this ticket (repeatable) |
| `--remove-label <slug-or-id>` | Label to detach from this ticket (repeatable) |

### `tickets delete`

Delete a ticket

```bash
exponential tickets delete [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `tickets block`

Mark <ticket> as blocked by another ticket

```bash
exponential tickets block [options] <ticket>
```

| Argument | Required | Description |
|---|---|---|
| `ticket` | yes |  |

| Option | Description |
|---|---|
| `--by <id>` | Ticket CUID that must complete first |

### `tickets unblock`

Remove a blocking dependency from <ticket>

```bash
exponential tickets unblock [options] <ticket>
```

| Argument | Required | Description |
|---|---|---|
| `ticket` | yes |  |

| Option | Description |
|---|---|
| `--by <id>` | The ticket CUID that was blocking |

### `tickets link-action`

Attach an existing action to a ticket

```bash
exponential tickets link-action [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Ticket CUID |
| `--action <id>` | Action CUID |

### `tickets unlink-action`

Detach an action from whatever ticket it is on

```bash
exponential tickets unlink-action [options]
```

| Option | Description |
|---|---|
| `--action <id>` | Action CUID |

### `tickets comment`

Manage comments on a ticket

### `tickets comment list`

List comments on a ticket

```bash
exponential tickets comment list [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Ticket CUID |

### `tickets comment add`

Add a comment to a ticket

```bash
exponential tickets comment add [options]
```

| Option | Description |
|---|---|
| `--id <id>` | Ticket CUID |
| `-m, --message <text>` | Comment content (markdown supported) |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |

### `tickets comment update`

Update one of your own ticket comments

```bash
exponential tickets comment update [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |
| `-m, --message <text>` | New comment content |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |

### `tickets comment delete`

Delete one of your own ticket comments

```bash
exponential tickets comment delete [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |

## `time`

Time entries — log the day's work and list it. Run with an external-agent key, the entry belongs to the agent's OWNER and is always PROPOSED; a personal token logs your own time, CONFIRMED by default.

### `time log`

Log one completed entry with explicit bounds; the running Timer is never touched. With --ref the write is idempotent per owner: a re-run updates a PROPOSED entry and leaves a CONFIRMED one alone. Bulk: --from-file <path|-> takes a JSON array of entries; the other flags become its defaults. Run with an external-agent key, the entry belongs to the agent's OWNER and is always PROPOSED; a personal token logs your own time, CONFIRMED by default.

```bash
exponential time log [options]
```

| Option | Description |
|---|---|
| `-a, --action <id>` | Action CUID the time was spent on |
| `--from <iso>` | Start, e.g. 2026-09-11T09:22 |
| `--to <iso>` | End, e.g. 2026-09-11T10:30 |
| `--source <source>` | manual, claude-desktop, agent-run (default: manual) |
| `--status <status>` | PROPOSED or CONFIRMED (ignored under an agent key: always PROPOSED) |
| `--ref <sourceRef>` | Idempotency key, e.g. claude-session:<sessionId>#<segment> |
| `--note <text>` | One line shown in the day view and list row |
| `--from-file <path>` | Bulk log from a JSON array of entries ("-" = stdin) |

### `time list`

One day's entries for the signed-in user, oldest first, each with its PROPOSED/CONFIRMED status

```bash
exponential time list [options]
```

| Option | Description |
|---|---|
| `-d, --date <YYYY-MM-DD>` | The day (local time) |
| `-w, --workspace <slug\|id>` | Only entries in this workspace (default: all) |
| `--proposed` | Only PROPOSED entries |

### `time confirm`

Confirm a day: every PROPOSED entry of yours that starts that day becomes CONFIRMED and the Actions' spent time moves. Human only — run it with your personal credentials; an agent key is refused.

```bash
exponential time confirm [options]
```

| Option | Description |
|---|---|
| `-d, --date <YYYY-MM-DD>` | The day (local time) |
| `-w, --workspace <slug\|id>` | Only entries in this workspace (default: all) |

### `time report`

One day's report — the numbers the /time Day tab shows: attention hours (each covered minute once), session hours (the plain sum), agent-run time on its own, hours by Product and by Action with overlapping minutes split evenly, and the unassigned and proposed counts. JSON when piped or with --json.

```bash
exponential time report [options]
```

| Option | Description |
|---|---|
| `-d, --date <YYYY-MM-DD>` | The day (local time) |
| `-w, --workspace <slug\|id>` | Only entries in this workspace (default: all) |

### `time segment`

Cut one conversation's messages into Worklog segments and print the batch `time log --from-file -` consumes. Input: a JSON array of {at, role} (role user|assistant), or {"messages": [...]}. A gap over 30 minutes between the person's messages ends a segment; bounds round outward to 5 minutes; assistant-only runs longer than the gap become agent-run entries.

```bash
exponential time segment [options]
```

| Option | Description |
|---|---|
| `--from-file <path>` | Messages JSON ("-" = stdin) |
| `-a, --action <id>` | Action CUID every entry is logged on |
| `--ref-prefix <prefix>` | sourceRef prefix, e.g. claude-session:<sessionId>; segments get #0, #1, … |
| `--gap <minutes>` | Silence between the person's messages that ends a segment (default: `"30"`) |
| `--note <text>` | Note copied onto every entry |

## `workspaces`

Manage workspaces

### `workspaces list`

List all workspaces

```bash
exponential workspaces list [options]
```

### `workspaces set-default`

Set the default workspace

```bash
exponential workspaces set-default [options] <slug>
```

| Argument | Required | Description |
|---|---|---|
| `slug` | yes |  |

### `workspaces members`

List workspace members. Each row carries the exact @[Name] (id) markup to paste into a comment to mention that person.

```bash
exponential workspaces members [options]
```

| Option | Description |
|---|---|
| `--workspace <slug\|id>` | Workspace (defaults to your default workspace) |
| `--search <text>` | Filter by name or email |

## `goals`

Manage goals (objectives) and their key results. Objectives have integer ids; key results are CUIDs.

### `goals list`

List objectives, each with the projects linked to it — the join that ties an action (which carries a projectId) back to a goal.

```bash
exponential goals list [options]
```

| Option | Description |
|---|---|
| `-w, --workspace <slug\|id>` | Workspace slug or ID (defaults to your default workspace) |
| `--all-workspaces` | List across every workspace you belong to |
| `--period <period>` | Filter by period, e.g. Q3-2026 |
| `--status <status>` | Filter by status: planned, active, completed, archived, on-hold |
| `--tree` | Render the parent/child cascade instead of a flat list |

### `goals get`

Get an objective by its integer ID

```bash
exponential goals get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `goals create`

Create an objective

```bash
exponential goals create [options]
```

| Option | Description |
|---|---|
| `-t, --title <text>` | Objective title |
| `-w, --workspace <slug\|id>` | Workspace slug or ID (defaults to your default workspace) |
| `--period <period>` | Period, e.g. Q3-2026 or Annual-2026 |
| `--status <status>` | Status: planned, active, completed, archived |
| `-d, --description <text>` | Description (markdown supported) |
| `--why <text>` | Why this goal matters |
| `--dri <userId>` | Directly responsible individual (user ID) |
| `--parent <id>` | Parent objective ID to nest under (max depth 5) |
| `--project <cuid>` | Link a project on creation |

### `goals update`

Update an objective. Only the flags you pass are written — everything else is left exactly as it is. For a status change use `set-status`; to re-parent use `reparent`.

```bash
exponential goals update [options]
```

| Option | Description |
|---|---|
| `--id <n>` | Objective ID (a number) |
| `-t, --title <text>` | New title |
| `-d, --description <text>` | New description ("none" clears it) |
| `--why <text>` | Why this goal matters ("none" clears it) |
| `--period <period>` | New period ("none" clears it) |
| `--dri <userId>` | Directly responsible individual (user ID) |
| `--status <status>` | Status: planned, active, completed, archived |
| `--project <cuid>` | Replace the project links with this project ("none" clears them) |
| `-w, --workspace <slug\|id\|none>` | Re-home the objective; "none" makes it personal |

### `goals set-status`

Set an objective's status and nothing else. Routes through the status-only procedure, so no other field can be touched.

```bash
exponential goals set-status [options]
```

| Option | Description |
|---|---|
| `--id <n>` | Objective ID (a number) |
| `--status <status>` | Status: planned, active, completed, archived, on-hold |

### `goals close`

Close out an objective — one command per goal when a quarter ends

```bash
exponential goals close [options]
```

| Option | Description |
|---|---|
| `--id <n>` | Objective ID (a number) |
| `--status <status>` | completed (default) or archived (default: `"completed"`) |

### `goals reparent`

Move an objective under another (or detach it with --parent none). Writes the parent alone.

```bash
exponential goals reparent [options]
```

| Option | Description |
|---|---|
| `--id <n>` | Objective ID (a number) |
| `--parent <id\|none>` | New parent objective ID, or "none" to detach |

### `goals delete`

Delete an objective. Refuses while it still has key results — deleting an objective deletes them too (KeyResult.goalId cascades), taking their check-in history with them.

```bash
exponential goals delete [options]
```

| Option | Description |
|---|---|
| `--id <n>` | Objective ID (a number) |
| `--with-key-results` | Delete the objective and cascade-delete its key results (destructive) |

### `goals periods`

List the conventional OKR period strings

```bash
exponential goals periods [options]
```

### `goals stats`

Objective and key-result counts, average progress and confidence

```bash
exponential goals stats [options]
```

| Option | Description |
|---|---|
| `-w, --workspace <slug\|id>` | Workspace slug or ID (defaults to your default workspace) |
| `--period <period>` | Period, e.g. Q3-2026 |

### `goals kr`

Key results on an objective. Ids are CUIDs; --goal takes the objective's integer id.

### `goals kr list`

List key results

```bash
exponential goals kr list [options]
```

| Option | Description |
|---|---|
| `--goal <id>` | Objective ID (a number) |
| `-w, --workspace <slug\|id>` | Workspace (workspace-wide: every member's KRs) |
| `--period <period>` | Period, e.g. Q3-2026 |
| `--status <status>` | Filter by status: not-started, on-track, at-risk, off-track, achieved |
| `--mine` | Narrow a workspace list to key results you own |

### `goals kr get`

Get a key result by CUID

```bash
exponential goals kr get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `goals kr create`

Create a key result on an objective

```bash
exponential goals kr create [options]
```

| Option | Description |
|---|---|
| `--goal <id>` | Objective ID (a number) |
| `-t, --title <text>` | Key result title |
| `--target <n>` | Target value |
| `--start <n>` | Starting value (default 0) |
| `--current <n>` | Current value (defaults to the start value) |
| `--unit <unit>` | Unit: percent, count, currency, hours, custom |
| `--period <period>` | Period, e.g. Q3-2026 (defaults to the objective's) |
| `-d, --description <text>` | Description |
| `--dri <userId>` | Directly responsible individual (user ID) |

### `goals kr update`

Update a key result (only the flags you pass are written)

```bash
exponential goals kr update [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |
| `-t, --title <text>` | New title |
| `-d, --description <text>` | New description |
| `--current <n>` | Current value (prefer `kr checkin` — it records history) |
| `--target <n>` | Target value |
| `--start <n>` | Starting value |
| `--unit <unit>` | Unit: percent, count, currency, hours, custom |
| `--status <status>` | Status: not-started, on-track, at-risk, off-track, achieved |
| `--confidence <n>` | Confidence 0-100 |
| `--dri <userId>` | Directly responsible individual (user ID) |
| `--goal <id>` | Move the key result to a different objective |

### `goals kr checkin`

Record a progress check-in. Moves the value AND re-derives the status from where it lands between start and target.

```bash
exponential goals kr checkin [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |
| `--value <n>` | New current value |
| `--note <text>` | Check-in note |

### `goals kr delete`

Delete a key result

```bash
exponential goals kr delete [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |

### `goals kr link`

Link executing work (a project or a feature) to a key result

```bash
exponential goals kr link [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |
| `--project <cuid>` | Project CUID |
| `--feature <cuid>` | Feature CUID |

### `goals kr unlink`

Unlink a project or feature from a key result

```bash
exponential goals kr unlink [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |
| `--project <cuid>` | Project CUID |
| `--feature <cuid>` | Feature CUID |

### `goals comment`

Read and post comments on a goal. Mention teammates with --mention.

### `goals comment list`

List comments on a goal

```bash
exponential goals comment list [options]
```

| Option | Description |
|---|---|
| `--goal <id>` | Goal ID (a number) |

### `goals comment add`

Add a comment to a goal

```bash
exponential goals comment add [options]
```

| Option | Description |
|---|---|
| `--goal <id>` | Goal ID (a number) |
| `-m, --message <text>` | Comment content (markdown supported) |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |
| `--parent-update <id>` | Thread under a specific goal update |

### `goals comment update`

Update one of your own comments

```bash
exponential goals comment update [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |
| `-m, --message <text>` | New comment content |
| `--mention <name>` | Mention a workspace member by name, email, or id (repeatable). Writing @name in the message substitutes in place; otherwise the mention is prepended. |
| `--workspace <slug\|id>` | Workspace used to resolve --mention (defaults to your default workspace) |

### `goals comment rm`

Delete one of your own comments

```bash
exponential goals comment rm [options]
```

| Option | Description |
|---|---|
| `--comment-id <id>` | Comment ID |

## `okrs`

OKRs — objectives with their key results nested. Manage the parts with `goals` and `goals kr`.

### `okrs list`

List objectives with their key results. Defaults to the current quarter — pass --period all for every period.

```bash
exponential okrs list [options]
```

| Option | Description |
|---|---|
| `-w, --workspace <slug\|id>` | Workspace slug or ID (defaults to your default workspace) |
| `--all-workspaces` | List across every workspace you belong to |
| `--period <period>` | Period, e.g. Q3-2026, or "all" for every period (default: Q3-2026) |
| `--paired-period` | Also include the period's parent annual period |
| `--status <status>` | Keep only key results with this status: not-started, on-track, at-risk, off-track, achieved |
| `--mine` | Only objectives and key results you are the DRI for |

### `okrs stats`

Objective and key-result counts, average progress and confidence

```bash
exponential okrs stats [options]
```

| Option | Description |
|---|---|
| `-w, --workspace <slug\|id>` | Workspace slug or ID (defaults to your default workspace) |
| `--period <period>` | Period, e.g. Q3-2026 |

### `okrs periods`

List the conventional OKR period strings

```bash
exponential okrs periods [options]
```

### `okrs kr`

Key results on an objective. Ids are CUIDs; --goal takes the objective's integer id.

### `okrs kr list`

List key results

```bash
exponential okrs kr list [options]
```

| Option | Description |
|---|---|
| `--goal <id>` | Objective ID (a number) |
| `-w, --workspace <slug\|id>` | Workspace (workspace-wide: every member's KRs) |
| `--period <period>` | Period, e.g. Q3-2026 |
| `--status <status>` | Filter by status: not-started, on-track, at-risk, off-track, achieved |
| `--mine` | Narrow a workspace list to key results you own |

### `okrs kr get`

Get a key result by CUID

```bash
exponential okrs kr get [options] <id>
```

| Argument | Required | Description |
|---|---|---|
| `id` | yes |  |

### `okrs kr create`

Create a key result on an objective

```bash
exponential okrs kr create [options]
```

| Option | Description |
|---|---|
| `--goal <id>` | Objective ID (a number) |
| `-t, --title <text>` | Key result title |
| `--target <n>` | Target value |
| `--start <n>` | Starting value (default 0) |
| `--current <n>` | Current value (defaults to the start value) |
| `--unit <unit>` | Unit: percent, count, currency, hours, custom |
| `--period <period>` | Period, e.g. Q3-2026 (defaults to the objective's) |
| `-d, --description <text>` | Description |
| `--dri <userId>` | Directly responsible individual (user ID) |

### `okrs kr update`

Update a key result (only the flags you pass are written)

```bash
exponential okrs kr update [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |
| `-t, --title <text>` | New title |
| `-d, --description <text>` | New description |
| `--current <n>` | Current value (prefer `kr checkin` — it records history) |
| `--target <n>` | Target value |
| `--start <n>` | Starting value |
| `--unit <unit>` | Unit: percent, count, currency, hours, custom |
| `--status <status>` | Status: not-started, on-track, at-risk, off-track, achieved |
| `--confidence <n>` | Confidence 0-100 |
| `--dri <userId>` | Directly responsible individual (user ID) |
| `--goal <id>` | Move the key result to a different objective |

### `okrs kr checkin`

Record a progress check-in. Moves the value AND re-derives the status from where it lands between start and target.

```bash
exponential okrs kr checkin [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |
| `--value <n>` | New current value |
| `--note <text>` | Check-in note |

### `okrs kr delete`

Delete a key result

```bash
exponential okrs kr delete [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |

### `okrs kr link`

Link executing work (a project or a feature) to a key result

```bash
exponential okrs kr link [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |
| `--project <cuid>` | Project CUID |
| `--feature <cuid>` | Feature CUID |

### `okrs kr unlink`

Unlink a project or feature from a key result

```bash
exponential okrs kr unlink [options]
```

| Option | Description |
|---|---|
| `--id <cuid>` | Key result CUID |
| `--project <cuid>` | Project CUID |
| `--feature <cuid>` | Feature CUID |

<!-- END AUTO-GENERATED -->