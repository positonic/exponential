"use client";

import { useState } from "react";
import {
  Drawer,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  Textarea,
  ActionIcon,
  Avatar,
  Divider,
  Loader,
  NumberInput,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import {
  IconArrowRight,
  IconCurrencyDollar,
  IconNote,
  IconTrash,
  IconEdit,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";

interface DealDetailDrawerProps {
  dealId: string | null;
  projectId: string;
  opened: boolean;
  onClose: () => void;
}

export function DealDetailDrawer({
  dealId,
  projectId,
  opened,
  onClose,
}: DealDetailDrawerProps) {
  const [noteText, setNoteText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editValue, setEditValue] = useState<number | undefined>();
  const [editProbability, setEditProbability] = useState<number | undefined>();
  const [editExpectedCloseDate, setEditExpectedCloseDate] = useState<Date | null>(null);

  const utils = api.useUtils();

  const { data: deal, isLoading } = api.pipeline.getDeal.useQuery(
    { id: dealId! },
    { enabled: !!dealId && opened },
  );

  const addNoteMutation = api.pipeline.addNote.useMutation({
    onSuccess: () => {
      setNoteText("");
      void utils.pipeline.getDeal.invalidate({ id: dealId! });
    },
  });

  const updateDealMutation = api.pipeline.updateDeal.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      void utils.pipeline.getDeal.invalidate({ id: dealId! });
      void utils.pipeline.getDeals.invalidate({ projectId });
      void utils.pipeline.getStats.invalidate({ projectId });
      notifications.show({
        title: "Deal updated",
        message: "Changes saved successfully",
        color: "green",
      });
    },
  });

  const deleteDealMutation = api.pipeline.deleteDeal.useMutation({
    onSuccess: () => {
      void utils.pipeline.getDeals.invalidate({ projectId });
      void utils.pipeline.getStats.invalidate({ projectId });
      onClose();
      notifications.show({
        title: "Deal deleted",
        message: "Deal has been removed",
        color: "green",
      });
    },
  });

  function startEditing() {
    if (!deal) return;
    setEditTitle(deal.title);
    setEditValue(deal.value ?? undefined);
    setEditProbability(deal.probability ?? undefined);
    setEditExpectedCloseDate(deal.expectedCloseDate ? new Date(deal.expectedCloseDate) : null);
    setIsEditing(true);
  }

  function saveEdits() {
    if (!deal) return;
    updateDealMutation.mutate({
      id: deal.id,
      title: editTitle,
      value: editValue ?? null,
      probability: editProbability ?? null,
      expectedCloseDate: editExpectedCloseDate,
    });
  }

  function formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      title={
        <Text fw={600} size="lg">
          Deal Details
        </Text>
      }
    >
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader />
        </div>
      )}

      {deal && (
        <Stack gap="md">
          {/* Header with edit/delete */}
          <Group justify="space-between">
            {isEditing ? (
              <TextInput
                value={editTitle}
                onChange={(e) => setEditTitle(e.currentTarget.value)}
                className="flex-1"
              />
            ) : (
              <Text fw={600} size="xl">
                {deal.title}
              </Text>
            )}
            <Group gap="xs">
              {isEditing ? (
                <>
                  <ActionIcon
                    variant="light"
                    color="green"
                    onClick={saveEdits}
                    loading={updateDealMutation.isPending}
                  >
                    <IconCheck size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    color="gray"
                    onClick={() => setIsEditing(false)}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </>
              ) : (
                <>
                  <ActionIcon variant="light" onClick={startEditing}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    color="red"
                    onClick={() => deleteDealMutation.mutate({ id: deal.id })}
                    loading={deleteDealMutation.isPending}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </>
              )}
            </Group>
          </Group>

          {/* Stage badge */}
          <Badge variant="light" color={deal.stage.color} size="lg">
            {deal.stage.name}
          </Badge>

          {/* Editable fields */}
          {isEditing ? (
            <Stack gap="sm">
              <Group grow>
                <NumberInput
                  label="Value"
                  prefix="$"
                  min={0}
                  thousandSeparator=","
                  value={editValue ?? ""}
                  onChange={(val) => setEditValue(typeof val === "number" ? val : undefined)}
                />
                <NumberInput
                  label="Probability"
                  suffix="%"
                  min={0}
                  max={100}
                  value={editProbability ?? ""}
                  onChange={(val) => setEditProbability(typeof val === "number" ? val : undefined)}
                />
              </Group>
              <DateInput
                label="Expected Close Date"
                value={editExpectedCloseDate}
                onChange={setEditExpectedCloseDate}
                clearable
              />
            </Stack>
          ) : (
            <Stack gap="xs">
              {deal.value != null && (
                <Group gap="xs">
                  <IconCurrencyDollar size={16} className="text-text-muted" />
                  <Text size="sm" fw={600}>
                    {formatCurrency(deal.value, deal.currency)}
                  </Text>
                </Group>
              )}
              {deal.probability != null && (
                <Text size="sm" className="text-text-secondary">
                  Win probability: {deal.probability}%
                </Text>
              )}
              {deal.expectedCloseDate && (
                <Text size="sm" className="text-text-secondary">
                  Expected close:{" "}
                  {new Date(deal.expectedCloseDate).toLocaleDateString()}
                </Text>
              )}
              {deal.closedAt && (
                <Text size="sm" className="text-text-secondary">
                  Closed: {new Date(deal.closedAt).toLocaleDateString()}
                </Text>
              )}
            </Stack>
          )}

          {/* Contact & Organization */}
          {(deal.contact ?? deal.organization) && (
            <>
              <Divider />
              <Stack gap="xs">
                {deal.contact && (
                  <Group gap="xs">
                    <Text size="sm" className="text-text-muted">
                      Contact:
                    </Text>
                    <Text size="sm">
                      {[deal.contact.firstName, deal.contact.lastName]
                        .filter(Boolean)
                        .join(" ")}
                    </Text>
                  </Group>
                )}
                {deal.organization && (
                  <Group gap="xs">
                    <Text size="sm" className="text-text-muted">
                      Organization:
                    </Text>
                    <Text size="sm">{deal.organization.name}</Text>
                  </Group>
                )}
              </Stack>
            </>
          )}

          {/* Assignee */}
          {deal.assignedTo && (
            <>
              <Divider />
              <Group gap="xs">
                <Text size="sm" className="text-text-muted">
                  Assigned to:
                </Text>
                <Avatar
                  src={deal.assignedTo.image}
                  size="sm"
                  radius="xl"
                  color={getAvatarColor(getColorSeed(deal.assignedTo.name ?? ""))}
                >
                  <span style={{ color: getTextColor(getAvatarColor(getColorSeed(deal.assignedTo.name ?? ""))) }}>
                    {getInitial(deal.assignedTo.name ?? "")}
                  </span>
                </Avatar>
                <Text size="sm">{deal.assignedTo.name}</Text>
              </Group>
            </>
          )}

          {/* Description */}
          {deal.description && (
            <>
              <Divider />
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Description
                </Text>
                <Text size="sm" className="text-text-secondary">
                  {deal.description}
                </Text>
              </Stack>
            </>
          )}

          {/* Add note */}
          <Divider />
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Add Note
            </Text>
            <Textarea
              placeholder="Write a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.currentTarget.value)}
              minRows={2}
            />
            <Button
              size="xs"
              variant="light"
              leftSection={<IconNote size={14} />}
              onClick={() => {
                if (!noteText.trim()) return;
                addNoteMutation.mutate({
                  dealId: deal.id,
                  content: noteText.trim(),
                });
              }}
              loading={addNoteMutation.isPending}
              disabled={!noteText.trim()}
            >
              Add Note
            </Button>
          </Stack>

          {/* Activity timeline */}
          <Divider />
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Activity
            </Text>
            {deal.activities.length === 0 && (
              <Text size="sm" c="dimmed">
                No activity yet
              </Text>
            )}
            {deal.activities.map((activity) => (
              <div
                key={activity.id}
                className="rounded-md border border-border-primary p-3"
              >
                <Group justify="space-between" mb={4}>
                  <Group gap="xs">
                    {activity.type === "STAGE_CHANGE" && (
                      <IconArrowRight size={14} className="text-blue-500" />
                    )}
                    {activity.type === "NOTE" && (
                      <IconNote size={14} className="text-text-muted" />
                    )}
                    {activity.type === "VALUE_CHANGE" && (
                      <IconCurrencyDollar size={14} className="text-text-muted" />
                    )}
                    <Text size="xs" fw={500}>
                      {activity.type.replace("_", " ")}
                    </Text>
                  </Group>
                  <Text size="xs" className="text-text-muted">
                    {new Date(activity.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </Group>
                {activity.content && (
                  <Text size="xs" className="text-text-secondary">
                    {activity.content}
                  </Text>
                )}
                {activity.user && (
                  <Group gap={4} mt={4}>
                    <Avatar
                      src={activity.user.image}
                      size={16}
                      radius="xl"
                      color={getAvatarColor(getColorSeed(activity.user.name ?? ""))}
                    >
                      <span
                        style={{
                          color: getTextColor(getAvatarColor(getColorSeed(activity.user.name ?? ""))),
                          fontSize: 8,
                        }}
                      >
                        {getInitial(activity.user.name ?? "")}
                      </span>
                    </Avatar>
                    <Text size="xs" className="text-text-muted">
                      {activity.user.name}
                    </Text>
                  </Group>
                )}
              </div>
            ))}
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
