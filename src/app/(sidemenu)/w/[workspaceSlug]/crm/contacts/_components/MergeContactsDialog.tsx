"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  Radio,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowsJoin2, IconSparkles } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import {
  contactDisplayName,
  countsToMove,
  proposeMerge,
  totalRelated,
  type MergeCandidate,
  type MergeChoices,
  type MergeFieldKey,
  type MergeRelatedCounts,
} from "~/lib/crm/contactMerge";

interface MergeContactsDialogProps {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  contactIds: string[];
  /** Called after a successful merge with the kept contact's id. */
  onMerged: (primaryId: string) => void;
}

const COUNT_LABELS: Record<keyof MergeRelatedCounts, [string, string]> = {
  interactions: ["interaction", "interactions"],
  communications: ["communication", "communications"],
  deals: ["deal", "deals"],
  meetings: ["meeting", "meetings"],
  screenshots: ["image", "images"],
  enrichments: ["enrichment job", "enrichment jobs"],
  listMemberships: ["list membership", "list memberships"],
};

function describeCounts(counts: MergeRelatedCounts): string {
  const parts = (Object.keys(COUNT_LABELS) as (keyof MergeRelatedCounts)[])
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${COUNT_LABELS[k][counts[k] === 1 ? 0 : 1]}`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function CandidateHeader({
  candidate,
  isPrimary,
  onKeep,
}: {
  candidate: MergeCandidate;
  isPrimary: boolean;
  onKeep: () => void;
}) {
  const name = contactDisplayName(candidate);
  const related = totalRelated(candidate.counts);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Avatar size="sm" radius="xl" src={candidate.imageUrl}>
          {name[0]?.toUpperCase() ?? "?"}
        </Avatar>
        <div className="min-w-0">
          <Text size="sm" fw={600} className="truncate text-text-primary">
            {name}
          </Text>
          <Text size="xs" className="text-text-muted">
            {related === 0
              ? "No linked records"
              : `${related} linked record${related === 1 ? "" : "s"}`}
            {" · added "}
            {new Date(candidate.createdAt).toLocaleDateString()}
          </Text>
        </div>
      </div>
      {/* Shared name: the radios sit in separate table headers, so the group
          (and its arrow-key navigation) comes from the name, not a wrapper.
          Not Radio.Group — its context would also capture the field radios. */}
      <Radio
        size="xs"
        name="merge-primary"
        value={candidate.id}
        checked={isPrimary}
        onChange={onKeep}
        aria-label={`Keep ${name}`}
        label={isPrimary ? "Kept — keeps its link and history" : "Keep this one instead"}
        classNames={{ label: isPrimary ? "font-medium" : "text-text-muted" }}
      />
    </div>
  );
}

export function MergeContactsDialog({
  opened,
  onClose,
  workspaceId,
  contactIds,
  onMerged,
}: MergeContactsDialogProps) {
  const utils = api.useUtils();
  const preview = api.crmContact.getMergePreview.useQuery(
    { workspaceId, ids: contactIds },
    { enabled: opened && contactIds.length >= 2 },
  );

  const [primaryId, setPrimaryId] = useState<string | null>(null);
  // Only the user's deviations from the proposal live here; everything else
  // follows the suggestion, so changing the kept contact re-derives cleanly.
  const [overrides, setOverrides] = useState<MergeChoices>({});

  useEffect(() => {
    if (!opened) {
      setPrimaryId(null);
      setOverrides({});
    }
  }, [opened]);

  const candidates = preview.data?.candidates;
  const effectivePrimaryId =
    primaryId && candidates?.some((c) => c.id === primaryId)
      ? primaryId
      : (preview.data?.suggestedPrimaryId ?? null);

  const proposal = useMemo(
    () =>
      candidates && effectivePrimaryId
        ? proposeMerge(candidates, effectivePrimaryId)
        : null,
    [candidates, effectivePrimaryId],
  );

  // Columns: kept contact first, then the others in the proposal's order.
  const columns = useMemo(() => {
    if (!candidates || !effectivePrimaryId) return [];
    const primary = candidates.find((c) => c.id === effectivePrimaryId);
    return primary
      ? [primary, ...candidates.filter((c) => c.id !== effectivePrimaryId)]
      : candidates;
  }, [candidates, effectivePrimaryId]);

  const moving = useMemo(
    () =>
      candidates && effectivePrimaryId
        ? countsToMove(candidates, effectivePrimaryId)
        : null,
    [candidates, effectivePrimaryId],
  );

  const merge = api.crmContact.merge.useMutation({
    onSuccess: (result) => {
      void utils.crmContact.getAll.invalidate();
      void utils.crmContact.getStats.invalidate();
      void utils.crmContact.getById.invalidate();
      const movedText = describeCounts(result.moved);
      notifications.show({
        title: `Merged ${result.deletedCount + 1} contacts`,
        message: `Kept ${contactDisplayName(result.contact)}.${
          movedText ? ` ${movedText} moved over.` : ""
        }`,
        color: "green",
      });
      onMerged(result.contact.id);
      onClose();
    },
    onError: (error) => {
      notifications.show({ title: "Merge failed", message: error.message, color: "red" });
    },
  });

  const choiceFor = (key: MergeFieldKey): string | null | undefined => {
    if (key in overrides) return overrides[key];
    return proposal?.fields.find((f) => f.key === key)?.suggestedContactId;
  };

  const setChoice = (key: MergeFieldKey, contactId: string) => {
    const suggested = proposal?.fields.find((f) => f.key === key)?.suggestedContactId;
    setOverrides((prev) => {
      const next = { ...prev };
      if (contactId === suggested) delete next[key];
      else next[key] = contactId;
      return next;
    });
  };

  const handleKeep = (id: string) => {
    setPrimaryId(id);
    setOverrides({});
  };

  const handleMerge = () => {
    if (!effectivePrimaryId || !candidates || !proposal) return;
    // Send every field's effective choice, not just the overrides, so the
    // server applies exactly what the user reviewed rather than re-deriving
    // defaults of its own.
    const choices: MergeChoices = {};
    for (const field of proposal.fields) {
      const chosen = choiceFor(field.key);
      if (chosen !== undefined) choices[field.key] = chosen;
    }
    merge.mutate({
      workspaceId,
      primaryId: effectivePrimaryId,
      duplicateIds: candidates.filter((c) => c.id !== effectivePrimaryId).map((c) => c.id),
      choices,
    });
  };

  const conflictCount = proposal?.fields.filter((f) => f.status === "conflict").length ?? 0;
  const overrideCount = Object.keys(overrides).length;
  const primaryName = columns[0] ? contactDisplayName(columns[0]) : "";
  const movingText = moving ? describeCounts(moving) : "";
  const hasDuplicates = candidates?.some((c) => c.id !== effectivePrimaryId) ?? false;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconArrowsJoin2 size={18} />
          <span>Merge {contactIds.length} contacts</span>
        </Group>
      }
      size="auto"
      centered
      closeOnClickOutside={!merge.isPending}
    >
      <Stack gap="md" className="max-w-[min(90vw,1100px)]">
        <Text size="sm" className="text-text-secondary">
          One contact is kept and the others are folded into it. The kept contact
          keeps its link and history; the rest are deleted once their activity has
          moved over. We picked the most complete value for each field, preferring
          what a person typed over what the enrichment agent found. Change anything
          you disagree with before merging.
        </Text>

        {preview.isLoading && (
          <Stack gap="xs">
            <Skeleton height={56} />
            <Skeleton height={200} />
          </Stack>
        )}

        {preview.error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {preview.error.message}
          </Alert>
        )}

        {proposal && columns.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-md border border-border-primary">
              <table className="w-full text-sm">
                <thead className="bg-surface-secondary">
                  <tr>
                    <th className="w-36 px-3 py-3 text-left align-top">
                      <Text size="xs" fw={600} className="uppercase text-text-muted">
                        Field
                      </Text>
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c.id}
                        className={`min-w-[200px] px-3 py-3 text-left align-top ${
                          c.id === effectivePrimaryId ? "bg-surface-hover" : ""
                        }`}
                      >
                        <CandidateHeader
                          candidate={c}
                          isPrimary={c.id === effectivePrimaryId}
                          onKeep={() => handleKeep(c.id)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proposal.fields.map((field) => {
                    const chosen = choiceFor(field.key);
                    const isOverridden = field.key in overrides;
                    return (
                      <tr
                        key={field.key}
                        className={`border-t border-border-primary ${
                          field.status === "empty" ? "opacity-60" : ""
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            <Text size="sm" className="text-text-primary">
                              {field.label}
                            </Text>
                            {field.status === "conflict" && (
                              <Badge size="xs" color="yellow" variant="light">
                                Differs
                              </Badge>
                            )}
                            {isOverridden && (
                              <Badge size="xs" color="blue" variant="light">
                                Your pick
                              </Badge>
                            )}
                          </div>
                        </td>
                        {columns.map((c) => {
                          const option = field.options.find((o) => o.contactId === c.id);
                          const isPrimaryCol = c.id === effectivePrimaryId;
                          return (
                            <td
                              key={c.id}
                              className={`px-3 py-2 align-top ${
                                isPrimaryCol ? "bg-surface-hover" : ""
                              }`}
                            >
                              {option ? (
                                <Radio
                                  size="xs"
                                  name={`merge-${field.key}`}
                                  checked={chosen === c.id}
                                  onChange={() => setChoice(field.key, c.id)}
                                  aria-label={`${field.label}: ${option.display} from ${contactDisplayName(c)}`}
                                  label={
                                    <span className="inline-flex items-start gap-1.5">
                                      <span
                                        className={`break-words ${
                                          chosen === c.id
                                            ? "text-text-primary"
                                            : "text-text-muted"
                                        }`}
                                      >
                                        {field.key === "about" && option.display.length > 140
                                          ? `${option.display.slice(0, 140)}…`
                                          : option.display}
                                      </span>
                                      {option.isAiSourced && (
                                        <Tooltip label="Filled in by enrichment, not a person — verify before trusting it">
                                          <Badge
                                            size="xs"
                                            variant="light"
                                            color="grape"
                                            className="shrink-0"
                                            leftSection={<IconSparkles size={10} />}
                                          >
                                            AI
                                          </Badge>
                                        </Tooltip>
                                      )}
                                    </span>
                                  }
                                />
                              ) : (
                                <Text size="sm" className="text-text-muted">
                                  —
                                </Text>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {(proposal.skills.length > 0 || proposal.tags.length > 0) && (
                    <tr className="border-t border-border-primary">
                      <td className="px-3 py-2 align-top">
                        <Text size="sm" className="text-text-primary">
                          Skills &amp; tags
                        </Text>
                        <Badge size="xs" variant="light" color="gray" mt={4}>
                          Combined
                        </Badge>
                      </td>
                      <td className="px-3 py-2 align-top" colSpan={columns.length}>
                        <Group gap={4}>
                          {proposal.skills.map((s) => (
                            <Badge key={`s-${s}`} size="sm" variant="outline" color="gray">
                              {s}
                            </Badge>
                          ))}
                          {proposal.tags.map((t) => (
                            <Badge key={`t-${t}`} size="sm" variant="light" color="gray">
                              #{t}
                            </Badge>
                          ))}
                        </Group>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Alert color="gray" variant="light" title="What happens">
              <Stack gap={4}>
                <Text size="sm">
                  {movingText
                    ? `${movingText[0]!.toUpperCase()}${movingText.slice(1)} move to ${primaryName}.`
                    : `Nothing is attached to the other contact${
                        columns.length > 2 ? "s" : ""
                      }; only field values are combined.`}
                </Text>
                <Text size="sm">
                  The most recent interaction, the highest connection score, and the
                  earliest first-seen date are kept. If anyone unsubscribed from
                  email, the merged contact stays unsubscribed.
                </Text>
                <Text size="sm" className="text-text-secondary">
                  {columns.length - 1 === 1
                    ? "The other contact is deleted."
                    : `The other ${columns.length - 1} contacts are deleted.`}{" "}
                  This can&apos;t be undone.
                </Text>
              </Stack>
            </Alert>
          </>
        )}

        <Group justify="space-between" mt="xs">
          <Text size="xs" className="text-text-muted">
            {proposal
              ? [
                  conflictCount > 0
                    ? `${conflictCount} field${conflictCount === 1 ? "" : "s"} differ`
                    : "No conflicting fields",
                  overrideCount > 0 ? `${overrideCount} changed by you` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : ""}
          </Text>
          <Group gap="xs">
            <Button variant="subtle" onClick={onClose} disabled={merge.isPending}>
              Cancel
            </Button>
            <Button
              leftSection={<IconArrowsJoin2 size={16} />}
              onClick={handleMerge}
              loading={merge.isPending}
              disabled={!proposal || !hasDuplicates}
            >
              Merge into {primaryName || "kept contact"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
