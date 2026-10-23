"use client";

import { IconBell, IconFolder, IconPlus } from "@tabler/icons-react";
import { Panel, Pill, SectionHeader, Toolbar, EmptyState } from "~/app/_components/ui";

/**
 * The gallery body. A client component because `EmptyState` takes an icon
 * *component* and a component cannot cross the server -> client boundary
 * as a prop. Everything else here would render on the server just fine.
 */

const RADII = ["xs", "sm", "md", "lg", "xl", "2xl", "full"] as const;
const SHADOWS = ["sm", "md", "lg", "xl"] as const;

export function UiGallery() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 py-6" data-testid="ui-gallery">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">UI primitives</h1>
        <p className="text-sm text-text-secondary">
          The shape tokens and the components that compose them. See
          dev-docs/styling-architecture.md, &ldquo;Shape tokens&rdquo; and
          &ldquo;Primitives&rdquo;.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <SectionHeader as="h2" title="Radius tokens" count={RADII.length} />
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r} className="flex flex-col items-center gap-1 text-xs text-text-muted">
              <div
                data-token={`radius-${r}`}
                className="h-14 w-14 border border-border-strong bg-surface-tertiary"
                style={{ borderRadius: `var(--radius-${r})` }}
              />
              <code>--radius-{r}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader as="h2" title="Shadow tokens" count={SHADOWS.length} />
        <div className="flex flex-wrap gap-6 py-2">
          {SHADOWS.map((s) => (
            <div key={s} className="flex flex-col items-center gap-2 text-xs text-text-muted">
              <div
                data-token={`shadow-${s}`}
                className="h-14 w-20 rounded-lg bg-background-elevated"
                style={{ boxShadow: `var(--shadow-${s})` }}
              />
              <code>--shadow-{s}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader as="h2" title="Panel" action={<code className="text-text-muted">variant · radius · padding · interactive · as</code>} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel data-testid="panel-default">
            <SectionHeader title="default" count={4} className="mb-2" />
            <p className="text-sm text-text-secondary">surface-secondary, border-primary, lg radius, p-4.</p>
          </Panel>
          <Panel variant="muted" data-testid="panel-muted">
            <SectionHeader title="muted" className="mb-2" />
            <p className="text-sm text-text-secondary">background-secondary, border-subtle. Meeting cards, list rows.</p>
          </Panel>
          <Panel variant="elevated" data-testid="panel-elevated">
            <SectionHeader title="elevated" className="mb-2" />
            <p className="text-sm text-text-secondary">background-elevated, shadow-md. Floats above the page.</p>
          </Panel>
          <Panel radius="md" padding="sm" data-testid="panel-md">
            <p className="text-sm text-text-secondary">radius md, padding sm: a list row.</p>
          </Panel>
          <Panel radius="xl" padding="lg" data-testid="panel-xl">
            <p className="text-sm text-text-secondary">radius xl, padding lg: a hero panel.</p>
          </Panel>
          <Panel as="button" type="button" interactive data-testid="panel-interactive">
            <p className="text-left text-sm text-text-secondary">interactive, as=&quot;button&quot;: hover me.</p>
          </Panel>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader as="h2" title="SectionHeader" />
        <Panel padding="lg" className="flex flex-col gap-5">
          <SectionHeader title="Needs your attention" icon={<IconBell size={14} />} count={4} />
          <SectionHeader
            title="Active projects"
            icon={<IconFolder size={14} />}
            count={5}
            action={<a className="text-text-secondary hover:text-text-primary" href="#">All projects</a>}
          />
          <SectionHeader title="Participants" action={<IconPlus size={14} className="text-text-muted" />} />
          <SectionHeader title="md size, h4" as="h4" size="md" />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader as="h2" title="Pill" action={<code className="text-text-muted">tone · size · icon</code>} />
        <Panel padding="lg" className="flex flex-wrap items-center gap-3">
          <Pill>neutral</Pill>
          <Pill tone="brand">brand</Pill>
          <Pill tone="warning">warning</Pill>
          <Pill tone="danger">due 15d ago</Pill>
          <Pill size="xs">xs 470</Pill>
          <Pill tone="brand" size="xs">5/7</Pill>
          <Pill icon={<IconBell size={12} />}>with icon</Pill>
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader as="h2" title="Toolbar" />
        <Panel padding="lg">
          <Toolbar aria-label="Example" bordered>
            <Toolbar.Group>
              <Pill>Filter: open</Pill>
              <Pill>Sort: due</Pill>
            </Toolbar.Group>
            <Toolbar.Spacer />
            <Toolbar.Group>
              <Pill tone="brand">New</Pill>
            </Toolbar.Group>
          </Toolbar>
          <p className="pt-3 text-sm text-text-secondary">Content below the bordered toolbar.</p>
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader as="h2" title="EmptyState" />
        <Panel padding="none">
          <EmptyState
            icon={IconFolder}
            title="No projects yet"
            message="Create one to see it here."
            action={<Pill tone="brand">Create project</Pill>}
          />
        </Panel>
      </section>
    </div>
  );
}
