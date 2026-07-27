/**
 * Helpers for building unified-timeline event rows from WorkspaceActivityEvent
 * rows. Entity-agnostic: the entity hooks own verb phrases and status colors.
 */

/** The subset of a WorkspaceActivityEvent row the grouping logic needs. */
export interface RawEntityEvent {
  id: string;
  action: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string;
  metadata: {
    from?: string;
    to?: string;
    fieldsChanged?: string[];
    bulk?: boolean;
  };
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Collapse bursts of field updates into one row per editing session: same
 * actor, consecutive `updated` events within a 5-minute window merge, with
 * their fieldsChanged unioned (order preserved). Status changes, creates, and
 * any other action break a group - they are the workflow signal and always
 * get their own row. The merged row keeps the LAST event's id/timestamp (the
 * end of the session).
 */
export function groupFieldUpdates(
  events: RawEntityEvent[],
  windowMs: number = GROUP_WINDOW_MS,
): RawEntityEvent[] {
  const out: RawEntityEvent[] = [];
  for (const event of events) {
    const prev = out[out.length - 1];
    const mergeable =
      prev !== undefined &&
      event.action === "updated" &&
      prev.action === "updated" &&
      prev.actorId === event.actorId &&
      // A bulk edit and a hand edit are different stories - don't merge them.
      Boolean(prev.metadata.bulk) === Boolean(event.metadata.bulk) &&
      event.createdAt.getTime() - prev.createdAt.getTime() <= windowMs;
    if (mergeable) {
      const fields = [
        ...(prev.metadata.fieldsChanged ?? []),
        ...(event.metadata.fieldsChanged ?? []),
      ];
      out[out.length - 1] = {
        ...event,
        metadata: {
          ...event.metadata,
          fieldsChanged: Array.from(new Set(fields)),
        },
      };
    } else {
      out.push(event);
    }
  }
  return out;
}

/** "priority" / "priority and effort" / "priority, effort and DRI". */
export function formatFieldList(fields: string[]): string {
  if (fields.length === 0) return "details";
  if (fields.length === 1) return fields[0]!;
  return `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]!}`;
}
