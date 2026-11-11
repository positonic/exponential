# Databases are Pages with properties, for things that have no native entity

## Status

Accepted — 2026-10-31. Extends [ADR-0033](0033-knowledge-pages.md) (Pages) and [ADR-0039](0039-page-nesting-soft-link-graph.md) (structure is authored in the body); constrained by [ADR-0050](0050-key-results-accept-feature-execution-links.md) and [ADR-0069](0069-invite-only-pages.md).

## Context

Planning documents routinely need a small typed list that fits no Exponential entity — a metrics register inside a data-strategy page, a vendor list, a hiring pipeline — and today that list stays in Notion, taking the page around it along. Notion's answer is the inline database: a schema of properties, rows that are pages, views over them, relations between databases, and formulas and rollups on top.

Exponential's value is the opposite of schema-less: Ceremonies, the Daily summary, the Inbox and the agents all work because Tickets, Actions, Projects and Key results are typed and queryable. A general-purpose table is data none of those features understand. The design question was therefore not "can we build Notion databases" but "how do we get the inline typed list without growing a second, untyped copy of the work".

## Decision

1. **Scope boundary.** A database is for things that have no native entity. A property may *point at* a Ticket, Project, Feature, Goal, Key result or Page (a relation), but a database never replaces one, the product never suggests tracking work in a database, and agents treat a database as a page with structure, not as a work tracker. A "promote to Tickets" path is not built until someone asks.
2. **A database is a block in a Page body.** A `database` ProseMirror node, owned by the page that holds it, in the same way sub-pages are `pageLink` nodes (ADR-0039). No sidebar item, no route, no sharing of one database across pages (a Notion "linked view") in v1.
3. **Rows are Pages.** A row is a `KnowledgePage` that belongs to the database and carries its property values; it opens at the normal page URL with a body, comments, revisions and history. Row pages are hidden from the Pages list and tree, and are deleted with the block. Scalar values live on the row page; relation values live in one edge table (row, property, target).
4. **Access resolves through the holding page.** Rows have no access settings of their own: whoever can view or edit the page can view or edit every row; a row cannot be invite-only, published or placed on its own. Publishing the page publishes the table and its rows. This is deliberately not the sub-page rule of ADR-0069 ("sub-pages keep their own access"): a table with invisible rows is a broken table.
5. **Property types are a fixed set**: title, text, number, select, multi-select, date, checkbox, URL, person, relation, plus read-only created time / last edited time / created by. Relations are two-way between databases and one-way to native entities, which are never written through a database (a Key result's `currentValue` still moves only by check-in, ADR-0050). Formula, rollup, files, email, phone and status groups are out.
6. **One table view per block** in v1 (sort, filters, hidden columns, column order saved on the block). Board is the first follow-up; several named views per database is held back longest.
7. **Reads project, writes are typed.** The block projects into the holding page's Markdown `body` as a read-only table so search and agents read it. Writes go through `database.*` tRPC procedures with typed, schema-validated values, exposed through the CLI and MCP in the same release (ADR-0016: agents reuse the human write path). Nothing round-trips the Markdown table. CSV import ships in v1; the Notion move is a script over the write API, not a product importer.

## Considered alternatives

- **Custom fields on existing entities instead.** Solves "add story points to tickets", not "a metrics register in a planning page"; the two are different asks and this ADR takes the second. Custom fields remain open as separate work.
- **A lightweight `DatabaseRow` model with a JSON `properties` field, "open as page" on demand.** Cheaper to build, but every row feature — comments, revisions, agent writes, search, URLs — would be built twice or skipped, and migrating thousands of rows into Pages later is the risky direction. Rejected as the hard-to-reverse mistake.
- **Databases as a top-level entity pages embed by reference.** Gives linked views and cross-page sharing, at the cost of new navigation and an access model that no longer follows the page. Additive later if needed; not taken now.
- **Rows keep their own access, like sub-pages.** Consistent with ADR-0069 but produces tables where some rows are missing for some readers and 300 share settings per database. Rejected.
- **Formulas and rollups in v1.** Each costs more than the rest of the feature and is the point where a block becomes an application. Named out of scope so the question isn't reopened per ticket.

## Consequences

- A 500-row database is 500 pages with revision rows. Accepted; agent and import writes create one revision per row (ADR-0074), so a 400-row import is 400 revisions.
- Glossary terms: **Database**, **Row**, **Property**, **Relation** in `CONTEXT.md`. The static Tiptap grid stays "table"; the new block is never called one.
- The Postgres database is called "Postgres" in prose where ambiguity would bite.
- Access checks resolve the holding page once per request, not per row.
