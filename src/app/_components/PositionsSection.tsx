"use client";

import { useState } from "react";
import {
  Avatar,
  Button,
  Group,
  Input,
  Modal,
  MultiSelect,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconBriefcase, IconPlus, IconRobotFace } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { SettingsSection } from "~/app/_components/settings/SettingsShell";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

/** A workspace member as `workspace.getBySlug` returns it — humans and agents alike. */
export interface PositionsSectionMember {
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    isAgent: boolean;
  };
}

interface PositionsSectionProps {
  workspaceId: string;
  /** Owner or admin: may create, rename, delete and set holders. */
  canManage: boolean;
  members: PositionsSectionMember[];
}

const TITLE_MAX = 80;
const REMIT_MAX = 2000;

function memberLabel(member: PositionsSectionMember): string {
  return member.user.name ?? member.user.email ?? member.userId;
}

/**
 * Positions (ADR-0068): who does what in this workspace. Routing data only —
 * holding a Position changes nothing about what a member may do. Rendered on
 * Settings → Members for team workspaces; a personal workspace has nobody to
 * route to, so the page skips it.
 */
export function PositionsSection({ workspaceId, canManage, members }: PositionsSectionProps) {
  const utils = api.useUtils();
  const { data, isLoading } = api.position.list.useQuery({ workspaceId });
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);

  const positions = data?.positions ?? [];

  const invalidate = async () => {
    await utils.position.list.invalidate({ workspaceId });
    // The Assign modal shows Positions under each candidate.
    void utils.action.getAssignableUsers.invalidate();
    void utils.action.getAssignableUsersForContext.invalidate();
  };

  const createMutation = api.position.create.useMutation({
    onSuccess: async () => {
      closeForm();
      await invalidate();
      notifications.show({ title: "Position created", message: "Zoe can now route work to its holders.", color: "green" });
    },
    onError: (error) =>
      notifications.show({ title: "Could not create Position", message: error.message, color: "red" }),
  });

  return (
    <>
      <SettingsSection
        icon={IconBriefcase}
        title="Positions"
        count={positions.length}
        description="Who does what here. Zoe routes new work to whoever holds the matching Position; a Position never changes what a member may do."
        action={
          canManage && (
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={openForm}
              data-testid="position-new"
            >
              New Position
            </Button>
          )
        }
        flush
      >
        <div className="px-2 pt-3 pb-2 text-[13px]" data-testid="positions-section">
          {isLoading ? (
            <Stack gap="xs" px="sm">
              <Skeleton height={40} />
              <Skeleton height={40} />
            </Stack>
          ) : positions.length === 0 ? (
            <Text size="sm" className="px-3.5 py-2 text-text-muted">
              No Positions yet.
              {canManage
                ? " Create one — “Delivery lead”, “Travel researcher” — and pick who holds it."
                : " An owner or admin can add them."}
            </Text>
          ) : (
            positions.map((position) => (
              <div
                key={position.id}
                className="border-b border-border-primary px-3.5 py-3 last:border-b-0"
                data-testid="position-row"
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-text-primary">{position.title}</div>
                    <MarkdownRenderer content={position.remit} variant="compact" className="mt-1 text-text-secondary" />
                    {position.notAccountableFor && (
                      <div className="mt-1.5 text-[12px] text-text-muted">
                        <span className="font-medium">Not accountable for: </span>
                        <MarkdownRenderer content={position.notAccountableFor} variant="inline" />
                      </div>
                    )}
                  </div>
                  <Group gap={4} wrap="nowrap">
                    {position.holders.length === 0 ? (
                      <Text size="xs" className="text-text-muted">Vacant</Text>
                    ) : (
                      <Avatar.Group spacing="xs">
                        {position.holders.map((holder) => (
                          <Tooltip key={holder.id} label={holder.name ?? "Member"}>
                            <Avatar src={holder.image} size="sm" radius="xl">
                              {holder.isAgent ? <IconRobotFace size={12} /> : (holder.name?.charAt(0).toUpperCase() ?? "?")}
                            </Avatar>
                          </Tooltip>
                        ))}
                      </Avatar.Group>
                    )}
                  </Group>
                </Group>
              </div>
            ))
          )}
        </div>
      </SettingsSection>

      <PositionFormModal
        opened={formOpened}
        onClose={closeForm}
        members={members}
        isSaving={createMutation.isPending}
        onSubmit={(values) =>
          createMutation.mutate({
            workspaceId,
            title: values.title,
            remit: values.remit,
            notAccountableFor: values.notAccountableFor || undefined,
            holderUserIds: values.holderUserIds,
          })
        }
      />
    </>
  );
}

interface PositionFormValues {
  title: string;
  remit: string;
  notAccountableFor: string;
  holderUserIds: string[];
}

function PositionFormModal({
  opened,
  onClose,
  members,
  isSaving,
  onSubmit,
}: {
  opened: boolean;
  onClose: () => void;
  members: PositionsSectionMember[];
  isSaving: boolean;
  onSubmit: (values: PositionFormValues) => void;
}) {
  const [title, setTitle] = useState("");
  const [remit, setRemit] = useState("");
  const [notAccountableFor, setNotAccountableFor] = useState("");
  const [holderUserIds, setHolderUserIds] = useState<string[]>([]);

  const reset = () => {
    setTitle("");
    setRemit("");
    setNotAccountableFor("");
    setHolderUserIds([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const canSave = title.trim().length > 0 && remit.trim().length > 0 && !isSaving;

  const agentIds = new Set(members.filter((m) => m.user.isAgent).map((m) => m.userId));
  const holderOptions = members.map((member) => ({ value: member.userId, label: memberLabel(member) }));

  return (
    <Modal opened={opened} onClose={close} title="New Position" size="lg">
      <Stack gap="md">
        <TextInput
          label="Title"
          placeholder="Travel researcher"
          required
          maxLength={TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          data-testid="position-title"
        />
        <Input.Wrapper
          label="Remit"
          description="The kinds of work its holders take on. Written for matching by meaning — Zoe reads this."
          required
        >
          <MarkdownInput
            value={remit}
            onChange={(next) => setRemit(next.slice(0, REMIT_MAX))}
            placeholder="Research and shortlist travel options: flights, hotels near the venue, local transport."
            minRows={3}
          />
        </Input.Wrapper>
        <Input.Wrapper
          label="Not accountable for"
          description="Optional. Work that looks like this Position's but belongs elsewhere."
        >
          <MarkdownInput
            value={notAccountableFor}
            onChange={(next) => setNotAccountableFor(next.slice(0, REMIT_MAX))}
            placeholder="Booking or paying for anything."
            minRows={2}
          />
        </Input.Wrapper>
        <MultiSelect
          label="Holders"
          description="Members of this workspace — people, Assistants and External agents alike. A Position can also stay vacant."
          placeholder={holderUserIds.length > 0 ? undefined : "Pick who holds it"}
          data={holderOptions}
          value={holderUserIds}
          onChange={setHolderUserIds}
          renderOption={({ option }) => (
            <Group gap={6} wrap="nowrap">
              <span>{option.label}</span>
              {agentIds.has(option.value) && (
                <span className="inline-flex items-center gap-0.5 rounded border border-border-primary px-1 text-[10px] text-text-muted">
                  <IconRobotFace size={10} aria-hidden="true" />
                  agent
                </span>
              )}
            </Group>
          )}
          searchable
          clearable
          hidePickedOptions
          data-testid="position-holders"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            loading={isSaving}
            onClick={() =>
              onSubmit({
                title: title.trim(),
                remit: remit.trim(),
                notAccountableFor: notAccountableFor.trim(),
                holderUserIds,
              })
            }
            data-testid="position-save"
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
