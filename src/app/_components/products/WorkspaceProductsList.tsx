'use client';

import Link from 'next/link';
import { Skeleton } from '@mantine/core';
import { IconLayoutGrid } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import styles from './WorkspaceProductsList.module.css';

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function WorkspaceProductsList() {
  const { workspace, workspaceId } = useWorkspace();

  const { data: products, isLoading } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const basePath = workspace ? `/w/${workspace.slug}/products` : '';

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th>Name</th>
            <th style={{ width: 90 }}>Projects</th>
            <th style={{ width: 90 }}>Features</th>
            <th style={{ width: 90 }}>Tickets</th>
            <th style={{ width: 90 }}>Research</th>
            <th style={{ width: 110 }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className={styles.tableRow}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j}>
                    <Skeleton height={20} radius="sm" />
                  </td>
                ))}
              </tr>
            ))
          ) : !products || products.length === 0 ? (
            <tr>
              <td colSpan={6} className={styles.empty}>
                No products yet. Create your first product to start managing
                features, tickets, and research.
              </td>
            </tr>
          ) : (
            products.map((product) => (
              <tr key={product.id} className={styles.tableRow}>
                <td>
                  <div className={styles.nameCell}>
                    <div className={styles.iconBox}>
                      <IconLayoutGrid size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`${basePath}/${product.slug}`}
                        className={styles.nameText}
                      >
                        {product.name}
                      </Link>
                      {product.description ? (
                        <div className={styles.nameSub}>
                          {product.description}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>{product._count.projects}</td>
                <td>{product._count.features}</td>
                <td>{product._count.tickets}</td>
                <td>{product._count.researches}</td>
                <td>
                  <span className={styles.dateText}>
                    {formatDate(product.createdAt)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
