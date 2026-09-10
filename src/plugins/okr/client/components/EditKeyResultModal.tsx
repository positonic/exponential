"use client";

import {
  Modal,
  Button,
  Group,
  TextInput,
  Textarea,
  Select,
  NumberInput,
  Stack,
  Text,
  Divider,
  MultiSelect,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { reportHandledError } from "~/lib/reportHandledError";
import { KeyResultGuidanceIcon } from "./KeyResultGuidance";

// Unit options for key results
const unitOptions = [
  { value: "percent", label: "Percentage (%)" },
  { value: "count", label: "Count (#)" },
  { value: "currency", label: "Currency ($)" },
  { value: "hours", label: "Hours" },
  { value: "custom", label: "Custom" },
];

// Status options for key results
const statusOptions = [
  { value: "not-started", label: "Not Started" },
  { value: "on-track", label: "On Track" },
  { value: "at-risk", label: "At Risk" },
  { value: "off-track", label: "Off Track" },
  { value: "achieved", label: "Achieved" },
];

type UnitType = "percent" | "count" | "currency" | "hours" | "custom";
type StatusType = "not-started" | "on-track" | "at-risk" | "off-track" | "achieved";

interface KeyResultData {
  id: string;
  title: string;
  description?: string | null;
  currentValue: number;
  targetValue: number;
  startValue: number;
  unit?: string;
  unitLabel?: string | null;
  status: string;
  confidence?: number | null;
  period?: string;
  userId?: string;
  driUserId?: string | null;
  goalId?: number;
  /**
   * Linked work the caller already holds (the OKR card's row carries it).
   * Seeds the pickers on open so they don't sit empty until `okr.getById`
   * returns; the fresh fetch still wins once it lands.
   */
  projects?: Array<{ project: { id: string } }>;
  features?: Array<{ feature: { id: string } }>;
}

type ObjectiveList = RouterOutputs["okr"]["getByObjective"];
type CachedKeyResult = ObjectiveList[number]["keyResults"][number];

const linkedProjectIdsOf = (
  links: Array<{ project: { id: string } }> | undefined,
): string[] => links?.map((link) => link.project.id) ?? [];

const linkedFeatureIdsOf = (
  links: Array<{ feature: { id: string } }> | undefined,
): string[] => links?.map((link) => link.feature.id) ?? [];

const sameIdSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

type EditKeyResultModalProps = {
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  variant?: "default" | "review";
} & (
  | {
      mode?: "edit";
      keyResult: KeyResultData | null;
      goalId?: never;
      period?: never;
      workspaceId?: never;
      defaultDriUserId?: never;
      initialProjectIds?: never;
    }
  | {
      mode: "create";
      keyResult?: null;
      goalId: number;
      period: string;
      workspaceId?: string;
      defaultDriUserId?: string | null;
      initialProjectIds?: string[];
    }
);

export function EditKeyResultModal({
  keyResult,
  opened,
  onClose,
  onSuccess,
  mode = "edit",
  variant = "default",
  goalId,
  period: createPeriod,
  workspaceId: createWorkspaceId,
  defaultDriUserId,
  initialProjectIds,
}: EditKeyResultModalProps) {
  const isCreate = mode === "create";
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetValue, setTargetValue] = useState<number>(100);
  const [currentValue, setCurrentValue] = useState<number>(0);
  const [startValue, setStartValue] = useState<number>(0);
  const [unit, setUnit] = useState<UnitType>("percent");
  const [unitLabel, setUnitLabel] = useState("");
  const [status, setStatus] = useState<StatusType>("on-track");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [driUserId, setDriUserId] = useState<string | null>(null);
  const [objectiveId, setObjectiveId] = useState<string | null>(null);

  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { data: currentUser } = api.user.getCurrentUser.useQuery();

  // Fetch available projects for the workspace
  const { data: availableProjects = [] } = api.project.getAll.useQuery(
    { workspaceId: workspace?.id ?? createWorkspaceId },
    { enabled: opened && !!(workspace?.id ?? createWorkspaceId) }
  );

  // Fetch the workspace's Products' Features for the second execution edge
  // (ADR-0050). Reuses the Product Roadmap's lean query — no new procedure.
  const { data: availableFeatures = [] } =
    api.product.feature.listForWorkspace.useQuery(
      { workspaceId: workspace?.id ?? createWorkspaceId ?? "" },
      { enabled: opened && !!(workspace?.id ?? createWorkspaceId) }
    );

  // Fetch objectives (goals) the user owns in this workspace, for reassignment
  const { data: availableObjectives = [] } = api.okr.getAvailableGoals.useQuery(
    { workspaceId: workspace?.id ?? createWorkspaceId },
    { enabled: !isCreate && opened }
  );

  // Query to get fresh key result data (edit mode only)
  const { data: freshKeyResult } = api.okr.getById.useQuery(
    { id: keyResult?.id ?? "" },
    { enabled: !isCreate && !!keyResult?.id && opened }
  );

  // Use fresh data if available, fallback to prop
  const currentKeyResult = freshKeyResult ?? keyResult;

  // Reset form fields to defaults (used for create mode + when modal opens)
  const resetCreateDefaults = () => {
    setTitle("");
    setDescription("");
    setTargetValue(100);
    setCurrentValue(0);
    setStartValue(0);
    setUnit("percent");
    setUnitLabel("");
    setStatus("on-track");
    setConfidence(null);
    setSelectedProjectIds(initialProjectIds ?? []);
    setSelectedFeatureIds([]);
    setDriUserId(defaultDriUserId ?? currentUser?.id ?? null);
  };

  // Populate form when key result changes (edit) or reset (create)
  useEffect(() => {
    if (isCreate) {
      if (opened) resetCreateDefaults();
      return;
    }
    if (currentKeyResult) {
      setTitle(currentKeyResult.title);
      setDescription(currentKeyResult.description ?? "");
      setTargetValue(currentKeyResult.targetValue);
      setCurrentValue(currentKeyResult.currentValue);
      setStartValue(currentKeyResult.startValue);
      setUnit((currentKeyResult.unit as UnitType) ?? "percent");
      setUnitLabel(currentKeyResult.unitLabel ?? "");
      setStatus((currentKeyResult.status as StatusType) ?? "on-track");
      setConfidence(currentKeyResult.confidence ?? null);
      setDriUserId(
        currentKeyResult.driUserId ??
          currentKeyResult.userId ??
          currentUser?.id ??
          null
      );
      setObjectiveId(
        currentKeyResult.goalId != null
          ? String(currentKeyResult.goalId)
          : null
      );

      // Linked work: the fresh fetch when it has landed, else whatever the
      // caller passed in, so the pickers are right from the first paint.
      setSelectedProjectIds(linkedProjectIdsOf(currentKeyResult.projects));
      setSelectedFeatureIds(linkedFeatureIdsOf(currentKeyResult.features));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKeyResult, currentUser?.id, freshKeyResult, isCreate, opened]);

  // Lets the optimistic paint show the new DRI's avatar/name straight away.
  const driUserById = useMemo(() => {
    const byId = new Map<string, CachedKeyResult["driUser"]>();
    for (const member of workspace?.members ?? []) {
      byId.set(member.user.id, {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image,
      });
    }
    if (currentUser) {
      byId.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.name ?? null,
        email: currentUser.email ?? null,
        image: currentUser.image ?? null,
      });
    }
    return byId;
  }, [currentUser, workspace?.members]);

  const driOptions = useMemo(() => {
    const members = workspace?.members ?? [];
    const optionMap = new Map<string, { value: string; label: string }>();

    members.forEach((member) => {
      const label = member.user.name ?? member.user.email ?? "Unknown User";
      optionMap.set(member.user.id, { value: member.user.id, label });
    });

    if (currentUser) {
      const label = currentUser.name ?? currentUser.email ?? "Me";
      optionMap.set(currentUser.id, { value: currentUser.id, label });
    }

    return Array.from(optionMap.values());
  }, [currentUser, workspace?.members]);

  const objectiveOptions = useMemo(
    () =>
      availableObjectives.map((goal) => ({
        value: String(goal.id),
        label: goal.title,
      })),
    [availableObjectives]
  );

  useEffect(() => {
    if (driOptions.length === 0) return;
    if (!driUserId || !driOptions.some((option) => option.value === driUserId)) {
      setDriUserId(driOptions[0]?.value ?? null);
    }
  }, [driOptions, driUserId]);

  /**
   * Every OKR query a save can affect, invalidated ONCE after all of the
   * save's mutations have settled. Callers' `onSuccess` handlers must not
   * repeat these: react-query's invalidate aborts an in-flight refetch and
   * re-issues it, so overlapping invalidations from three mutation callbacks
   * plus the caller used to put six copies of `getByObjective` — the page's
   * heaviest query — into a single request.
   */
  const refreshOkrQueries = () =>
    Promise.all([
      utils.okr.getByObjective.invalidate(),
      utils.okr.getCountsByYear.invalidate(),
      utils.okr.getStats.invalidate(),
      utils.okr.getAll.invalidate(),
      utils.okr.getById.invalidate(),
    ]);

  /**
   * Apply `patch` to this key result in every cached `getByObjective` page
   * (all period / scope variants share the key prefix). This is what makes
   * the card reflect a save the instant the modal closes; the refetch that
   * follows the mutations replaces it with the server's version, or reverts
   * it if a mutation failed.
   */
  const patchCachedKeyResult = (
    krId: string,
    patch: (kr: CachedKeyResult) => CachedKeyResult,
  ) => {
    queryClient.setQueriesData<ObjectiveList>(
      { queryKey: getQueryKey(api.okr.getByObjective) },
      (old) =>
        old?.map((goal) => ({
          ...goal,
          keyResults: goal.keyResults.map((kr) =>
            kr.id === krId ? patch(kr) : kr,
          ),
        })),
    );
  };

  // The mutations themselves stay dumb: handleSubmit sequences them and
  // owns the single refresh afterwards.
  const updateKeyResult = api.okr.update.useMutation();
  const createKeyResult = api.okr.create.useMutation();
  const updateLinkedProjects = api.okr.updateLinkedProjects.useMutation();
  // ADR-0050: Features are the second execution edge.
  const updateLinkedFeatures = api.okr.updateLinkedFeatures.useMutation();

  // Delete mutation
  const deleteKeyResult = api.okr.delete.useMutation({
    onSuccess: async () => {
      await refreshOkrQueries();
      onSuccess?.();
      onClose();
    },
  });

  /**
   * The saved form as the card will show it once the server agrees. Mirrors
   * `okr.update`'s semantics field for field (an empty description or a
   * missing confidence is "leave as is", not "clear") so the optimistic
   * paint and the refetched truth never disagree. Links the picker added
   * are synthesised from the option lists; links that already existed are
   * kept as-is so a feature's ticket progress survives the round trip.
   */
  const buildOptimisticKeyResult = (kr: CachedKeyResult): CachedKeyResult => {
    const nextDriUserId = driUserId ?? currentUser?.id ?? kr.driUserId;
    const nextDriUser =
      nextDriUserId === kr.driUserId
        ? kr.driUser
        : (driUserById.get(nextDriUserId ?? "") ?? kr.driUser);

    return {
      ...kr,
      title,
      description: description || kr.description,
      targetValue,
      currentValue,
      startValue,
      unit,
      unitLabel: unit === "custom" ? unitLabel : kr.unitLabel,
      status,
      confidence: confidence ?? kr.confidence,
      driUserId: nextDriUserId,
      driUser: nextDriUser,
      projects: selectedProjectIds.flatMap((projectId) => {
        const existing = kr.projects.find(
          (link) => link.project.id === projectId,
        );
        if (existing) return [existing];
        const project = availableProjects.find((p) => p.id === projectId);
        if (!project) return [];
        return [
          {
            id: `optimistic-${kr.id}-${projectId}`,
            keyResultId: kr.id,
            projectId,
            assignedAt: new Date(),
            project: {
              id: project.id,
              name: project.name,
              status: project.status,
              slug: project.slug,
            },
          },
        ];
      }),
      features: selectedFeatureIds.flatMap((featureId) => {
        const existing = kr.features.find(
          (link) => link.feature.id === featureId,
        );
        if (existing) return [existing];
        const feature = availableFeatures.find((f) => f.id === featureId);
        if (!feature) return [];
        return [
          {
            id: `optimistic-${kr.id}-${featureId}`,
            keyResultId: kr.id,
            featureId,
            assignedAt: new Date(),
            feature: {
              id: feature.id,
              name: feature.name,
              status: feature.status,
              product: feature.product,
              // Unknown until the refetch; null renders no chip, never "0/0".
              ticketProgress: null,
            },
          },
        ];
      }),
    };
  };

  const handleSubmit = async () => {
    if (!title) return;

    try {
      if (isCreate) {
        if (goalId == null || !createPeriod) return;
        const created = await createKeyResult.mutateAsync({
          goalId,
          title,
          description: description || undefined,
          targetValue,
          startValue,
          currentValue,
          unit,
          unitLabel: unit === "custom" ? unitLabel : undefined,
          period: createPeriod,
          driUserId: driUserId ?? undefined,
          workspaceId: createWorkspaceId,
        });

        if (selectedProjectIds.length > 0) {
          await updateLinkedProjects.mutateAsync({
            keyResultId: created.id,
            projectIds: selectedProjectIds,
          });
        }

        if (selectedFeatureIds.length > 0) {
          await updateLinkedFeatures.mutateAsync({
            keyResultId: created.id,
            featureIds: selectedFeatureIds,
          });
        }

        await refreshOkrQueries();
        onSuccess?.();
        onClose();
        return;
      }

      if (!currentKeyResult) return;
      const keyResultId = currentKeyResult.id;
      const nextGoalId = objectiveId ? Number(objectiveId) : undefined;
      const movesObjective =
        nextGoalId != null && nextGoalId !== currentKeyResult.goalId;

      // Paint the edit into the cached cards before the request leaves.
      // A key result moving to another objective is left to the refetch:
      // that changes which card owns it, not just what the row says.
      if (!movesObjective) {
        patchCachedKeyResult(keyResultId, buildOptimisticKeyResult);
      }

      // Only rewrite the link tables when the user actually changed them.
      // The baseline is the links we know about (fresh fetch, or the
      // card's own rows); with no baseline at all — an id-only stub opened
      // before okr.getById returned — an untouched, empty picker must not
      // be mistaken for "unlink everything".
      const knownProjectIds = linkedProjectIdsOf(currentKeyResult.projects);
      const knownFeatureIds = linkedFeatureIdsOf(currentKeyResult.features);
      const hasLinkBaseline =
        currentKeyResult.projects !== undefined ||
        currentKeyResult.features !== undefined;
      const projectsChanged =
        hasLinkBaseline && !sameIdSet(knownProjectIds, selectedProjectIds);
      const featuresChanged =
        hasLinkBaseline && !sameIdSet(knownFeatureIds, selectedFeatureIds);

      // Close now; the mutations and the refresh run behind the modal.
      onClose();

      const results = await Promise.allSettled([
        updateKeyResult.mutateAsync({
          id: keyResultId,
          title,
          description: description || undefined,
          targetValue,
          currentValue,
          startValue,
          unit,
          unitLabel: unit === "custom" ? unitLabel : undefined,
          status,
          confidence: confidence ?? undefined,
          driUserId: driUserId ?? currentUser?.id,
          goalId: nextGoalId,
        }),
        ...(projectsChanged
          ? [
              updateLinkedProjects.mutateAsync({
                keyResultId,
                projectIds: selectedProjectIds,
              }),
            ]
          : []),
        ...(featuresChanged
          ? [
              updateLinkedFeatures.mutateAsync({
                keyResultId,
                featureIds: selectedFeatureIds,
              }),
            ]
          : []),
      ]);

      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      for (const result of rejected) {
        reportHandledError(result.reason, {
          area: "okr-edit-key-result",
          context: { keyResultId },
        });
      }
      if (rejected.length > 0) {
        // The modal is already closed, so this is the only signal the user
        // gets that the card is about to revert.
        notifications.show({
          title: "Key result not saved",
          message:
            rejected[0]?.reason instanceof Error
              ? rejected[0].reason.message
              : "The server refused part of the change. Reopen it to try again.",
          color: "red",
        });
      }

      // One refetch: confirms the optimistic paint, or reverts it if a
      // mutation was refused.
      await refreshOkrQueries();
      onSuccess?.();
    } catch (error) {
      console.error("Failed to save key result:", error);
      reportHandledError(error, { area: "okr-save-key-result" });
    }
  };

  const handleDelete = () => {
    if (!currentKeyResult) return;

    if (window.confirm("Are you sure you want to delete this key result?")) {
      deleteKeyResult.mutate({ id: currentKeyResult.id });
    }
  };

  // Calculate progress percentage
  const range = targetValue - startValue;
  const progressPercent =
    range > 0 ? Math.round(((currentValue - startValue) / range) * 100) : 0;

  const isReview = variant === "review";

  // Token map: in 'review' variant, swap to portfolio-review tokens so the
  // modal blends with the weekly-plan surface. The `pr-modal-surface`
  // class (defined in globals.css) re-declares `--pr-*` outside the
  // surface element so they resolve inside the Mantine Portal.
  const bgElevated = isReview
    ? "var(--pr-bg-elevated)"
    : "var(--color-bg-elevated)";
  const bgInput = isReview
    ? "var(--pr-surface-muted)"
    : "var(--color-bg-secondary)";
  const textPrimary = isReview
    ? "var(--pr-text-primary)"
    : "var(--color-text-primary)";
  const textSecondary = isReview
    ? "var(--pr-text-secondary)"
    : "var(--color-text-secondary)";
  const borderPrimary = isReview
    ? "var(--pr-border-subtle)"
    : "var(--color-border-primary)";

  const inputStyles = {
    input: {
      backgroundColor: bgInput,
      borderColor: borderPrimary,
      color: textPrimary,
    },
    label: {
      color: textSecondary,
    },
  };
  const selectStyles = {
    ...inputStyles,
    dropdown: {
      backgroundColor: bgElevated,
      borderColor: borderPrimary,
    },
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      radius="md"
      classNames={isReview ? { content: "pr-modal-surface", header: "pr-modal-surface" } : undefined}
      title={
        <Text fw={600} size="lg">
          {isCreate ? "Create Key Result" : "Edit Key Result"}
        </Text>
      }
      styles={{
        content: {
          backgroundColor: bgElevated,
          color: textPrimary,
        },
        header: {
          backgroundColor: bgElevated,
          borderBottom: `1px solid ${borderPrimary}`,
        },
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <Stack gap="md" p="md">
          {/* Title */}
          <TextInput
            label={
              <Group gap={4} align="center" component="span" display="inline-flex">
                <span>Title</span>
                <KeyResultGuidanceIcon />
              </Group>
            }
            placeholder="What do you want to achieve?"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
            styles={inputStyles}
          />

          <Select
            label="DRI"
            description="Directly responsible individual"
            placeholder="Select a DRI"
            data={driOptions}
            value={driUserId}
            onChange={(value) => setDriUserId(value ?? null)}
            required
            styles={selectStyles}
          />

          {!isCreate && (
            <Select
              label="Objective"
              description="The objective this key result belongs to"
              placeholder="Search objectives..."
              data={objectiveOptions}
              value={objectiveId}
              onChange={(value) => setObjectiveId(value)}
              searchable
              nothingFoundMessage="No objectives found"
              styles={selectStyles}
            />
          )}

          {/* Description */}
          <Textarea
            label="Description"
            placeholder="Add more details about this key result..."
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            minRows={2}
            styles={inputStyles}
          />

          <Divider label="Progress Tracking" labelPosition="center" />

          {/* Values row */}
          <Group grow>
            <NumberInput
              label="Start Value"
              value={startValue}
              onChange={(val) => setStartValue(Number(val) || 0)}
              min={0}
              styles={inputStyles}
            />
            <NumberInput
              label="Current Value"
              value={currentValue}
              onChange={(val) => setCurrentValue(Number(val) || 0)}
              min={0}
              styles={inputStyles}
            />
            <NumberInput
              label="Target Value"
              value={targetValue}
              onChange={(val) => setTargetValue(Number(val) || 0)}
              min={0}
              styles={inputStyles}
            />
          </Group>

          {/* Progress display */}
          <Text size="sm" c="dimmed" ta="center">
            Progress: {progressPercent}% ({currentValue} / {targetValue})
          </Text>

          {/* Unit selection */}
          <Group grow>
            <Select
              label="Unit"
              data={unitOptions}
              value={unit}
              onChange={(val) => setUnit((val as UnitType) ?? "percent")}
              styles={selectStyles}
            />
            {unit === "custom" && (
              <TextInput
                label="Custom Unit Label"
                placeholder="e.g., users, tasks, etc."
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.currentTarget.value)}
                styles={inputStyles}
              />
            )}
          </Group>

          {!isCreate && (
            <>
              <Divider label="Status & Confidence" labelPosition="center" />

              {/* Status and confidence */}
              <Group grow>
                <Select
                  label="Status"
                  data={statusOptions}
                  value={status}
                  onChange={(val) =>
                    setStatus((val as StatusType) ?? "on-track")
                  }
                  styles={selectStyles}
                />
                <NumberInput
                  label="Confidence (%)"
                  placeholder="How confident are you?"
                  value={confidence ?? ""}
                  onChange={(val) =>
                    setConfidence(val === "" ? null : Number(val))
                  }
                  min={0}
                  max={100}
                  styles={inputStyles}
                />
              </Group>
            </>
          )}

          <Divider label="Executing Work" labelPosition="center" />

          {/* Project Selection */}
          <MultiSelect
            label="Projects"
            description="Select projects that contribute to this key result"
            placeholder="Choose projects..."
            data={availableProjects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.status})`,
            }))}
            value={selectedProjectIds}
            onChange={setSelectedProjectIds}
            searchable
            clearable
            styles={selectStyles}
          />

          {/* Feature Selection (ADR-0050) */}
          <MultiSelect
            label="Linked features"
            description="Select features that execute this key result"
            placeholder="Choose features..."
            data={availableFeatures.map((f) => ({
              value: f.id,
              label: `${f.name} (${f.product.name})`,
            }))}
            value={selectedFeatureIds}
            onChange={setSelectedFeatureIds}
            searchable
            clearable
            styles={selectStyles}
          />

          {/* Actions */}
          <Group justify="space-between" mt="lg">
            {isCreate ? (
              <span />
            ) : (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleDelete}
                loading={deleteKeyResult.isPending}
              >
                Delete
              </Button>
            )}
            <Group>
              <Button variant="subtle" color="gray" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={
                  updateKeyResult.isPending ||
                  createKeyResult.isPending ||
                  updateLinkedProjects.isPending ||
                  updateLinkedFeatures.isPending
                }
                disabled={!title}
              >
                {isCreate ? "Create Key Result" : "Save Changes"}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
