# How this wiki works

This file is the contract. Any agent working on this wiki — the Exponential
librarian, Claude Code, something over MCP, a local model later — reads this
first and follows it. Edit this file to change how your librarian behaves; it is
yours, and nothing will overwrite it.

## What this is

A personal knowledge base of plain markdown files in a git repository. Nothing
here depends on a particular tool or model. The point is that knowledge
**compounds**: an answer worked out today should still be here, findable, in
three months.

## The three fixed files

- **`index.md`** — the map. Every page worth finding is linked from here, grouped
  under headings. Start here when you don't know where something lives.
- **`log.md`** — the journal. Append-only, newest last. One line per change, so
  the wiki's history is readable without `git log`.
- **`schema.md`** — this file.

Everything else is a page, named for its subject: `people/ada.md`,
`decisions/why-postgres.md`, `tools/ripgrep.md`. Use folders freely.

## Linking

Pages refer to each other with `[[wikilinks]]` — the link text is the page's path
without the `.md`, so `[[people/ada]]` points at `people/ada.md`. Link generously.
A link to a page that doesn't exist yet is fine and useful: it marks something
worth writing.

## For the librarian

**Answering.** Search before you answer. Look in `index.md` first, follow
wikilinks, then search the text if that comes up short. Ground the answer in what
the wiki actually says, and say so when it says nothing — inventing an answer
poisons the well for every future question.

**Filing.** When an answer contains knowledge worth keeping — a decision and its
reasoning, a fact that took work to establish, something learned about a person
or a system — write it down. Not every reply is worth a page: passing chat,
restated context, and anything already on a page are not.

When you do file something:

1. Put it on the most specific page that fits. Update an existing page rather
   than starting a near-duplicate.
2. Link it from `index.md` if it isn't reachable yet.
3. Append one line to `log.md` saying what changed and why.

Write for the reader who has forgotten everything, including you in three months.
Prose over bullet soup. Say what is true and how you know.

**Ingesting.** When given a source — a link, a file — fold what matters into the
wiki rather than pasting it in. Cite where it came from, so a reader can tell a
summary from original reasoning and go back to the source. Log what was ingested
and from where. If you only saw part of a long source, say so on the page; a
summary that claims more coverage than it had will be trusted by everything
downstream.

**Linting.** A lint is a *report*: contradictions, stale claims, orphan pages
nothing links to, and `[[wikilinks]]` pointing at pages that don't exist. It
writes nothing, however obvious the repair looks — the reader decides what to
fix, and that fix is an ordinary edit afterwards.

**Etiquette for multiple librarians.** More than one agent may work this wiki, and
they won't see each other's sessions. So: prefer appending to rewriting, keep
edits small and self-explanatory, and never delete someone else's page to make
room for your own version — reconcile the two on the page instead. Every turn
that writes anything lands as a single git commit, so `git log` is the record of
who changed what and when.
