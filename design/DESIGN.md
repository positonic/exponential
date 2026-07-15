---
name: Exponential
description: The operating system for AI-native organizations - focused, quiet, precise product UI.
colors:
  brand-primary: "#1F5DE0"
  brand-primary-hover: "#3D75FF"
  brand-primary-active: "#1A4EC4"
  bg-primary-dark: "#1a1b1e"
  bg-secondary-dark: "#25262b"
  surface-secondary-dark: "#2C2E33"
  surface-hover-dark: "#373A40"
  text-primary-dark: "#ffffff"
  text-secondary-dark: "#C1C2C5"
  text-muted-dark: "#909296"
  border-primary-dark: "#373A40"
  border-focus: "#339af0"
  success: "#51cf66"
  warning: "#ffd43b"
  error: "#fa5252"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    letterSpacing: "0.05em"
    textTransform: "uppercase"
  display:
    fontFamily: "var(--font-inter), -apple-system, sans-serif"
    fontWeight: 700
  mono:
    fontFamily: "var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace)"
    fontSize: "0.75rem"
---

# Exponential Design System

## 1. Overview

**Creative North Star: "The quiet cockpit"**

Dense, dark-first product UI where the interface recedes and the work is the color. Every value on this page is extracted from the live tokens in `src/styles/colors.ts`, `src/styles/globals.css`, and `src/styles/mantineTheme.ts` - **those files are the source of truth; this document is their portrait.** Both a light and dark theme exist (CSS variables switch them); dark is the primary design target. Stack: Next.js 15, Mantine v7 themed via CSS variables, Tailwind with semantic class names only.

## 2. Colors

Colors are consumed exclusively through semantic tokens (`bg-background-primary`, `text-text-muted`, `border-border-focus`, ...) or CSS variables (`var(--color-brand-primary)`). **Hardcoded hex/rgb values fail the build** - this is enforced by pre-commit hooks and ESLint.

### Primary
- **Brand Blue** (#1F5DE0, hover #3D75FF, active #1A4EC4): primary actions, current selection, links. Used sparingly - an accent, not a theme.

### Neutral
- **Ink stack (dark)**: backgrounds #1a1b1e → #25262b (elevated/secondary) → #2C2E33 (tertiary); surfaces hover #373A40, active #495057.
- **Text stack (dark)**: #ffffff primary, #C1C2C5 secondary, #909296 muted, #5C5F66 disabled.
- **Borders (dark)**: #373A40 primary, #339af0 focus.

### Tertiary
- **Semantic states**: success #51cf66, warning #ffd43b, error #fa5252, info #339af0 (dark values; light theme variants in colors.ts).
- **Domain accents** (`accent.*`): ritual #6B8CFF, meetings #A78BFA, crm #4ADE8C, okr #F5B94A, due #F87171 - one hue per domain, identification only.
- **Status vocabularies**: ticket statuses and feature lifecycle map to Mantine color names via `~/lib/ticket-statuses` and `~/lib/feature-statuses` - always render status color through those maps, never ad hoc.
- **Calendar event family**: 7 hues harmonized at ~L0.72/C0.10 OKLCH (see colors.ts `event.*`); tints derived via color-mix.

### Named Rules
**The Semantic Token Rule.** No literal color values in component code, ever. If a color is missing, add a token; never inline a hex.
**The Meaningful Color Rule.** Color encodes state, status, priority, or identity. Decoration stays neutral.

## 3. Typography

**Body Font:** the system stack via Mantine's default (`-apple-system` → SF Pro on macOS, Segoe UI on Windows, Roboto on Android). No app-level base font is set: `<body>` carries no font class, so Mantine's default stack governs all product UI.
**Display Font:** Inter, loaded via next/font at weights 700/800/900 only (`--font-inter`), used by marketing/home components. GeistSans is also loaded (`--font-geist-sans`, Tailwind `font-sans`) but only applies where that class is used.
**Label/Mono Font:** JetBrains Mono (ui-monospace fallbacks) - IDs (`PPV-12`), branch names, code.

**Character:** One quiet sans carries everything; the mono face marks machine-generated identifiers. Hierarchy comes from weight and case, not family. **Known drift:** three sans families are loaded/declared (system, Inter-bold, Geist) while product UI actually renders the system stack; committing to one base font (and setting it on the Mantine theme) is an open decision.

### Hierarchy
- **Title** (700, 1.25rem, tight): entity titles on detail pages and peeks; rendered as invisible inputs when editable.
- **Body** (400, 0.875rem / `size="sm"`): prose, comments, cell content.
- **Control** (500, 0.8rem / `size="xs"`): buttons, inputs, selects, table text - the app's working density.
- **Label** (600, 0.75rem, +0.05em, UPPERCASE): section headers (`ACTIVITY`, `ACTIONS`), group headers, sidebar labels - always `text-text-muted`.
- **Micro** (500, 0.625-0.7rem): counts, badges, timestamps.

### Named Rules
**The Uppercase Section Rule.** Every content section opens with the chevron + uppercase muted label (see `CollapsibleSection`). No bespoke section headers.

## 4. Elevation

Flat by default; hierarchy comes from the background stack (background → surface → elevated) rather than shadows. Borders (`border-border-primary`, 1px) do the separating; `--color-bg-elevated` marks overlays (drawers, popovers, menus). Mantine's default `shadow="md"` appears only on floating overlays (menus, popovers, the bulk-action bar). Cards are `radius="md"` with a 1px border, no shadow.

## 5. Components

Mantine v7 is the component base, themed in `src/styles/mantineTheme.ts`; Tailwind handles layout. Established vocabulary - reuse, never reinvent:

- **PropertyPill / PillRow** (`product/PropertyPill`): the compact property editor - 28px pill, icon + value, menu on click; ghost (dashed, dimmed) when unset; icon-only circle for ⋯ overflow; visible focus ring.
- **CollapsibleSection**: chevron + uppercase label header for every detail-page/peek section.
- **ActivityFeed + ActivityComposer** (+ `useXActivity` hooks): THE activity paradigm for every entity - comment cards, inline edit, relative timestamps, markdown composer with @mentions.
- **PeekDrawer**: right-side detail-over-list (760/1080px), prev/next, expand-to-full-page.
- **CommentInput / MarkdownInput**: the only prose inputs (ADR-0017 - Markdown canonical, never a bare Textarea).
- **MarkdownRenderer**: the only prose display.
- **SelectSlot / BulkActionBar** (`shared/multiSelect`): hover-swap selection checkboxes (zero layout shift) + floating bulk bar.
- Status/priority rendering: `PriorityIcon`, status `Badge`s colored via the status maps.

Interaction states: default, hover (`hover:bg-surface-hover` / `hover:border-border-focus`), visible focus, disabled, loading (skeletons, not spinners), empty (teaching copy, e.g. "No comments yet. Start the discussion!").

## 6. Do's and Don'ts

**Do**
- Use semantic tokens and the shared component vocabulary; when a pattern exists (pill, section, feed, drawer), extend it in place so every consumer inherits the change.
- Keep interactions optimistic: patch the cache, roll back on error - the user never waits to see their own edit.
- Let familiarity win: standard affordances, 150-250ms transitions that convey state, density where experts need it.

**Don't**
- No hardcoded colors (build fails), no `react-markdown` imports, no bare `Textarea` for prose, no new Tiptap editors.
- No Jira-style toolbar clutter, no AI-startup gradients/glassmorphism, no admin-template default look, no consumer softness (mascots, celebrations), no stuffing every capability onto one screen.
- No decorative motion, no orchestrated load sequences, no modals where inline or a peek will do.
