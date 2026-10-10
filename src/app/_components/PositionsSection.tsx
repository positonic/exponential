"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
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
import { IconBriefcase, IconPencil, IconPlus, IconRobotFace, IconTrash } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
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

interface PositionRow {
  id: string;
  title: string;
  remit: string;
  notAccountableFor: string | null;
  holders: Array<{ userId: string; name: string | null; image: string | null; isAgent: boolean }>;
}

const TITLE_MAX = 80;
const REMIT_MAX = 2000;

function memberLabel(member: PositionsSectionMember): string {
  return member.user.name ?? member.user.email ?? member.userId;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Positions (ADR-0068): who does what in this workspace. Routing data only —
 * holding a Position changes nothing about what a member may do. Rendered on
 * Settings → Members for team workspaces; a personal workspace has nobody to
 * route to, so the page skips it.
 *
 * Owners and admins get New / Edit / Delete and the holder picker. A member
 * who holds a Position gets an Edit that exposes only its Remit.
 */
export function PositionsSection({ workspaceId, canManage, members }: PositionsSectionProps) {
  const utils = api.useUtils();
  const { data: session } = useSession();
  const viewerId = session?.user?.id;
  const { data, isLoading } = api.position.list.useQuery({ workspaceId });
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<PositionRow | null>(null);

  const positions = data?.positions ?? [];
  const heldByViewer = new Set(
    data?.members.find((member) => member.userId === viewerId)?.positionIds ?? [],
  );

  const invalidate = async () => {
    await utils.position.list.invalidate({ workspaceId });
    // The Assign modal shows Positions under each candidate.
    void utils.action.getAssignableUsers.invalidate();
    void utils.action.getAssignableUsersForContext.invalidate();
  };

  const onError = (title: string) => (error: { message: string }) =>
    notifications.show({ title, message: error.message, color: "red" });

  const createMutation = api.position.create.useMutation({
    onSuccess: async () => {
      closeForm();
      await invalidate();
      notifications.show({ title: "Position created", message: "Zoe can now route work to its holders.", color: "green" });
    },
    onError: onError("Could not create Position"),
  });
  const updateMutation = api.position.update.useMutation({ onError: onError("Could not update Position") });
  const setHoldersMutation = api.position.setHolders.useMutation({ onError: onError("Could not update holders") });
  const deleteMutation = api.position.delete.useMutation({
    onSuccess: async () => invalidate(),
    onError: onError("Could not delete Position"),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending || setHoldersMutation.isPending;

  const openCreate = () => {
    setEditing(null);
    openForm();
  };
  const openEdit = (position: PositionRow) => {
    setEditing(position);
    openForm();
  };
  const handleDelete = (position: PositionRow) => {
    if (confirm(`Delete the Position "${position.title}"? Its holders keep their membership.`)) {
      deleteMutation.mutate({ workspaceId, positionId: position.id });
    }
  };

  const handleSubmit = async (values: PositionFormValues) => {
    if (!editing) {
      createMutation.mutate({
        workspaceId,
        title: values.title,
        remit: values.remit,
        notAccountableFor: values.notAccountableFor || undefined,
        holderUserIds: values.holderUserIds,
      });
      return;
    }
    try {
      if (canManage) {
        await updateMutation.mutateAsync({
          workspaceId,
          positionId: editing.id,
          title: values.title,
          remit: values.remit,
          notAccountableFor: values.notAccountableFor || null,
        });
        const currentHolderIds = editing.holders.map((holder) => holder.userId);
        if (!sameSet(currentHolderIds, values.holderUserIds)) {
          await setHoldersMutation.mutateAsync({
            workspaceId,
            positionId: editing.id,
            userIds: values.holderUserIds,
          });
        }
      } else {
        // A holder edits the Remit and nothing else.
        await updateMutation.mutateAsync({ workspaceId, positionId: editing.id, remit: values.remit });
      }
    } catch {
      // Surfaced by the mutation's onError; keep the form open to retry.
      return;
    }
    closeForm();
    await invalidate();
  };

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
              onClick={openCreate}
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
            positions.map((position) => {
              const canEdit = canManage || heldByViewer.has(position.id);
              return (
                <div
                  key={position.id}
                  className="group border-b border-border-primary px-3.5 py-3 last:border-b-0"
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
                            <Tooltip key={holder.userId} label={holder.name ?? "Member"}>
                              <Avatar src={holder.image} size="sm" radius="xl">
                                {holder.isAgent ? <IconRobotFace size={12} /> : (holder.name?.charAt(0).toUpperCase() ?? "?")}
                              </Avatar>
                            </Tooltip>
                          ))}
                        </Avatar.Group>
                      )}
                      {canEdit && (
                        <Tooltip label={canManage ? "Edit Position" : "Edit Remit (you hold this Position)"}>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={() => openEdit(position)}
                            aria-label={`Edit ${position.title}`}
                          >
                            <IconPencil size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {canManage && (
                        <Tooltip label="Delete Position">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDelete(position)}
                            loading={deleteMutation.isPending && deleteMutation.variables?.positionId === position.id}
                            aria-label={`Delete ${position.title}`}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>
                </div>
              );
            })
          )}
        </div>
      </SettingsSection>

      <PositionFormModal
        opened={formOpened}
        onClose={closeForm}
        members={members}
        position={editing}
        remitOnly={!!editing && !canManage}
        isSaving={isSaving}
        onSubmit={(values) => void handleSubmit(values)}
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
  position,
  remitOnly,
  isSaving,
  onSubmit,
}: {
  opened: boolean;
  onClose: () => void;
  members: PositionsSectionMember[];
  /** The Position being edited, or null to create one. */
  position: PositionRow | null;
  /** A holder who is not an admin: only the Remit is editable. */
  remitOnly: boolean;
  isSaving: boolean;
  onSubmit: (values: PositionFormValues) => void;
}) {
  const [title, setTitle] = useState("");
  const [remit, setRemit] = useState("");
  const [notAccountableFor, setNotAccountableFor] = useState("");
  const [holderUserIds, setHolderUserIds] = useState<string[]>([]);

  // Re-seed the fields each time the modal opens on a (different) Position.
  useEffect(() => {
    if (!opened) return;
    setTitle(position?.title ?? "");
    setRemit(position?.remit ?? "");
    setNotAccountableFor(position?.notAccountableFor ?? "");
    setHolderUserIds(position?.holders.map((holder) => holder.userId) ?? []);
  }, [opened, position]);

  const canSave = title.trim().length > 0 && remit.trim().length > 0 && !isSaving;

  const agentIds = new Set(members.filter((m) => m.user.isAgent).map((m) => m.userId));
  const holderOptions = members.map((member) => ({ value: member.userId, label: memberLabel(member) }));

  const heading = position ? (remitOnly ? `Edit Remit — ${position.title}` : `Edit ${position.title}`) : "New Position";

  return (
    <Modal opened={opened} onClose={onClose} title={heading} size="lg">
      <Stack gap="md">
        {!remitOnly && (
          <TextInput
            label="Title"
            placeholder="Travel researcher"
            required
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            data-testid="position-title"
          />
        )}
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
        {!remitOnly && (
          <>
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
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
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
            {position ? "Save" : "Create"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
