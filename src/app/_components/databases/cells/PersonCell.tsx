"use client";

import { PersonAvatar, PersonPicker, type PickerUser } from "~/app/_components/shared/PersonPicker";
import type { PropertyDef } from "~/lib/databases/schema";
import styles from "../DatabaseBlock.module.css";

interface PersonCellProps {
  def: PropertyDef;
  /** Stored user ids. The picker sets one person; a list written through the API still reads. */
  value: string[] | null | undefined;
  workspaceId: string | null | undefined;
  /** Workspace members by id, for names and avatars (and a former member who still holds a cell). */
  people: ReadonlyMap<string, PickerUser>;
  editable: boolean;
  onCommit: (next: string[] | null) => void;
}

function PersonChip({ id, people }: { id: string; people: ReadonlyMap<string, PickerUser> }) {
  const user = people.get(id);
  if (!user) return <span className={styles.cellText}>{id}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <PersonAvatar user={user} size={16} />
      <span className={styles.cellText}>{user.name ?? user.email ?? id}</span>
    </span>
  );
}

/**
 * A person cell: the shared `PersonPicker` as a pill, choosing one workspace
 * member; stored as a one-element list because the property type is a list
 * (the API may write several). Read-only it shows avatars and names, which
 * also serves the computed "Created by" column.
 */
export function PersonCell({ def, value, workspaceId, people, editable, onCommit }: PersonCellProps) {
  const ids = value ?? [];
  if (!editable) {
    if (ids.length === 0) return <span className={styles.cellEmpty}>—</span>;
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {ids.map((id) => (
          <PersonChip key={id} id={id} people={people} />
        ))}
      </span>
    );
  }
  const first = ids[0] ?? null;
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <PersonPicker
        workspaceId={workspaceId}
        value={first}
        selectedUser={first ? (people.get(first) ?? null) : null}
        label={def.name}
        noneLabel="—"
        clearable
        trigger="pill"
        onChange={(userId) => onCommit(userId ? [userId] : null)}
      />
    </span>
  );
}
