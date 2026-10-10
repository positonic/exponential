'use client';

import { UnstyledButton } from '@mantine/core';
import { IconUsersGroup } from '@tabler/icons-react';
import { api } from '~/trpc/react';

/** What clicking the pill puts in the composer: Zoe drafts, the user pastes. */
export const IMPORT_POSITIONS_PROMPT =
  "Import our roles & responsibilities into Positions. Here's the document (or a Notion link): ";

interface PositionsImportPillProps {
  workspaceId: string;
  /** Prefill the composer with `IMPORT_POSITIONS_PROMPT` and focus it. */
  onImport: () => void;
}

/**
 * "Import roles & responsibilities" above the chat composer (Agent PRD D11).
 *
 * Shown while `position.coverage` says the workspace should be nudged: a team
 * workspace with two or more members where fewer than half of the humans and
 * Assistants hold a Position. The server owns that rule, including "never in
 * a personal workspace". Shown to every member (D12); only an owner or admin
 * can complete the import, and Zoe says so.
 */
export function PositionsImportPill({ workspaceId, onImport }: PositionsImportPillProps) {
  const { data: coverage } = api.position.coverage.useQuery({ workspaceId });

  if (!coverage?.offerImport) return null;

  return (
    <div className="mb-2 flex" data-testid="positions-import-pill">
      <div className="inline-flex items-center gap-1 rounded-full border border-border-primary bg-surface-secondary py-1 pl-3 pr-3">
        <UnstyledButton
          onClick={onImport}
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"
        >
          <IconUsersGroup size={14} />
          Import roles &amp; responsibilities
        </UnstyledButton>
      </div>
    </div>
  );
}
