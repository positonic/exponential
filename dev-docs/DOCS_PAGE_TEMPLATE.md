# Docs page template

Copy the block below into `content/docs/<section-folder>/<slug>.md`, replace every angle-bracket
placeholder, delete any section that genuinely does not apply, and run `npm run docs:check`.
The shape is the Time Tracking page generalised; see `DOCS_STYLE_GUIDE.md` for voice and
vocabulary.

```markdown
---
title: <Feature name>
description: <One sentence: what it lets you do, in the user's words.>
section: <section id from content/docs/_meta.json>
order: <number>
icon: <IconName from src/lib/docs/icons.ts>
---

<Two or three sentences: what this is, what it is for, and what you get out of it. Name the
objects it touches (Actions, Projects, Meetings, Decisions…) so a reader can place it.>

![<What the screenshot shows>](/doc-assets/<slug>.png)

## Where to find it

Open [<Label>](</route>) — or: **<Section>** → **<Label>** in the sidebar.
<If it needs a plugin or a role, say so here.>

## How to <do the most common thing>

1. <Step, starting with a verb, naming the control in bold.>
2. <Step.>
3. <What you see when it worked.>

## How to <do the second thing>

1. …

## How it connects

- **<Related concept>** — <one sentence on the relationship, linking the page>.
- **<Related concept>** — …

## Tips

- <A product-specific tip that saves the reader time. Two or three at most.>

## FAQ

**<A question a real user asks?>**
<Short answer. Say "not yet" plainly when something is not supported.>

**<Another question?>**
<Answer.>
```

## Checklist before opening the PR

- [ ] Every claim was checked against the running app (fixture workspace, not a personal account).
- [ ] "Action" not "task"; "Zoe" not "Paddy"; sidebar labels match the app exactly.
- [ ] No env vars, enum values, table or tool names, model details.
- [ ] Links are relative; every `/docs/...` link and `#anchor` resolves (`npm run docs:check`).
- [ ] Screenshot is in `public/doc-assets/`, has alt text, and shows the fixture workspace.
- [ ] Frontmatter has `title`, `description`, `section`, `order`.
