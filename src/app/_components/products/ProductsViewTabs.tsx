'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconTable,
  IconLayoutGrid,
  IconLayoutList,
  IconRoute,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import styles from './ProductsViewTabs.module.css';

const VIEW_TABS = [
  { value: 'list', label: 'List', icon: IconTable, path: '/products' },
  { value: 'grid', label: 'Grid', icon: IconLayoutGrid, path: '/products-grid' },
  {
    value: 'projects',
    label: 'Products & Projects',
    icon: IconLayoutList,
    path: '/products-projects',
  },
  {
    value: 'roadmap',
    label: 'Product Roadmap',
    icon: IconRoute,
    path: '/products-roadmap',
  },
] as const;

type ViewTabValue = (typeof VIEW_TABS)[number]['value'];

interface ProductsViewTabsProps {
  actions?: ReactNode;
}

export function ProductsViewTabs({ actions }: ProductsViewTabsProps) {
  const { workspace } = useWorkspace();
  const pathname = usePathname();

  const prefix = workspace?.slug ? `/w/${workspace.slug}` : '';

  const activeTab: ViewTabValue = useMemo(() => {
    if (pathname.endsWith('/products-grid')) return 'grid';
    if (pathname.endsWith('/products-projects')) return 'projects';
    if (pathname.endsWith('/products-roadmap')) return 'roadmap';
    return 'list';
  }, [pathname]);

  return (
    <div className={styles.topBar}>
      <nav className={styles.viewTabs}>
        {VIEW_TABS.map(({ value, label, icon: Icon, path }) => (
          <Link
            key={value}
            href={`${prefix}${path}`}
            className={styles.viewTab}
            data-active={activeTab === value ? 'true' : 'false'}
          >
            <Icon size={13} stroke={1.75} />
            {label}
          </Link>
        ))}
      </nav>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
