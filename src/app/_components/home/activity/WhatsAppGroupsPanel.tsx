'use client';

import { ActionIcon, Select, Skeleton, Tooltip } from '@mantine/core';
import { IconBrandWhatsapp, IconX } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

const PROVIDER = 'whatsapp';

/**
 * WhatsApp groups rail widget (ADR-0023 settings UI). Sits below the GitHub
 * repositories panel in the activity-home rail. Lets a workspace member link a
 * watched WhatsApp group to this workspace so its periodic summaries land on the
 * activity feed.
 *
 * Adapts to state, mirroring `GithubReposPanel`:
 *  - linked groups → a list, each with an unlink control
 *  - connected gateway → a searchable picker of the account's groups (minus
 *    already-linked ones)
 *  - gateway unconfigured AND nothing linked → hidden
 *  - WhatsApp not connected → a connect hint (but still shows existing links)
 */
export function WhatsAppGroupsPanel() {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: links, isLoading: linksLoading } =
    api.channelLink.list.useQuery(
      { workspaceId: workspaceId ?? '' },
      { enabled: !!workspaceId },
    );

  const { data: gateway, isLoading: groupsLoading } =
    api.whatsappGateway.getGroups.useQuery(undefined, {
      enabled: !!workspaceId,
    });

  const linkMutation = api.channelLink.link.useMutation({
    onSuccess: () => {
      if (workspaceId) void utils.channelLink.list.invalidate({ workspaceId });
    },
  });
  const unlinkMutation = api.channelLink.unlink.useMutation({
    onSuccess: () => {
      if (workspaceId) void utils.channelLink.list.invalidate({ workspaceId });
    },
  });

  const linkedWhatsApp = useMemo(
    () => (links ?? []).filter((l) => l.provider === PROVIDER),
    [links],
  );
  const linkedJids = useMemo(
    () => new Set(linkedWhatsApp.map((l) => l.externalId)),
    [linkedWhatsApp],
  );

  // Groups from the gateway that aren't linked yet → the picker options.
  const options = useMemo(
    () =>
      (gateway?.groups ?? [])
        .filter((g) => !linkedJids.has(g.jid))
        .map((g) => ({ value: g.jid, label: g.subject })),
    [gateway?.groups, linkedJids],
  );

  if (linksLoading) {
    return (
      <section className="wsa-card">
        <Skeleton height={18} width={150} />
        <Skeleton height={30} mt={10} />
      </section>
    );
  }

  // Nothing configured and nothing linked → don't show an empty card.
  if (gateway && !gateway.configured && linkedWhatsApp.length === 0) {
    return null;
  }

  function handleSelect(jid: string | null) {
    if (!jid || !workspaceId) return;
    const group = gateway?.groups.find((g) => g.jid === jid);
    linkMutation.mutate({
      provider: PROVIDER,
      externalId: jid,
      workspaceId,
      displayName: group?.subject,
    });
  }

  const connected = gateway?.connected ?? false;

  return (
    <section className="wsa-card">
      <div className="wsa-card__head" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <IconBrandWhatsapp
            size={16}
            stroke={1.8}
            style={{ color: 'var(--color-text-muted)' }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-text-primary)',
            }}
          >
            WhatsApp Groups
          </span>
        </div>
        {linkedWhatsApp.length > 0 ? (
          <span className="wsa-card__count">{linkedWhatsApp.length}</span>
        ) : null}
      </div>

      {linkedWhatsApp.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          {linkedWhatsApp.map((link) => (
            <div
              key={link.id}
              className="wsa-projects__row"
              style={{ justifyContent: 'space-between' }}
            >
              <span
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <IconBrandWhatsapp
                  size={14}
                  stroke={1.8}
                  style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
                />
                {link.displayName ?? link.externalId}
              </span>
              <Tooltip label="Unlink group" withinPortal>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label="Unlink group"
                  loading={
                    unlinkMutation.isPending &&
                    unlinkMutation.variables?.id === link.id
                  }
                  onClick={() => unlinkMutation.mutate({ id: link.id })}
                >
                  <IconX size={14} stroke={1.8} />
                </ActionIcon>
              </Tooltip>
            </div>
          ))}
        </div>
      ) : null}

      {connected ? (
        <Select
          size="xs"
          placeholder="Search WhatsApp groups…"
          searchable
          clearable
          value={null}
          data={options}
          onChange={handleSelect}
          disabled={groupsLoading || linkMutation.isPending}
          comboboxProps={{ withinPortal: true }}
          nothingFoundMessage={
            groupsLoading ? 'Loading groups…' : 'No more groups to link'
          }
        />
      ) : (
        <p className="wsa-card__caption" style={{ marginTop: 4 }}>
          {groupsLoading
            ? 'Checking WhatsApp connection…'
            : 'Connect WhatsApp to link groups to this workspace.'}
        </p>
      )}
    </section>
  );
}
