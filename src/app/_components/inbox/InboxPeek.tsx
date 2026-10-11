'use client';

import { useState, type MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Skeleton, Stack, Text } from '@mantine/core';
import { api } from '~/trpc/react';
import { WorkspaceProvider, useWorkspace } from '~/providers/WorkspaceProvider';
import { PeekDrawer } from '~/app/_components/product/peek/PeekDrawer';
import { TicketPeek } from '~/app/_components/product/peek/TicketPeek';
import { DecisionDetail } from '~/app/_components/decisions/DecisionDetail';
import { ActionDetailContent } from '~/app/_components/ActionDetailContent';
import { MeetingDetailContainer } from '~/app/_components/meeting/MeetingDetailContainer';
import { parseInboxPeekHref, type InboxPeekTarget } from '~/lib/inbox-peek';

const PEEK_PARAM = 'peek';

const LABELS: Record<InboxPeekTarget['kind'], string> = {
  action: 'Action details',
  ticket: 'Ticket details',
  decision: 'Decision details',
  meeting: 'Meeting details',
};

/**
 * Moves `?peek=` with `history.pushState`, not the router: a pushed search
 * param is a navigation, and a navigation is an RSC round trip just to open
 * a drawer. Next syncs pushState into useSearchParams, and Back still steps
 * through peeks (the Decision Log's peek does the same).
 */
function setPeek(href: string | null) {
  const url = new URL(window.location.href);
  if (href) url.searchParams.set(PEEK_PARAM, href);
  else url.searchParams.delete(PEEK_PARAM);
  window.history.pushState(null, '', url);
}

/**
 * Props for an inbox row's link. A plain click on an item the drawer can show
 * peeks it; modified and middle clicks, and every other route, keep the
 * link's own behaviour, so the full page stays one gesture away.
 */
export function inboxPeekLinkProps(href: string) {
  if (!parseInboxPeekHref(href)) return {};
  return {
    // Rows open in the peek: prefetching each one's full page is an RSC
    // request per visible row.
    prefetch: false,
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      setPeek(href);
    },
  };
}

/**
 * The inbox's side drawer: the item a row points at (an action, ticket,
 * decision or meeting), over the list, on the shared PeekDrawer shell.
 * Inbox rows span every workspace, so each item renders inside its own
 * workspace's context rather than the default one. `hrefs` are the tab's
 * rows in on-screen order, for prev/next.
 */
export function InboxPeekDrawer({ hrefs }: { hrefs: string[] }) {
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const href = searchParams.get(PEEK_PARAM);
  const target = parseInboxPeekHref(href);

  // Prev/next walk the rows as they were when the drawer opened: acting on
  // an item can clear or reorder its row (and opening a ticket the first
  // time writes its body doc, bumping it to the end of the oldest-first QA
  // list), which would otherwise strand the drawer with no neighbours.
  const peekable = hrefs.filter((h) => parseInboxPeekHref(h));
  const [openRows, setOpenRows] = useState<string[] | null>(null);
  if (target && !openRows && href && peekable.includes(href)) setOpenRows(peekable);
  if (!target && openRows) setOpenRows(null);
  const rows = openRows ?? peekable;
  const index = href ? rows.indexOf(href) : -1;
  const prev = index > 0 ? rows[index - 1] : undefined;
  const next = index !== -1 ? rows[index + 1] : undefined;

  return (
    <PeekDrawer
      label={target ? LABELS[target.kind] : 'Details'}
      opened={!!target}
      onClose={() => {
        setPeek(null);
        // Whatever was done in the drawer (completing an action, promoting
        // a ticket) may clear its row.
        void utils.inbox.invalidate();
      }}
      fullPageHref={target ? href : null}
      onPrev={prev ? () => setPeek(prev) : undefined}
      onNext={next ? () => setPeek(next) : undefined}
    >
      {target && href && <PeekContent key={href} target={target} />}
    </PeekDrawer>
  );
}

function PeekContent({ target }: { target: InboxPeekTarget }) {
  if (target.kind === 'meeting') return <MeetingDetailContainer id={target.id} />;
  return (
    <WorkspaceProvider initialWorkspaceSlug={target.workspaceSlug}>
      {target.kind === 'action' ? (
        <ActionDetailContent
          actionId={target.id}
          workspaceSlug={target.workspaceSlug}
          variant="peek"
        />
      ) : target.kind === 'ticket' ? (
        <TicketByRef
          workspaceSlug={target.workspaceSlug}
          productSlug={target.productSlug}
          identifier={target.ref}
        />
      ) : (
        <DecisionInWorkspace workspaceSlug={target.workspaceSlug} decisionId={target.id} />
      )}
    </WorkspaceProvider>
  );
}

function LoadingBody() {
  return (
    <Stack gap="sm">
      <Skeleton height={28} />
      <Skeleton height={16} width="60%" />
      <Skeleton height={120} />
    </Stack>
  );
}

function NotFound({ what }: { what: string }) {
  return (
    <Text size="sm" className="text-text-muted">
      {what} not found, or you no longer have access to it.
    </Text>
  );
}

/** Ticket hrefs carry the url ref (APP-12), not the id TicketPeek takes. */
function TicketByRef({
  workspaceSlug,
  productSlug,
  identifier,
}: {
  workspaceSlug: string;
  productSlug: string;
  identifier: string;
}) {
  const { data, isLoading } = api.product.ticket.getByRef.useQuery({
    workspaceSlug,
    productSlug,
    identifier,
  });
  if (isLoading) return <LoadingBody />;
  const ticket = data?.ticket;
  if (!ticket) return <NotFound what="Ticket" />;
  return (
    <TicketPeek
      ticketId={ticket.id}
      basePath={`/w/${workspaceSlug}/products/${productSlug}/tickets`}
    />
  );
}

/** DecisionDetail takes the workspace id; the href only has its slug. */
function DecisionInWorkspace({
  workspaceSlug,
  decisionId,
}: {
  workspaceSlug: string;
  decisionId: string;
}) {
  const { workspaceId, isLoading } = useWorkspace();
  if (!workspaceId) return isLoading ? <LoadingBody /> : <NotFound what="Decision" />;
  return (
    <DecisionDetail
      workspaceId={workspaceId}
      workspaceSlug={workspaceSlug}
      decisionId={decisionId}
    />
  );
}
