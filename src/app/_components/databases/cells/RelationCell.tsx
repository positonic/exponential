"use client";

import Link from "next/link";
import type { RelationTarget } from "~/lib/databases/relations";
import styles from "../DatabaseBlock.module.css";

interface RelationCellProps {
  targets: readonly RelationTarget[];
}

/**
 * A relation cell: one pill per target, linking to the target where the
 * reader may open it. Targets are resolved by the server (`listRows`), so
 * the cell shows the row's or entity's current title, never a stored copy.
 */
export function RelationCell({ targets }: RelationCellProps) {
  if (targets.length === 0) return <span className={styles.cellEmpty}>—</span>;
  return (
    <span className={styles.pillButton}>
      {targets.map((target) => {
        const label = target.deleted ? "(deleted)" : target.title;
        return target.href && !target.deleted ? (
          <Link
            key={`${target.kind}:${target.id}`}
            href={target.href}
            className={styles.relationPill}
            onClick={(e) => e.stopPropagation()}
          >
            {label}
          </Link>
        ) : (
          <span key={`${target.kind}:${target.id}`} className={styles.relationPill} data-deleted={target.deleted ? "true" : undefined}>
            {label}
          </span>
        );
      })}
    </span>
  );
}
