/**
 * Read-side rollup of an objective's activity timeline. Pure (no DB / tRPC /
 * auth imports) so it can be unit-tested directly; the `okr.getObjectiveActivity`
 * procedure fetches the rows and delegates the merge here.
 */

export interface ActivityAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

/**
 * One entry in an objective's rolled-up activity timeline. Discriminated on
 * `kind`: the objective's own comments/updates plus its child key results'
 * comments and check-ins. KR-sourced kinds carry the KR id/title/code so the
 * UI can render a clickable source chip.
 */
export type ObjectiveActivityItem =
  | {
      kind: "goalComment";
      id: string;
      createdAt: Date;
      author: ActivityAuthor;
      content: string;
    }
  | {
      kind: "goalUpdate";
      id: string;
      createdAt: Date;
      author: ActivityAuthor;
      content: string;
      health: string;
    }
  | {
      kind: "krComment";
      id: string;
      createdAt: Date;
      author: ActivityAuthor;
      content: string;
      keyResultId: string;
      keyResultTitle: string;
      keyResultCode: string;
    }
  | {
      kind: "krCheckIn";
      id: string;
      createdAt: Date;
      author: ActivityAuthor | null;
      previousValue: number;
      newValue: number;
      notes: string | null;
      keyResultId: string;
      keyResultTitle: string;
      keyResultCode: string;
    };

export interface MergeObjectiveActivityInput {
  goalComments: Array<{
    id: string;
    createdAt: Date;
    content: string;
    author: ActivityAuthor;
  }>;
  goalUpdates: Array<{
    id: string;
    createdAt: Date;
    content: string;
    health: string;
    author: ActivityAuthor;
  }>;
  // Assumed ordered (createdAt asc) so the per-objective KR code is stable.
  keyResults: Array<{
    id: string;
    title: string;
    comments: Array<{
      id: string;
      createdAt: Date;
      content: string;
      author: ActivityAuthor;
    }>;
    checkIns: Array<{
      id: string;
      createdAt: Date;
      previousValue: number;
      newValue: number;
      notes: string | null;
      createdBy: ActivityAuthor | null;
    }>;
  }>;
}

/**
 * Merge an objective's own comments/updates with all its child key results'
 * comments and check-ins into one newest-first timeline.
 */
export function mergeObjectiveActivity(
  input: MergeObjectiveActivityInput,
): ObjectiveActivityItem[] {
  const items: ObjectiveActivityItem[] = [];

  for (const c of input.goalComments) {
    items.push({
      kind: "goalComment",
      id: c.id,
      createdAt: c.createdAt,
      author: c.author,
      content: c.content,
    });
  }

  for (const u of input.goalUpdates) {
    items.push({
      kind: "goalUpdate",
      id: u.id,
      createdAt: u.createdAt,
      author: u.author,
      content: u.content,
      health: u.health,
    });
  }

  input.keyResults.forEach((kr, index) => {
    const keyResultCode = `KR${index + 1}`;
    for (const c of kr.comments) {
      items.push({
        kind: "krComment",
        id: c.id,
        createdAt: c.createdAt,
        author: c.author,
        content: c.content,
        keyResultId: kr.id,
        keyResultTitle: kr.title,
        keyResultCode,
      });
    }
    for (const ci of kr.checkIns) {
      items.push({
        kind: "krCheckIn",
        id: ci.id,
        createdAt: ci.createdAt,
        author: ci.createdBy ?? null,
        previousValue: ci.previousValue,
        newValue: ci.newValue,
        notes: ci.notes,
        keyResultId: kr.id,
        keyResultTitle: kr.title,
        keyResultCode,
      });
    }
  });

  // Newest first — matches how the drawer's activity feed already reads.
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items;
}
