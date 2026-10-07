/**
 * The project Time tab's numbers: every entry logged on the project's
 * Actions, summed in total and per person.
 *
 * Pure: entries in, report out — the service loads the rows.
 *
 *  - Confirmed minutes are the headline: time people have signed off on.
 *  - Proposed minutes (Daily worklog drafts awaiting confirmation) are kept
 *    beside them, never folded in.
 *  - Agent-run entries (`source: "agent-run"`) are not a person's time; they
 *    are summed on their own and kept out of the per-person rows.
 *  - A running entry counts up to `now`.
 */

import { AGENT_RUN_SOURCE } from "./dayReport";

export interface ProjectTimeEntryInput {
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
  source: string;
  status: "PROPOSED" | "CONFIRMED";
  user: { id: string; name: string | null; image: string | null };
}

export interface ProjectTimePerson {
  userId: string;
  name: string | null;
  image: string | null;
  confirmedMinutes: number;
  proposedMinutes: number;
  entryCount: number;
  lastLoggedAt: Date;
}

export interface ProjectTimeReport {
  confirmedMinutes: number;
  proposedMinutes: number;
  agentRunMinutes: number;
  entryCount: number;
  people: ProjectTimePerson[];
}

const MS_PER_MINUTE = 60_000;

export function computeProjectTimeReport(
  entries: readonly ProjectTimeEntryInput[],
  now: Date = new Date(),
): ProjectTimeReport {
  let agentRunMs = 0;
  const byUser = new Map<
    string,
    { person: ProjectTimeEntryInput["user"]; confirmedMs: number; proposedMs: number; count: number; last: Date }
  >();

  for (const entry of entries) {
    const end = entry.endedAt ?? now;
    const ms = Math.max(0, end.getTime() - entry.startedAt.getTime());

    if (entry.source === AGENT_RUN_SOURCE) {
      agentRunMs += ms;
      continue;
    }

    const row = byUser.get(entry.userId) ?? {
      person: entry.user,
      confirmedMs: 0,
      proposedMs: 0,
      count: 0,
      last: entry.startedAt,
    };
    if (entry.status === "CONFIRMED") row.confirmedMs += ms;
    else row.proposedMs += ms;
    row.count += 1;
    if (entry.startedAt > row.last) row.last = entry.startedAt;
    byUser.set(entry.userId, row);
  }

  const toMinutes = (ms: number) => Math.round(ms / MS_PER_MINUTE);
  const people: ProjectTimePerson[] = [...byUser.entries()]
    .map(([userId, row]) => ({
      userId,
      name: row.person.name,
      image: row.person.image,
      confirmedMinutes: toMinutes(row.confirmedMs),
      proposedMinutes: toMinutes(row.proposedMs),
      entryCount: row.count,
      lastLoggedAt: row.last,
    }))
    .sort(
      (a, b) =>
        b.confirmedMinutes - a.confirmedMinutes ||
        b.proposedMinutes - a.proposedMinutes ||
        (a.name ?? "").localeCompare(b.name ?? ""),
    );

  return {
    confirmedMinutes: people.reduce((sum, p) => sum + p.confirmedMinutes, 0),
    proposedMinutes: people.reduce((sum, p) => sum + p.proposedMinutes, 0),
    agentRunMinutes: toMinutes(agentRunMs),
    entryCount: people.reduce((sum, p) => sum + p.entryCount, 0),
    people,
  };
}
