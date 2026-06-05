"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Popover,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAffiliate,
  IconDots,
  IconLayoutKanban,
  IconPlus,
  IconTable,
  IconTargetArrow,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { ProblemKanbanBoard } from "~/app/_components/product/ProblemKanbanBoard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type ProblemStage = "IDEA" | "QUALIFIED" | "PRIORITISED";

const STAGE_OPTIONS: ReadonlyArray<{ value: ProblemStage; label: string }> = [
  { value: "IDEA", label: "Idea" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PRIORITISED", label: "Prioritised" },
];

const STAGE_COLORS: Record<ProblemStage, string> = {
  IDEA: "gray",
  QUALIFIED: "blue",
  PRIORITISED: "green",
};

// impact/confidence are scored 1–5 (the two prioritisation axes).
const SCORE_OPTIONS = ["1", "2", "3", "4", "5"].map((v) => ({
  value: v,
  label: v,
}));

// ---------------------------------------------------------------------------
// Inline-edit cells
// ---------------------------------------------------------------------------

/** Single-line text cell that becomes an input on click and commits on blur/Enter. */
function EditableText({
  value,
  placeholder,
  required,
  onCommit,
}: {
  value: string | null;
  placeholder: string;
  required?: boolean;
  onCommit: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (required && trimmed.length === 0) return; // revert — title can't be empty
    const next = trimmed.length === 0 ? null : trimmed;
    if (next !== (value ?? null)) onCommit(next);
  };

  if (editing) {
    return (
      <TextInput
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        size="xs"
        styles={{ input: { height: 28, minHeight: 28, fontSize: "0.8rem" } }}
      />
    );
  }

  return (
    <Text
      size="sm"
      className={`cursor-text ${value ? "text-text-primary" : "text-text-muted"}`}
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
    >
      {value ?? placeholder}
    </Text>
  );
}

/** Multi-line text cell (description / evidence) editable in a small textarea. */
function EditableMultiline({
  value,
  placeholder,
  onCommit,
}: {
  value: string | null;
  placeholder: string;
  onCommit: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed.length === 0 ? null : trimmed;
    if (next !== (value ?? null)) onCommit(next);
  };

  if (editing) {
    return (
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        autosize
        minRows={1}
        maxRows={5}
        size="xs"
        styles={{ input: { fontSize: "0.8rem" } }}
      />
    );
  }

  return (
    <Text
      size="xs"
      lineClamp={2}
      className={`cursor-text ${value ? "text-text-secondary" : "text-text-muted"}`}
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
    >
      {value ?? placeholder}
    </Text>
  );
}

/** Score cell (1–5) backed by a clearable select. */
function ScoreCell({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
}) {
  return (
    <Select
      value={value != null ? String(value) : null}
      onChange={(v) => onCommit(v != null ? Number(v) : null)}
      data={SCORE_OPTIONS}
      placeholder="—"
      clearable
      size="xs"
      comboboxProps={{ withinPortal: true }}
      styles={{
        root: { width: 64 },
        input: { height: 28, minHeight: 28, fontSize: "0.8rem" },
      }}
    />
  );
}

/**
 * Inline Approaches editor — the Projects (Approaches) linked to a Problem,
 * rendered as chips with a Notion-relation-style multi-select picker. Options
 * are scoped to the product's own Projects. Forward direction only (v1).
 */
function ApproachesEditor({
  problemId,
  productId,
  currentApproaches,
}: {
  problemId: string;
  productId: string;
  currentApproaches: Array<{ project: { id: string; name: string } }>;
}) {
  const utils = api.useUtils();
  const [opened, setOpened] = useState(false);
  const [selected, setSelected] = useState<string[]>(
    currentApproaches.map((a) => a.project.id),
  );

  const { data: projects } = api.product.problem.productProjects.useQuery(
    { productId },
    { enabled: opened },
  );

  const setProjects = api.product.problem.setProjects.useMutation({
    onSuccess: async () => {
      await utils.product.problem.list.invalidate({ productId });
    },
  });

  const hasApproaches = currentApproaches.length > 0;

  return (
    <Popover
      position="bottom-start"
      withinPortal
      shadow="md"
      opened={opened}
      onChange={(next) => {
        setOpened(next);
        if (next) setSelected(currentApproaches.map((a) => a.project.id));
      }}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          className="inline-flex flex-wrap items-center gap-1 text-text-muted hover:text-text-primary transition-colors"
        >
          {hasApproaches ? (
            currentApproaches.map((a) => (
              <Badge key={a.project.id} size="xs" variant="light" color="indigo">
                {a.project.name}
              </Badge>
            ))
          ) : (
            <span className="inline-flex items-center gap-1">
              <IconAffiliate size={12} />
              <Text size="xs">Add approach</Text>
            </span>
          )}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown
        styles={{
          dropdown: {
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            minWidth: 260,
          },
        }}
      >
        <MultiSelect
          autoFocus
          value={selected}
          onChange={(next) => {
            setSelected(next);
            setProjects.mutate({ problemId, projectIds: next });
          }}
          data={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          searchable
          clearable
          size="xs"
          placeholder="Search projects..."
          comboboxProps={{ withinPortal: true }}
          nothingFoundMessage="No projects in this product yet"
        />
      </Popover.Dropdown>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

function CreateProblemModal({
  opened,
  onClose,
  productId,
}: {
  opened: boolean;
  onClose: () => void;
  productId: string;
}) {
  const utils = api.useUtils();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [category, setCategory] = useState("");
  const [impact, setImpact] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [stage, setStage] = useState<ProblemStage>("IDEA");

  const reset = () => {
    setTitle("");
    setDescription("");
    setEvidence("");
    setCategory("");
    setImpact(null);
    setConfidence(null);
    setStage("IDEA");
  };

  const create = api.product.problem.create.useMutation({
    onSuccess: async () => {
      await utils.product.problem.list.invalidate({ productId });
      reset();
      onClose();
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="New problem" size="lg">
      <Stack gap="md">
        <TextInput
          label="Problem statement"
          placeholder="Who's hurt and how?"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          size="sm"
          required
        />
        <Textarea
          label="Description"
          placeholder="More detail on the problem..."
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={6}
          size="sm"
        />
        <Textarea
          label="Evidence"
          placeholder="A count, a quote, an incident, a screenshot link..."
          value={evidence}
          onChange={(e) => setEvidence(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={6}
          size="sm"
        />
        <TextInput
          label="Category"
          placeholder="e.g. Data Scarcity, Pipeline problems"
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value)}
          size="sm"
        />
        <Group grow>
          <Select
            label="Impact"
            value={impact}
            onChange={setImpact}
            data={SCORE_OPTIONS}
            placeholder="1–5"
            clearable
            size="sm"
            comboboxProps={{ withinPortal: true }}
          />
          <Select
            label="Confidence"
            value={confidence}
            onChange={setConfidence}
            data={SCORE_OPTIONS}
            placeholder="1–5"
            clearable
            size="sm"
            comboboxProps={{ withinPortal: true }}
          />
          <Select
            label="Stage"
            value={stage}
            onChange={(v) => v && setStage(v as ProblemStage)}
            data={STAGE_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
            size="sm"
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              create.mutate({
                productId,
                title: title.trim(),
                description: description.trim() || undefined,
                evidence: evidence.trim() || undefined,
                category: category.trim() || undefined,
                impact: impact != null ? Number(impact) : undefined,
                confidence: confidence != null ? Number(confidence) : undefined,
                stage,
              })
            }
            loading={create.isPending}
            disabled={!title.trim()}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProblemsPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [modalOpened, setModalOpened] = useState(false);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "board">("table");

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: problems, isLoading } = api.product.problem.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const utils = api.useUtils();

  const update = api.product.problem.update.useMutation({
    onSuccess: async () => {
      if (product?.id)
        await utils.product.problem.list.invalidate({ productId: product.id });
    },
  });

  const deleteProblem = api.product.problem.delete.useMutation({
    onSuccess: async () => {
      if (product?.id)
        await utils.product.problem.list.invalidate({ productId: product.id });
    },
  });

  // Distinct categories present in the data, for the category filter.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of problems ?? []) {
      if (p.category) set.add(p.category);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [problems]);

  const filtered = useMemo(() => {
    if (!problems) return [];
    let list = [...problems];
    if (stageFilter) list = list.filter((p) => p.stage === stageFilter);
    if (categoryFilter)
      list = list.filter((p) => p.category === categoryFilter);
    return list;
  }, [problems, stageFilter, categoryFilter]);

  // The board groups by stage in its lanes, so the stage filter doesn't apply
  // there — only the category filter narrows the board.
  const boardProblems = useMemo(() => {
    if (!problems) return [];
    return categoryFilter
      ? problems.filter((p) => p.category === categoryFilter)
      : problems;
  }, [problems, categoryFilter]);

  const handleDelete = (id: string, title: string) => {
    modals.openConfirmModal({
      title: "Delete problem",
      children: (
        <Text size="sm">Delete &quot;{title}&quot;? This cannot be undone.</Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteProblem.mutate({ id }),
    });
  };

  if (!workspace) return null;

  return (
    <Stack gap="sm">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as "table" | "board")}
          data={[
            {
              value: "table",
              label: (
                <Group gap={4} wrap="nowrap">
                  <IconTable size={14} />
                  <span>Table</span>
                </Group>
              ),
            },
            {
              value: "board",
              label: (
                <Group gap={4} wrap="nowrap">
                  <IconLayoutKanban size={14} />
                  <span>Board</span>
                </Group>
              ),
            },
          ]}
        />

        {view === "table" && (
          <Select
            value={stageFilter}
            onChange={setStageFilter}
            data={STAGE_OPTIONS.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
            placeholder="Stage"
            size="xs"
            clearable
            comboboxProps={{ withinPortal: true }}
            styles={{
              root: { width: 140 },
              input: { height: 30, minHeight: 30, fontSize: "0.8rem" },
            }}
          />
        )}

        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          data={categories.map((c) => ({ value: c, label: c }))}
          placeholder="Category"
          size="xs"
          clearable
          disabled={categories.length === 0}
          comboboxProps={{ withinPortal: true }}
          styles={{
            root: { width: 160 },
            input: { height: 30, minHeight: 30, fontSize: "0.8rem" },
          }}
        />

        <div className="flex-1" />

        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => setModalOpened(true)}
          disabled={!product}
          variant="light"
          styles={{ root: { height: 30 } }}
        >
          New problem
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={48} />
          ))}
        </Stack>
      ) : view === "board" ? (
        product && problems && problems.length > 0 ? (
          <ProblemKanbanBoard
            problems={boardProblems}
            productId={product.id}
          />
        ) : (
          <EmptyState
            icon={IconTargetArrow}
            message="No problems yet. Capture validated issues worth solving — who's hurt and how, backed by evidence."
            action={
              <Button
                onClick={() => setModalOpened(true)}
                leftSection={<IconPlus size={16} />}
                color="brand"
                disabled={!product}
              >
                New problem
              </Button>
            }
          />
        )
      ) : filtered.length > 0 ? (
        <div className="border border-border-primary rounded-lg overflow-x-auto">
          <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 240 }}>Problem</Table.Th>
                <Table.Th style={{ minWidth: 200 }}>Description</Table.Th>
                <Table.Th style={{ minWidth: 200 }}>Evidence</Table.Th>
                <Table.Th style={{ minWidth: 120 }}>Category</Table.Th>
                <Table.Th style={{ minWidth: 160 }}>Approaches</Table.Th>
                <Table.Th>Impact</Table.Th>
                <Table.Th>Conf.</Table.Th>
                <Table.Th style={{ minWidth: 130 }}>Stage</Table.Th>
                <Table.Th style={{ width: 80 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((problem) => (
                <Table.Tr key={problem.id}>
                  <Table.Td>
                    <EditableText
                      value={problem.title}
                      placeholder="Untitled"
                      required
                      onCommit={(next) =>
                        next != null &&
                        update.mutate({ id: problem.id, title: next })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <EditableMultiline
                      value={problem.description}
                      placeholder="Add description"
                      onCommit={(next) =>
                        update.mutate({ id: problem.id, description: next })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <EditableMultiline
                      value={problem.evidence}
                      placeholder="Add evidence"
                      onCommit={(next) =>
                        update.mutate({ id: problem.id, evidence: next })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <EditableText
                      value={problem.category}
                      placeholder="—"
                      onCommit={(next) =>
                        update.mutate({ id: problem.id, category: next })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    {product && (
                      <ApproachesEditor
                        problemId={problem.id}
                        productId={product.id}
                        currentApproaches={problem.approaches}
                      />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <ScoreCell
                      value={problem.impact}
                      onCommit={(next) =>
                        update.mutate({ id: problem.id, impact: next })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <ScoreCell
                      value={problem.confidence}
                      onCommit={(next) =>
                        update.mutate({ id: problem.id, confidence: next })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      value={problem.stage}
                      onChange={(v) =>
                        v &&
                        update.mutate({
                          id: problem.id,
                          stage: v as ProblemStage,
                        })
                      }
                      data={STAGE_OPTIONS.map((s) => ({
                        value: s.value,
                        label: s.label,
                      }))}
                      size="xs"
                      comboboxProps={{ withinPortal: true }}
                      renderOption={({ option }) => (
                        <Badge
                          size="sm"
                          variant="light"
                          color={STAGE_COLORS[option.value as ProblemStage]}
                        >
                          {option.label}
                        </Badge>
                      )}
                      styles={{
                        root: { width: 130 },
                        input: {
                          height: 28,
                          minHeight: 28,
                          fontSize: "0.8rem",
                        },
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <Avatar
                        size="xs"
                        radius="xl"
                        src={problem.createdBy?.image}
                      >
                        {(problem.createdBy?.name ?? "?")[0]?.toUpperCase()}
                      </Avatar>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            size="xs"
                            className="text-text-muted"
                          >
                            <IconDots size={14} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={() =>
                              handleDelete(problem.id, problem.title)
                            }
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      ) : problems && problems.length > 0 ? (
        <Text size="sm" className="text-text-muted py-8 text-center">
          No problems match your filters.
        </Text>
      ) : (
        <EmptyState
          icon={IconTargetArrow}
          message="No problems yet. Capture validated issues worth solving — who's hurt and how, backed by evidence."
          action={
            <Button
              onClick={() => setModalOpened(true)}
              leftSection={<IconPlus size={16} />}
              color="brand"
              disabled={!product}
            >
              New problem
            </Button>
          }
        />
      )}

      {product && (
        <CreateProblemModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          productId={product.id}
        />
      )}
    </Stack>
  );
}
