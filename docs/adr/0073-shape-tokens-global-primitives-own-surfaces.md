---
status: accepted
---

# Shape tokens are global and primitives own surfaces; feature CSS consumes, never declares

Colour has had design tokens, an ESLint rule and a pre-commit hook since early on, and every page converged on them. Shape (corner radius, elevation) had none, so each LLM-driven redesign chose its own: Tailwind's scale on one page, Mantine's (md 8px, lg 16px, xl 32px) on another, raw pixels in a feature stylesheet, or `--radius-*` tokens declared inside one page's CSS scope. Four radius vocabularies coexisted and "md" meant 6px in Tailwind and 8px in Mantine. The meeting detail page rendered square cards from its first redesign (#154) because its stylesheet referenced `var(--radius-md)` and that token existed only inside two other pages' blocks; an undefined custom property invalidates the declaration, so the browser drew 0 and nothing reported it.

We decided (October 2026, #952 and #953):

1. **One radius scale and one elevation scale, declared once on `:root`** (`--radius-xs|sm|md|lg|xl|2xl|full`, `--shadow-sm|md|lg|xl`). Tailwind's `borderRadius`/`boxShadow` theme and Mantine's `radius`/`shadows` theme read those variables, so `rounded-md`, `radius="md"` and `var(--radius-md)` are the same number. The values are Tailwind's native scale (lg = 8px) because 600+ call sites already meant that and models have strong priors for it. Mantine's `xl` is the one asymmetry: it is the pill radius, because Mantine's own Avatar, Badge and Pill rely on it.
2. **A feature stylesheet consumes tokens and never declares `--radius-*`, `--shadow-*` or a per-page copy of them.** A page that needs a new step adds it to `:root` and the table in `dev-docs/styling-architecture.md`.
3. **Primitives in `src/app/_components/ui/` are the only place a surface is composed.** `Panel` owns surface, border, radius and padding; `SectionHeader`, `Pill` and `Toolbar` own the other three recurring shapes. A caller's `className` is appended, never merged, so it can add layout but cannot repaint the box; a missing look becomes a variant, not an override. The primitives are dependency-free and server-safe.
4. **Enforcement is mechanical, because documentation alone did not work for colour either.** ESLint rejects arbitrary `rounded-[…]`/`shadow-[…]`, numeric `radius={n}` and numeric `borderRadius`. `scripts/check-design-tokens.ts` hard-fails on any `var(--x)` declared nowhere under `src/` and ratchets raw radius, raw shadow and hand-rolled surfaces per file against a committed baseline: counts may only go down, new files must be clean. It runs in `npm run check`, the pre-commit hook and CI.

## Considered options

- **Adopt the design-handoff scale (lg 10px, xl 14px) that three redesigns independently chose.** Rejected: it would move 170 `rounded-lg` and 35 `rounded-xl` call sites by 2px for no functional gain, and it contradicts the scale every model and every Tailwind reader already assumes. Hand-off mocks that say 10px map to `lg`; the scale wins over the mock.
- **Keep Mantine's stock scale and map Tailwind onto it.** Rejected: Mantine's lg 16px and xl 32px are far larger than anything the product uses outside pills, and 366 `radius="md"` call sites would jump from 8px to… 8px while every `rounded-md` moved. Pulling Mantine onto the shared scale changes fewer pixels.
- **Extract the primitives into a package (`@exponential/ui`).** Rejected for now: one app, two developers, no second consumer. A package adds publishing, versioning and a second repo in every session's context, which slows LLM iteration without addressing the actual problem, which was governance. Revisit if a second React consumer appears.
- **A stylelint configuration instead of a bespoke script.** Rejected: the available plugins check syntax, not whether a variable resolves across scopes (the exact bug here), and cannot ratchet. The script is 300 lines, unit-tested, and also covers TSX style objects and class strings.
- **Big-bang migration of the ~400 legacy raw values.** Rejected in favour of the ratchet: the blast radius of one PR touching 50 stylesheets is unreviewable, and new code is where consistency is won. Pages migrate as they are touched, highest-traffic first, because those are the ones future sessions copy.

## Consequences

- A `var()` that resolves to nothing is now a build failure rather than a silent square corner, inherited font or missing border; the first run found eleven such references, including the example in CLAUDE.md.
- Mantine components render 2px tighter (`md`) and modals noticeably tighter (`lg` 16px → 8px). This is the intended convergence, not drift.
- The baseline file `scripts/design-tokens-baseline.json` is a visible debt ledger. Lowering it is a legitimate PR on its own.
- A new look must be expressed as a primitive variant. That is friction by design: variants are design decisions reviewed in one place, class soup was not.
- The feature stylesheets with their own `--mp-`, `--ch-`, `--td-` namespaces remain as the migration backlog; they are allowed for layout and page-specific colour tints, not for shape.

Supersedes nothing. Related: the colour rules in `dev-docs/styling-architecture.md`, which this extends to shape.
