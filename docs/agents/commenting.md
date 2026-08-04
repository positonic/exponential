# Commenting and @mentions from the CLI

Every commentable entity in Exponential is reachable from the `exponential` CLI. Add `--json` (or pipe) for machine-readable output.

| Entity | Command |
| --- | --- |
| Feature (PRD) | `exponential features comment {list,add,reply,update,rm,resolve,unresolve}` |
| Ticket | `exponential tickets comment {list,add,update,delete}` |
| Action | `exponential actions comment {list,add,update,delete}` |
| Page | `exponential pages comment {list,add,update,rm}` |
| Goal | `exponential goals comment {list,add,update,rm}` |

Editing and deleting are **author-only** everywhere — the server rejects touching someone else's comment.

## Mentioning someone

A mention is the literal markup `@[Display Name](userId)` inside the comment body. That exact form is what the notification pipeline parses; plain `@andi` does nothing.

You do not have to build it by hand. `--mention` takes a name, email, or user id and expands it:

```bash
exponential features comment add --feature cmsejeixc0001l204uzlrhg2l \
  --mention andi \
  -m "@andi — could you sanity-check the scope here before we commit?"
```

`@andi` is substituted in place, so the sentence still reads:

> `@[Andi Stanner](cm…) — could you sanity-check the scope here before we commit?`

If the body has no matching `@handle`, the mention is prepended instead, so `-m "ptal?"` works too. `--mention` is repeatable.

Tokens resolve against the workspace roster: exact id, full name, or email wins outright; otherwise first names and email local-parts are matched case-insensitively. An **ambiguous token is an error**, not a guess — mentioning the wrong colleague is worse than failing.

`--mention` needs a workspace to resolve against. It uses your default workspace; pass `--workspace <slug>` when the entity lives elsewhere.

## Finding the user id

```bash
exponential workspaces members --search andi --json
```

Each row carries a `mentionSyntax` field — the ready-to-paste token — plus `source`, which is `workspace` for a direct member or `team` for someone who reaches the workspace through a linked team.

That distinction matters if you ever write the markup by hand: the name-only form `@[Andi Stanner]` only resolves against **direct** members, so team-based members must be mentioned by id. `mentionSyntax` is always the id form and always works.

Mentions naming a non-member (or an agent principal) are silently dropped by the server — comment content never leaks outside the workspace.

## Finding the entity id

- Features, tickets, pages, goals: `exponential search "<text>" --json` returns `type`, `id`, and `url` for each hit.
- Goal ids are **integers**, not CUIDs — the other entities use CUIDs.
- A feature URL like `…/features?peek=cmsejeixc0001l204uzlrhg2l` carries the feature id in the `peek` parameter.

## Threads on features

Feature comments can be anchored to a span of the PRD body. Those carry a `threadId` and can be resolved:

```bash
exponential features comment resolve --feature <id> --thread <threadId>
exponential features comment unresolve --feature <id> --thread <threadId>
```

Doc-level comments have no `threadId` and cannot be resolved. Replies are one level deep — replying to a reply still hangs off the root comment.
