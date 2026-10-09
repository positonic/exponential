'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';
import { IconSearch } from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';
import styles from './ListPage.module.css';

/** Top bar: view tabs / filter pills on the left, actions on the right. */
export function ListPageTopBar({ left, actions }: { left: ReactNode; actions: ReactNode }) {
  return (
    <div className={styles.topBar}>
      <div className={styles.topBarLeft}>{left}</div>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}

export interface ListPageViewTab<T extends string> {
  value: T;
  label: string;
  icon: TablerIcon;
  /** A route per view. Omit it for views held in local state; the tab is
   *  then a button and `onTabClick` does the switching. */
  href?: string;
}

/** Pill tab strip that switches between a page's views. */
export function ListPageViewTabs<T extends string>({
  tabs,
  active,
  onTabClick,
  'aria-label': ariaLabel,
}: {
  tabs: readonly ListPageViewTab<T>[];
  active: T;
  onTabClick?: (value: T) => void;
  'aria-label'?: string;
}) {
  return (
    <nav className={styles.viewTabs} aria-label={ariaLabel}>
      {tabs.map(({ value, label, icon: Icon, href }) => {
        const isActive = active === value;
        const content = (
          <>
            <Icon size={13} stroke={1.75} />
            {label}
          </>
        );
        return href ? (
          <Link
            key={value}
            href={href}
            className={styles.viewTab}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => onTabClick?.(value)}
          >
            {content}
          </Link>
        ) : (
          <button
            key={value}
            type="button"
            className={styles.viewTab}
            data-active={isActive ? 'true' : 'false'}
            aria-pressed={isActive}
            onClick={() => onTabClick?.(value)}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}

interface ListPageSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Compact search box that widens on focus; Escape blurs it. Forward the ref to
 * `usePageSearchHotkey` so ⌘F lands here.
 */
export const ListPageSearch = forwardRef<HTMLInputElement, ListPageSearchProps>(
  function ListPageSearch({ value, onChange, placeholder = 'Search  ⌘F' }, ref) {
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') e.currentTarget.blur();
    };

    return (
      <div className={styles.searchWrap}>
        <IconSearch className={styles.searchIcon} size={13} stroke={1.75} />
        <input
          ref={ref}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
      </div>
    );
  },
);

interface ListPageButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Highlights the button, e.g. while its sort or toggle is applied. */
  active?: boolean;
  /** A count badge after the label (applied filters); hidden at 0. */
  count?: number;
}

/**
 * Secondary toolbar button. Forwards its ref and spreads props so it works as
 * a Mantine `Menu.Target` / `Popover.Target`.
 */
export const ListPageButton = forwardRef<HTMLButtonElement, ListPageButtonProps>(
  function ListPageButton(
    { active, count, className, type = 'button', children, 'aria-label': ariaLabel, ...props },
    ref,
  ) {
    const hasCount = count !== undefined && count > 0;
    return (
      <button
        ref={ref}
        type={type}
        className={className ? `${styles.button} ${className}` : styles.button}
        data-active={active ? 'true' : 'false'}
        // An explicit aria-label replaces the button's content as its name,
        // so the count has to be folded into it to be announced at all.
        aria-label={ariaLabel && hasCount ? `${ariaLabel}, ${count} active` : ariaLabel}
        {...props}
      >
        {children}
        {hasCount && <span className={styles.count}>{count}</span>}
      </button>
    );
  },
);

/** The page's one primary action ("New project", "New ticket"). */
export const ListPagePrimaryButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function ListPagePrimaryButton({ className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={className ? `${styles.primaryButton} ${className}` : styles.primaryButton}
      {...props}
    />
  );
});
