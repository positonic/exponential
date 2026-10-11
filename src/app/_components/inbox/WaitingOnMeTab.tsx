'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Skeleton, UnstyledButton } from '@mantine/core';
import {
  IconClockExclamation,
  IconFlag,
  IconMicrophone,
  IconRobot,
  IconTicket,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useDayRollover } from '~/hooks/useDayRollover';
import { compactAge } from '~/app/_components/product/overview/overviewShared';
import { ticketDisplayId, ticketUrlId } from '~/lib/fun-ids';
import { toPlainText } from '~/lib/content/plainText';
import { overdueAnchor } from '~/lib/actions/partition';
import type { RouterOutputs } from '~/trpc/react';
import { InboxPeekDrawer, inboxPeekLinkProps } from './InboxPeek';

type WaitingOnMe = RouterOutputs['inbox']['waitingOnMe'];

interface WorkspaceRef {
  slug: string;
  name: string;
}

/** "Acme · …" — every row names its workspace, since the tab spans them all. */
function withWorkspace(workspace: WorkspaceRef | null, detail: string): string {
  return workspace ? `${workspace.name} · ${detail}` : detail;
}

const hrefs = {
  assistantQuestion: (q: WaitingOnMe['assistantQuestions'][number]) =>
    q.action.workspace ? `/w/${q.action.workspace.slug}/actions/${q.action.id}` : '/inbox?tab=delegated',
  decision: (d: WaitingOnMe['decisions'][number]) => `/w/${d.workspace.slug}/decisions/d/${d.id}`,
  draftReview: (m: WaitingOnMe['draftReviews'][number]) => `/recording/${m.id}`,
  qaTicket: (t: WaitingOnMe['qaTickets'][number]) =>
    `/w/${t.workspace.slug}/products/${t.product.slug}/tickets/${ticketUrlId(t)}`,
  overdueAction: (a: WaitingOnMe['overdueActions'][number]) =>
    a.workspace ? `/w/${a.workspace.slug}/actions/${a.id}` : '/today',
};

/** Every row's href in on-screen order, for the peek's prev/next. */
function rowHrefs(data: WaitingOnMe): string[] {
  return [
    ...data.assistantQuestions.map(hrefs.assistantQuestion),
    ...data.decisions.map(hrefs.decision),
    ...data.draftReviews.map(hrefs.draftReview),
    ...data.qaTickets.map(hrefs.qaTicket),
    ...data.overdueActions.map(hrefs.overdueAction),
  ];
}

function Section({
  label,
  shown,
  total,
  more,
  children,
}: {
  label: string;
  shown: number;
  total: number;
  /** Where the full list lives, when the tab shows only the first rows. */
  more?: { href: string; label: string };
  children: ReactNode;
}) {
  if (total === 0) return null;
  return (
    <>
      <div className="wsa-sub">
        <span className="wsa-sub__label">
          {label}
          <span className="wsa-sub__badge">{total}</span>
        </span>
        {total > shown && (
          <span className="wsa-item__meta">
            {more ? (
              <Link href={more.href} className="wsa-sub__action">
                {more.label}
              </Link>
            ) : (
              `Showing ${shown} of ${total}`
            )}
          </span>
        )}
      </div>
      {children}
    </>
  );
}

function Row({
  href,
  icon,
  label,
  sub,
  meta,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  sub: string;
  meta: ReactNode;
}) {
  return (
    <UnstyledButton component={Link} href={href} className="wsa-item" {...inboxPeekLinkProps(href)}>
      <span className="wsa-item__icon">{icon}</span>
      <span className="wsa-item__label">
        {label}
        <span className="wsa-item__sub">{sub}</span>
      </span>
      <span className="wsa-item__meta">{meta}</span>
    </UnstyledButton>
  );
}

/**
 * The inbox's "Waiting on me" tab: what is blocked on the user across every
 * workspace — decisions they own or decide that are still open, meetings
 * with draft decisions for them to review, QA tickets theirs to promote, and
 * overdue actions. Each section vanishes when empty; it clears by acting on
 * the item, not by reading it.
 */
export function WaitingOnMeTab() {
  const startOfToday = useDayRollover();
  const { data, isLoading } = api.inbox.waitingOnMe.useQuery({ startOfToday });

  if (isLoading || !data) {
    return (
      <section className="wsa-card">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={40} mb={4} radius="sm" />
        ))}
      </section>
    );
  }

  const { counts } = data;

  if (counts.total === 0) {
    return (
      <section className="wsa-card">
        <p className="wsa-feed__empty">
          Nothing is waiting on you — no open decisions, drafts to review, QA
          tickets, overdue actions or questions from your assistant.
        </p>
      </section>
    );
  }

  return (
    <section className="wsa-card">
      <Section
        label="Your assistant asked"
        shown={data.assistantQuestions.length}
        total={counts.assistantQuestions}
      >
        {data.assistantQuestions.map((q) => (
          <Row
            key={q.id}
            href={hrefs.assistantQuestion(q)}
            icon={<IconRobot size={14} stroke={1.75} />}
            label={toPlainText(q.action.name)}
            sub={withWorkspace(q.action.workspace, `${q.assistantName} is waiting for your reply on the action`)}
            meta={
              <>
                <span className="wsa-item__chip wsa-item__chip--warn">waiting</span>
                {compactAge(q.askedAt)}
              </>
            }
          />
        ))}
      </Section>

      <Section label="Decisions" shown={data.decisions.length} total={counts.decisions}>
        {data.decisions.map((decision) => (
          <Row
            key={decision.id}
            href={hrefs.decision(decision)}
            icon={<IconFlag size={14} stroke={1.75} />}
            label={decision.statement}
            sub={withWorkspace(
              decision.workspace,
              `${decision.label} · ${decision.isOwner ? 'you own it' : "you're a decider"}`,
            )}
            meta={
              <>
                <span className="wsa-item__chip">
                  {decision.status === 'OPEN' ? 'Open' : 'Proposed'}
                </span>
                {compactAge(decision.createdAt)}
              </>
            }
          />
        ))}
      </Section>

      <Section
        label="Draft decisions to review"
        shown={data.draftReviews.length + data.agentDrafts.length}
        total={counts.draftReviews + counts.agentDrafts}
      >
        {data.agentDrafts.map((draft) => (
          <Row
            key={draft.id}
            href={`/w/${draft.workspace.slug}/decisions/d/${draft.id}`}
            icon={<IconRobot size={14} stroke={1.75} />}
            label={draft.statement}
            sub={withWorkspace(draft.workspace, `${draft.label} · logged by ${draft.authorName}`)}
            meta={
              <>
                <span className="wsa-item__chip">Draft</span>
                {compactAge(draft.createdAt)}
              </>
            }
          />
        ))}
        {data.draftReviews.map((meeting) => (
          <Row
            key={meeting.id}
            href={hrefs.draftReview(meeting)}
            icon={<IconMicrophone size={14} stroke={1.75} />}
            label={`${meeting.draftCount} draft ${meeting.draftCount === 1 ? 'decision' : 'decisions'}`}
            sub={withWorkspace(meeting.workspace, meeting.title ?? 'Untitled meeting')}
            meta={compactAge(meeting.createdAt)}
          />
        ))}
      </Section>

      <Section label="QA tickets" shown={data.qaTickets.length} total={counts.qaTickets}>
        {data.qaTickets.map((ticket) => (
          <Row
            key={ticket.id}
            href={hrefs.qaTicket(ticket)}
            icon={<IconTicket size={14} stroke={1.75} />}
            label={ticket.title}
            sub={withWorkspace(
              ticket.workspace,
              `${ticketDisplayId(ticket.product, ticket)} · in QA`,
            )}
            meta={
              <>
                {ticket.prMerged && (
                  <span className="wsa-item__chip wsa-item__chip--go">
                    PR merged — promote?
                  </span>
                )}
                {compactAge(ticket.updatedAt)}
              </>
            }
          />
        ))}
      </Section>

      <Section
        label="Overdue actions"
        shown={data.overdueActions.length}
        total={counts.overdueActions}
        more={{ href: '/today', label: 'See all on Today' }}
      >
        {data.overdueActions.map((action) => {
          const anchor = overdueAnchor(action);
          return (
            <Row
              key={action.id}
              href={hrefs.overdueAction(action)}
              icon={<IconClockExclamation size={14} stroke={1.75} />}
              // Legacy HTML / Markdown name inside an anchor row: text only.
              label={toPlainText(action.name)}
              sub={withWorkspace(action.workspace, action.projectName ?? 'No project')}
              meta={
                <span className="wsa-item__chip wsa-item__chip--warn">
                  {anchor ? `${compactAge(anchor)} late` : 'overdue'}
                </span>
              }
            />
          );
        })}
      </Section>

      <InboxPeekDrawer hrefs={rowHrefs(data)} />
    </section>
  );
}
