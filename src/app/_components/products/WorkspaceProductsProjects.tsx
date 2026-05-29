'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Avatar, Menu, Skeleton, Tooltip } from '@mantine/core';
import {
  IconChevronRight,
  IconDotsVertical,
  IconLayoutGrid,
  IconPlus,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CreateProjectModal } from '~/app/_components/CreateProjectModal';
import { getAvatarColor, getInitial } from '~/utils/avatarColors';
import { slugify } from '~/utils/slugify';
import type { ProjectStatus, ProjectPriority } from '~/types/project';
import type { RouterOutputs } from '~/trpc/react';
import styles from './WorkspaceProductsProjects.module.css';

interface ProductOption {
  value: string;
  label: string;
}

type ListWithProjects = RouterOutputs['product']['product']['listWithProjects'];
type ProductWithProjects = ListWithProjects['products'][number];
type ProjectItem = ListWithProjects['unassignedProjects'][number];

const UNASSIGNED_KEY = '__unassigned__';

function getProjectStatusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'ACTIVE':
      return {
        background: 'var(--mantine-color-green-light)',
        color: 'var(--mantine-color-green-light-color)',
      };
    case 'ON_HOLD':
      return {
        background: 'var(--mantine-color-yellow-light)',
        color: 'var(--mantine-color-yellow-light-color)',
      };
    case 'COMPLETED':
      return {
        background: 'var(--mantine-color-blue-light)',
        color: 'var(--mantine-color-blue-light-color)',
      };
    default:
      return {
        background: 'var(--mantine-color-gray-light)',
        color: 'var(--mantine-color-gray-light-color)',
      };
  }
}

function getProjectStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Active',
    ON_HOLD: 'On Hold',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return labels[status] ?? status;
}

function getPriorityStyle(priority: string): React.CSSProperties {
  switch (priority) {
    case 'HIGH':
      return {
        background: 'var(--mantine-color-red-light)',
        color: 'var(--mantine-color-red-light-color)',
      };
    case 'MEDIUM':
      return {
        background: 'var(--mantine-color-orange-light)',
        color: 'var(--mantine-color-orange-light-color)',
      };
    case 'LOW':
      return {
        background: 'var(--mantine-color-blue-light)',
        color: 'var(--mantine-color-blue-light-color)',
      };
    default:
      return {
        background: 'var(--mantine-color-gray-light)',
        color: 'var(--mantine-color-gray-light-color)',
      };
  }
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
    NONE: 'None',
  };
  return labels[priority] ?? priority;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function ProgressRing({ progress, size = 20 }: { progress: number; size?: number }) {
  const r = (size - 3) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(progress, 100) / 100) * circ;
  const color =
    progress >= 60
      ? 'var(--mantine-color-green-6)'
      : progress >= 20
        ? 'var(--brand-400)'
        : 'var(--mantine-color-gray-5)';
  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-border-primary)"
        strokeWidth={2.5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProjectChildRow({
  project,
  prefix,
  productOptions,
  currentProductId,
  onMove,
}: {
  project: ProjectItem;
  prefix: string;
  productOptions: ProductOption[];
  currentProductId: string | null;
  onMove: (project: ProjectItem, productId: string | null) => void;
}) {
  const href = `${prefix}/projects/${slugify(project.name)}-${project.id}`;
  return (
    <tr className={styles.projectRow}>
      <td className={styles.nameCol}>
        <div className={styles.projectNameCell}>
          <ProgressRing progress={project.progress ?? 0} />
          <Link href={href} className={styles.projectName}>
            {project.name}
          </Link>
          <Menu position="bottom-start" withinPortal shadow="md">
            <Menu.Target>
              <button
                className={styles.moveBtn}
                type="button"
                aria-label="Move project to product"
                onClick={(e) => e.stopPropagation()}
              >
                <IconDotsVertical size={14} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Move to product</Menu.Label>
              {productOptions.map((opt) => (
                <Menu.Item
                  key={opt.value}
                  disabled={opt.value === currentProductId}
                  onClick={() => onMove(project, opt.value)}
                >
                  {opt.label}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item
                disabled={currentProductId === null}
                onClick={() => onMove(project, null)}
              >
                No product
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </td>
      <td>
        <span className={styles.muted}>{formatDate(project.endDate)}</span>
      </td>
      <td>
        <span className={styles.chip} style={getProjectStatusStyle(project.status)}>
          {getProjectStatusLabel(project.status)}
        </span>
      </td>
      <td>
        <span className={styles.chip} style={getPriorityStyle(project.priority)}>
          {getPriorityLabel(project.priority)}
        </span>
      </td>
      <td>
        {project.dri ? (
          <Tooltip
            label={project.dri.name ?? project.dri.email ?? 'Unknown'}
            withArrow
          >
            <Avatar
              src={project.dri.image}
              size={24}
              radius="xl"
              color={getAvatarColor(project.dri.id)}
            >
              {getInitial(project.dri.name ?? project.dri.email)}
            </Avatar>
          </Tooltip>
        ) : (
          <span className={styles.muted}>—</span>
        )}
      </td>
    </tr>
  );
}

interface GroupRowProps {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  isUnassigned?: boolean;
  productId?: string;
  onProjectChanged?: () => void;
}

function GroupRow({
  label,
  count,
  isExpanded,
  onToggle,
  isUnassigned = false,
  productId,
  onProjectChanged,
}: GroupRowProps) {
  return (
    <tr className={styles.groupRow} onClick={onToggle}>
      <td className={styles.nameCol}>
        <div className={styles.groupNameCell}>
          <button
            className={styles.expandBtn}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <IconChevronRight
              size={14}
              stroke={2}
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 160ms',
              }}
            />
          </button>
          {!isUnassigned && (
            <span className={styles.productIcon}>
              <IconLayoutGrid size={16} />
            </span>
          )}
          <span
            className={isUnassigned ? styles.groupNameMuted : styles.groupName}
          >
            {label}
          </span>
          {count > 0 && <span className={styles.countBadge}>{count}</span>}
          {!isUnassigned && productId && (
            <span onClick={(e) => e.stopPropagation()}>
              <CreateProjectModal
                prefillProductId={productId}
                onClose={onProjectChanged}
              >
                <button
                  className={styles.addProjectBtn}
                  type="button"
                  aria-label="Add project to product"
                >
                  <IconPlus size={13} stroke={2} />
                  Add project
                </button>
              </CreateProjectModal>
            </span>
          )}
        </div>
      </td>
      <td>
        <span className={styles.muted}>—</span>
      </td>
      <td>
        <span className={styles.muted}>—</span>
      </td>
      <td>
        <span className={styles.muted}>—</span>
      </td>
      <td>
        <span className={styles.muted}>—</span>
      </td>
    </tr>
  );
}

export function WorkspaceProductsProjects() {
  const { workspace, workspaceId } = useWorkspace();
  const prefix = workspace?.slug ? `/w/${workspace.slug}` : '';

  const { data, isLoading } = api.product.product.listWithProjects.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const utils = api.useUtils();
  const moveProject = api.project.update.useMutation({
    onSuccess: () => void utils.product.product.listWithProjects.invalidate(),
  });

  // Track collapsed groups; default is everything expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const products: ProductWithProjects[] = data?.products ?? [];
  const unassignedProjects: ProjectItem[] = data?.unassignedProjects ?? [];

  const productOptions: ProductOption[] = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name })),
    [products],
  );

  const handleMove = useCallback(
    (project: ProjectItem, productId: string | null) => {
      moveProject.mutate({
        id: project.id,
        name: project.name,
        status: project.status as ProjectStatus,
        priority: project.priority as ProjectPriority,
        productId,
      });
    },
    [moveProject],
  );

  const handleProjectChanged = useCallback(() => {
    void utils.product.product.listWithProjects.invalidate();
  }, [utils]);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th className={styles.nameCol}>Name</th>
            <th style={{ width: 90 }}>ETA</th>
            <th style={{ width: 120 }}>Status</th>
            <th style={{ width: 110 }}>Priority</th>
            <th style={{ width: 60 }}>DRI</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border-secondary)' }}>
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j} style={{ padding: '10px 12px' }}>
                    <Skeleton height={18} radius="sm" />
                  </td>
                ))}
              </tr>
            ))
          ) : products.length === 0 && unassignedProjects.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.empty}>
                No products or projects yet.
              </td>
            </tr>
          ) : (
            <>
              {products.map((product) => {
                const isExpanded = !collapsed.has(product.id);
                return (
                  <React.Fragment key={product.id}>
                    <GroupRow
                      label={product.name}
                      count={product._count.projects}
                      isExpanded={isExpanded}
                      onToggle={() => toggle(product.id)}
                      productId={product.id}
                      onProjectChanged={handleProjectChanged}
                    />
                    {isExpanded &&
                      product.projects.map((project) => (
                        <ProjectChildRow
                          key={project.id}
                          project={project}
                          prefix={prefix}
                          productOptions={productOptions}
                          currentProductId={product.id}
                          onMove={handleMove}
                        />
                      ))}
                  </React.Fragment>
                );
              })}

              {unassignedProjects.length > 0 && (
                <React.Fragment>
                  <GroupRow
                    label="Unassigned"
                    count={unassignedProjects.length}
                    isExpanded={!collapsed.has(UNASSIGNED_KEY)}
                    onToggle={() => toggle(UNASSIGNED_KEY)}
                    isUnassigned
                  />
                  {!collapsed.has(UNASSIGNED_KEY) &&
                    unassignedProjects.map((project) => (
                      <ProjectChildRow
                        key={project.id}
                        project={project}
                        prefix={prefix}
                        productOptions={productOptions}
                        currentProductId={null}
                        onMove={handleMove}
                      />
                    ))}
                </React.Fragment>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
