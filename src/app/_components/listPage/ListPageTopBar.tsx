'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';
import { IconSearch } from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';
import styles from './ListPage.module.css';

/**
 * The class every list-page toolbar button wears. Exported for components
 * that render their own trigger (e.g. `ProjectFilterPopover`'s
 * `triggerClassName`) so it matches its `ListPageButton` siblings.
 */
export const listPageButtonClassName = styles.button;

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
  href: string;
}

/** Pill tab strip that switches between a page's views, one route each. */
export function ListPageViewTabs<T extends string>({
  tabs,
  active,
  onTabClick,
}: {
  tabs: readonly ListPageViewTab<T>[];
  active: T;
  onTabClick?: (value: T) => void;
}) {
  return (
    <nav className={styles.viewTabs}>
      {tabs.map(({ value, label, icon: Icon, href }) => (
        <Link
          key={value}
          href={href}
          className={styles.viewTab}
          data-active={active === value ? 'true' : 'false'}
          onClick={() => onTabClick?.(value)}
        >
          <Icon size={13} stroke={1.75} />
          {label}
        </Link>
      ))}
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
}

/**
 * Secondary toolbar button. Forwards its ref and spreads props so it works as
 * a Mantine `Menu.Target` / `Popover.Target`.
 */
export const ListPageButton = forwardRef<HTMLButtonElement, ListPageButtonProps>(
  function ListPageButton({ active, className, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={className ? `${styles.button} ${className}` : styles.button}
        data-active={active ? 'true' : 'false'}
        {...props}
      />
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
