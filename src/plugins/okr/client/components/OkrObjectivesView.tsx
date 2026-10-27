"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Text,
  Stack,
  Group,
  Button,
  Select,
  Modal,
  Skeleton,
  TextInput,
  NumberInput,
  Textarea,
  ActionIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconTargetArrow, IconPlus, IconSparkles, IconX } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { KeyResultGuidanceIcon } from "./KeyResultGuidance";
import {
  ObjectiveCardV2,
  type ObjectiveCardKeyResult,
  type ObjectiveCardObjective,
} from "./ObjectiveCardV2";
import { statusToConfidence } from "../utils/okrDashboardUtils";

const unitOptions = [
  { value: "percent", label: "Percentage (%)" },
  { value: "count", label: "Count (#)" },
  { value: "currency", label: "Currency ($)" },
  { value: "hours", label: "Hours" },
  { value: "custom", label: "Custom" },
];

interface OkrObjectivesViewProps {
  /** Every objective in the page's current scope — codes (O1, O2…) index this. */
  objectives: ObjectiveCardObjective[];
  /** The objectives left after the page's search and filters. */
  visibleObjectives: ObjectiveCardObjective[];
  /** The period the cards pace against; the selected year on All. */
  pacePeriod: string;
  /** Pre-filled into the add-key-result modal; `null` on All. */
  effectivePeriod: string | null;
  onlyMine: boolean;
  isLoading: boolean;
  /** True when a search or filter is narrowing the list. */
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onViewObjective: (objective: ObjectiveCardObjective) => void;
  onViewKeyResult: (keyResult: ObjectiveCardKeyResult) => void;
  onEditKeyResult: (keyResult: ObjectiveCardKeyResult) => void;
}

/**
 * The OKRs view of the Goals page: each objective as a card with its key
 * results, pace and executing work. Owns what only this rendering needs —
 * which cards are expanded, the add-key-result modal, the at-risk nudge —
 * and nothing about which objectives are in the list: the page shell scopes,
 * filters and hands them in, and opens the drawer and the edit modal.
 */
export function OkrObjectivesView({
  objectives,
  visibleObjectives,
  pacePeriod,
  effectivePeriod,
  onlyMine,
  isLoading,
  hasActiveFilters,
  onClearFilters,
  onViewObjective,
  onViewKeyResult,
  onEditKeyResult,
}: OkrObjectivesViewProps) {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] =
    useDisclosure(false);
  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(
    new Set(),
  );
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const emptyForm = {
    goalId: "",
    title: "",
    description: "",
    targetValue: 100,
    startValue: 0,
    unit: "percent",
    unitLabel: "",
    period: effectivePeriod ?? "",
  };
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, period: effectivePeriod ?? "" }));
  }, [effectivePeriod]);

  const { data: periods } = api.okr.getPeriods.useQuery();
  const { data: availableGoals } = api.okr.getAvailableGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  // O1/O2/… codes stay tied to the objective's position in the period's full
  // list, so filtering never renumbers a card — "O3" keeps meaning the same
  // objective while a filter is applied.
  const objectiveCodes = useMemo(
    () => new Map(objectives.map((o, idx) => [o.id, `O${idx + 1}`])),
    [objectives],
  );

  useEffect(() => {
    if (objectives.length > 0 && expandedObjectives.size === 0) {
      setExpandedObjectives(new Set([objectives[0]!.id]));
    }
  }, [objectives, expandedObjectives.size]);

  const toggleExpand = (objectiveId: number) => {
    setExpandedObjectives((prev) => {
      const next = new Set(prev);
      if (next.has(objectiveId)) next.delete(objectiveId);
      else next.add(objectiveId);
      return next;
    });
  };

  const invalidateOkrs = () => {
    void utils.okr.getByObjective.invalidate();
    void utils.okr.getStats.invalidate();
    void utils.goal.getAllMyGoals.invalidate();
  };

  const createKeyResult = api.okr.create.useMutation({
    onSuccess: () => {
      invalidateOkrs();
      closeCreateModal();
      setFormData(emptyForm);
    },
  });

  const deleteObjective = api.goal.deleteGoal.useMutation({
    onSuccess: () => {
      invalidateOkrs();
      void utils.okr.getAvailableGoals.invalidate();
    },
  });

  const deleteKeyResult = api.okr.delete.useMutation({
    onSuccess: invalidateOkrs,
  });

  const handleCreateKeyResult = () => {
    if (!formData.goalId || !formData.title || !formData.period) return;
    createKeyResult.mutate({
      goalId: parseInt(formData.goalId),
      title: formData.title,
      description: formData.description || undefined,
      targetValue: formData.targetValue,
      startValue: formData.startValue,
      unit: formData.unit as
        | "percent"
        | "count"
        | "currency"
        | "hours"
        | "custom",
      unitLabel: formData.unitLabel || undefined,
      period: formData.period,
      workspaceId: workspaceId ?? undefined,
    });
  };

  const handleDeleteObjective = (id: number) => {
    if (
      confirm(
        "Are you sure you want to delete this objective? This will also delete all associated key results.",
      )
    ) {
      deleteObjective.mutate({ id });
    }
  };

  const handleDeleteKeyResult = (id: string) => {
    if (
      confirm(
        "Are you sure you want to delete this key result? This action cannot be undone.",
      )
    ) {
      deleteKeyResult.mutate({ id });
    }
  };

  const handleAddKeyResultToObjective = (objectiveId: number) => {
    setFormData((prev) => ({ ...prev, goalId: objectiveId.toString() }));
    openCreateModal();
  };

  // Nudge: only when at-risk KRs exist in the (unfiltered) scope.
  const atRiskCount = useMemo(
    () =>
      objectives
        .flatMap((o) => o.keyResults)
        .filter((kr) => {
          const c = statusToConfidence(kr.status);
          return c === "warn" || c === "bad";
        }).length,
    [objectives],
  );
  const showNudge = !nudgeDismissed && atRiskCount > 0;

  if (isLoading) {
    return (
      <Stack gap="lg">
        <Skeleton height={200} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {showNudge && (
        <div
          className="flex items-center gap-3 rounded-lg border px-4 py-3"
          style={{
            background:
              "linear-gradient(90deg, var(--color-brand-subtle), transparent 80%)",
            borderColor: "var(--color-brand-glow)",
          }}
        >
          <div
            className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md"
            style={{
              background: "var(--color-brand-glow)",
              color: "var(--color-brand-primary)",
            }}
          >
            <IconSparkles size={14} />
          </div>
          <div className="flex-1 text-sm text-text-primary">
            <strong className="font-semibold">Zoe noticed:</strong>{" "}
            <span className="text-text-secondary">
              {atRiskCount} KR{atRiskCount === 1 ? " is" : "s are"} off
              expected pace. Consider reviewing blockers in your next check-in.
            </span>
          </div>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label="Dismiss insight"
            onClick={() => setNudgeDismissed(true)}
          >
            <IconX size={14} />
          </ActionIcon>
        </div>
      )}

      {objectives.length > 0 ? (
        visibleObjectives.length === 0 ? (
          <div className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-8 text-center">
            <Text className="text-text-muted">
              No objectives match your search or filters.
            </Text>
            {hasActiveFilters && (
              <Button
                variant="subtle"
                size="compact-sm"
                mt="sm"
                onClick={onClearFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div>
            {visibleObjectives.map((obj) => (
              <div key={obj.id} id={`okr-obj-${obj.id}`}>
                <ObjectiveCardV2
                  objective={obj}
                  code={objectiveCodes.get(obj.id) ?? ""}
                  period={pacePeriod}
                  isExpanded={expandedObjectives.has(obj.id)}
                  onToggleExpand={() => toggleExpand(obj.id)}
                  onDelete={handleDeleteObjective}
                  isDeleting={deleteObjective.isPending}
                  onEditSuccess={invalidateOkrs}
                  onAddKeyResult={handleAddKeyResultToObjective}
                  onEditKeyResult={onEditKeyResult}
                  onDeleteKeyResult={handleDeleteKeyResult}
                  deletingKeyResultId={
                    deleteKeyResult.isPending
                      ? (deleteKeyResult.variables?.id ?? null)
                      : null
                  }
                  onViewObjective={() => onViewObjective(obj)}
                  onViewKeyResult={onViewKeyResult}
                />
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-12 text-center">
          <IconTargetArrow size={48} className="mx-auto mb-4 text-text-muted" />
          <h3 className="mb-2 text-lg font-semibold text-text-primary">
            {onlyMine
              ? "None of this period's OKRs are yours"
              : "No OKRs yet for this period"}
          </h3>
          <Text className="mb-4 text-text-muted">
            {onlyMine
              ? "You're not the DRI on any objective or key result this period. Turn off Mine to see the whole workspace."
              : "Create a new objective, or add a Key Result to an existing one to start tracking progress."}
          </Text>
          <Group justify="center" gap="md">
            <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
              Add Key Result
            </Button>
          </Group>
        </div>
      )}

      {/* Create Key Result Modal */}
      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Add Key Result"
        size="lg"
      >
        <Stack gap="md">
          <Select
            label="Objective (Goal)"
            placeholder="Select a goal"
            data={
              availableGoals?.map((g) => ({
                value: g.id.toString(),
                label: g.title,
              })) ?? []
            }
            value={formData.goalId}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, goalId: value ?? "" }))
            }
            required
          />

          <TextInput
            label={
              <Group gap={4} align="center" component="span" display="inline-flex">
                <span>Key Result Title</span>
                <KeyResultGuidanceIcon />
              </Group>
            }
            placeholder="e.g., Increase revenue by 20%"
            value={formData.title}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, title: e.target.value }))
            }
            required
          />

          <Textarea
            label="Description (optional)"
            placeholder="Add more details about this key result"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
          />

          <Select
            label="Period"
            placeholder="Select a period"
            data={periods ?? []}
            value={formData.period}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, period: value ?? "" }))
            }
            required
          />

          <Group grow>
            <NumberInput
              label="Start Value"
              value={formData.startValue}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  startValue: typeof value === "number" ? value : 0,
                }))
              }
            />
            <NumberInput
              label="Target Value"
              value={formData.targetValue}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  targetValue: typeof value === "number" ? value : 100,
                }))
              }
              required
            />
          </Group>

          <Group grow>
            <Select
              label="Unit"
              data={unitOptions}
              value={formData.unit}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, unit: value ?? "percent" }))
              }
            />
            {formData.unit === "custom" && (
              <TextInput
                label="Custom Unit Label"
                placeholder="e.g., users, deals"
                value={formData.unitLabel}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    unitLabel: e.target.value,
                  }))
                }
              />
            )}
          </Group>

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateKeyResult}
              loading={createKeyResult.isPending}
              disabled={!formData.goalId || !formData.title || !formData.period}
            >
              Create Key Result
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
