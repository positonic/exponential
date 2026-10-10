'use client';

import { CloseButton, UnstyledButton } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconUsersGroup } from '@tabler/icons-react';
import { api } from '~/trpc/react';

/** What clicking the pill puts in the composer: Zoe drafts, the user pastes. */
export const IMPORT_POSITIONS_PROMPT =
  "Import our roles & responsibilities into Positions. Here's the document (or a Notion link): ";

/** How long a dismissal hides the pill in that workspace. */
export const IMPORT_PILL_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

/** Per workspace, so dismissing it in one team leaves the others nudged. */
export function importPillStorageKey(workspaceId: string): string {
  return `positions-import-pill-dismissed:${workspaceId}`;
}

/**
 * Is a dismissal recorded at `dismissedAt` still in force at `now`? Anything
 * that is not a timestamp (nothing stored, blocked storage, a hand-edited
 * value) is "not dismissed", so the worst case is one more pill. A timestamp
 * from the future (the clock moved back) is not honoured either.
 */
export function isImportPillDismissed(dismissedAt: unknown, now: number): boolean {
  if (typeof dismissedAt !== 'number' || !Number.isFinite(dismissedAt)) return false;
  const age = now - dismissedAt;
  return age >= 0 && age < IMPORT_PILL_DISMISS_MS;
}

interface PositionsImportPillProps {
  workspaceId: string;
  /** Prefill the composer with `IMPORT_POSITIONS_PROMPT` and focus it. */
  onImport: () => void;
}

/**
 * "Import roles & responsibilities" above the chat composer (Agent PRD D11).
 *
 * Shown while `position.coverage` says the workspace should be nudged: a team
 * workspace with two or more humans and Assistants, fewer than half of whom
 * hold a Position. The server owns that rule, including "never in
 * a personal workspace". Shown to every member (D12); only an owner or admin
 * can complete the import, and Zoe says so.
 *
 * Dismissal hides it in that workspace for 30 days, kept in this browser's
 * localStorage like `JoinedWorkspaceBanner`: a lost dismissal costs one more
 * pill, not data. Mantine's hook wraps every storage read and write in
 * try/catch, so blocked storage renders the pill (and dismisses it for this
 * session) rather than crashing. Mount it keyed by `workspaceId` so the hook
 * never sees its key change mid-life.
 */
export function PositionsImportPill({ workspaceId, onImport }: PositionsImportPillProps) {
  const [dismissedAt, setDismissedAt] = useLocalStorage<number | null>({
    key: importPillStorageKey(workspaceId),
    defaultValue: null,
    // Read on first client render so a dismissed pill never flashes or fires
    // its query. Hydration-safe: the server and first client render both
    // output null while the query has no data.
    getInitialValueInEffect: false,
  });
  const isDismissed = isImportPillDismissed(dismissedAt, Date.now());

  const { data: coverage } = api.position.coverage.useQuery(
    { workspaceId },
    { enabled: !isDismissed },
  );

  if (isDismissed || !coverage?.offerImport) return null;

  return (
    <div className="mb-2 flex" data-testid="positions-import-pill">
      <div className="inline-flex items-center gap-1 rounded-full border border-border-primary bg-surface-secondary py-0.5 pl-3 pr-1">
        <UnstyledButton
          onClick={onImport}
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"
        >
          <IconUsersGroup size={14} />
          Import roles &amp; responsibilities
        </UnstyledButton>
        <CloseButton
          size="xs"
          radius="xl"
          onClick={() => setDismissedAt(Date.now())}
          aria-label="Dismiss import roles & responsibilities"
        />
      </div>
    </div>
  );
}
