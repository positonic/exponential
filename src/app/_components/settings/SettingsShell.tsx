'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { IconChevronRight, type Icon as TablerIcon } from '@tabler/icons-react';

/* ------------------------------------------------------------------
 * Settings shell primitives — Left-nav variant.
 * All visuals bind to project design tokens (bg-background-*, text-text-*,
 * border-border-*). Never introduce hardcoded hex values here.
 * ---------------------------------------------------------------- */

export function SettingsShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1200px]">{children}</div>;
}

interface HeroStat {
  label: string;
  value: ReactNode;
}
export function SettingsHero({
  eyebrow,
  title,
  icon: Icon,
  description,
  stats,
}: {
  eyebrow?: string;
  title: string;
  icon?: TablerIcon;
  description?: string;
  stats?: HeroStat[];
}) {
  return (
    <div className="px-6 md:px-10 pt-7">
      {eyebrow && (
        <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
          {eyebrow}
        </div>
      )}
      <h1 className="m-0 flex items-center gap-3 text-[26px] font-semibold tracking-tight text-text-primary">
        {Icon && <Icon size={22} className="text-text-muted" />}
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 max-w-[640px] text-[13.5px] text-text-muted">
          {description}
        </p>
      )}
      {stats && stats.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-4 border-b border-border-primary pb-5 text-xs text-text-muted">
          {stats.map((stat, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && (
                <span className="h-[3px] w-[3px] rounded-full bg-text-disabled" />
              )}
              <span>
                <b className="font-medium text-text-secondary">{stat.value}</b>{' '}
                {stat.label}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsLayout({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid w-full grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] items-start gap-7 px-6 md:px-10 pt-7 pb-16">
      <aside className="md:sticky md:top-5 flex flex-row md:flex-col flex-wrap gap-0.5">
        {sidebar}
      </aside>
      <div className="min-w-0 w-full">{children}</div>
    </div>
  );
}

export interface SidebarItem<T extends string = string> {
  id: T;
  label: string;
  icon: TablerIcon;
  badge?: string | number;
  href?: string;
}
export interface SidebarGroup<T extends string = string> {
  title?: string;
  items: SidebarItem<T>[];
}

export function SettingsSidebar<T extends string = string>({
  groups,
  activeId,
  onSelect,
}: {
  groups: SidebarGroup<T>[];
  activeId?: T;
  onSelect?: (id: T) => void;
}) {
  return (
    <>
      {groups.map((group, gi) => (
        <div key={gi} className="contents">
          {group.title && (
            <div className="hidden md:block mt-1.5 first:mt-0 px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              {group.title}
            </div>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = activeId === item.id;
            const cls = `group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[12.5px] font-medium text-left transition-colors ${
              active
                ? 'bg-surface-tertiary text-text-primary'
                : 'text-text-secondary hover:bg-background-elevated hover:text-text-primary'
            }`;
            const content = (
              <>
                {active && (
                  <span className="absolute -left-3 top-2 bottom-2 w-[2px] rounded-sm bg-brand-primary" />
                )}
                <Icon
                  size={14}
                  className={active ? 'text-brand-primary' : 'text-text-muted'}
                />
                <span className="truncate">{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`ml-auto rounded-[10px] px-1.5 py-[1px] text-[10.5px] tabular-nums ${
                      active
                        ? 'bg-brand-primary/15 text-brand-primary'
                        : 'bg-surface-tertiary text-text-muted'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            );
            if (item.href) {
              return (
                <Link key={item.id} href={item.href} className={cls}>
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect?.(item.id)}
                className={cls}
              >
                {content}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function SettingsSection({
  icon: Icon,
  title,
  count,
  description,
  action,
  children,
  flush,
}: {
  icon?: TablerIcon;
  title: string;
  count?: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <div className="mb-[18px] w-full rounded-[10px] border border-border-primary bg-background-secondary">
      <div className="flex items-start justify-between gap-3.5 border-b border-border-primary px-[22px] pt-[18px] pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.005em] text-text-primary">
            {Icon && (
              <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-surface-tertiary text-text-secondary">
                <Icon size={14} />
              </span>
            )}
            {title}
            {count !== undefined && (
              <span className="ml-1 text-[11.5px] font-normal text-text-muted">
                {count}
              </span>
            )}
          </div>
          {description && (
            <div className="mt-1 ml-9 max-w-[540px] text-[12.5px] text-text-muted">
              {description}
            </div>
          )}
        </div>
        {action}
      </div>
      <div className={flush ? '' : 'px-[22px] pt-4 pb-[18px]'}>{children}</div>
    </div>
  );
}

export function SettingsField({
  label,
  sublabel,
  children,
  action,
  mono,
}: {
  label: string;
  sublabel?: string;
  children: ReactNode;
  action?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr_auto] items-center gap-4 border-t border-border-primary py-3 first:border-t-0 first:pt-0.5">
      <div className="text-[12.5px] font-medium text-text-secondary">
        {label}
        {sublabel && (
          <span className="block mt-0.5 text-[11px] font-normal text-text-muted">
            {sublabel}
          </span>
        )}
      </div>
      <div
        className={`min-w-0 text-[13px] text-text-primary ${
          mono ? 'font-mono text-[12.5px] text-text-secondary' : ''
        }`}
      >
        {children}
      </div>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}

export function SettingsPill({
  variant = 'neutral',
  children,
}: {
  variant?: 'team' | 'owner' | 'admin' | 'neutral' | 'active' | 'linked';
  children: ReactNode;
}) {
  const styles: Record<typeof variant, string> = {
    team: 'bg-brand-primary/15 text-brand-primary',
    admin: 'bg-brand-primary/15 text-brand-primary',
    owner: 'bg-[var(--accent-okr)]/15 text-[var(--accent-okr)]',
    neutral: 'bg-surface-tertiary text-text-secondary',
    active: 'bg-[var(--accent-crm)]/15 text-[var(--accent-crm)]',
    linked: 'bg-surface-tertiary text-text-muted',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[10px] px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-[0.03em] tabular-nums ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function SettingsFieldButton({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-transparent border-0 cursor-pointer text-[11.5px] text-text-muted hover:text-brand-primary transition-colors"
    >
      {children}
    </button>
  );
}

export function SettingsDangerRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3.5 border-t border-[var(--accent-due)]/20 py-3 first-of-type:mt-1">
      <div>
        <div className="text-[13px] font-medium text-text-primary">{title}</div>
        <div className="mt-0.5 max-w-[540px] text-[12px] text-text-muted">
          {description}
        </div>
      </div>
      <div>{action}</div>
    </div>
  );
}

export function SettingsDangerZone({
  icon: Icon,
  children,
}: {
  icon: TablerIcon;
  children: ReactNode;
}) {
  return (
    <div className="mb-16 rounded-[10px] border border-[var(--accent-due)]/30 bg-background-secondary p-[22px]">
      <div className="mb-1.5 flex items-center gap-2.5 text-[13px] font-semibold tracking-[0.02em] text-[var(--accent-due)]">
        <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-[var(--accent-due)]/15">
          <Icon size={12} />
        </span>
        Danger zone
      </div>
      {children}
    </div>
  );
}

/**
 * Chevron link for sidebar items that navigate elsewhere (e.g. plugins).
 * Rendered inline next to a label in a section body.
 */
export function SettingsRowLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: TablerIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3.5 border-t border-border-primary px-[22px] py-3.5 first:border-t-0 hover:bg-background-elevated transition-colors"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-lg bg-surface-tertiary text-text-secondary flex-shrink-0">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-text-primary">{title}</div>
          <div className="mt-0.5 max-w-[520px] text-[12px] text-text-muted">
            {description}
          </div>
        </div>
      </div>
      <IconChevronRight size={16} className="text-text-muted flex-shrink-0" />
    </Link>
  );
}
