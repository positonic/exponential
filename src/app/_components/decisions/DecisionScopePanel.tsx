"use client";

import { useState } from "react";
import { Anchor, Button, Group, Select, Stack, Text, Title } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { api } from "~/trpc/react";

/**
 * Scope and formalisation of one Decision (ADR-0060): the product,
 * project, objective and key result it belongs to, and the ADR it was
 * formalised as. Read rows for everyone; editors get inline selects that
 * save through decision.update.
 */

interface DecisionScopePanelProps {
  workspaceId: string;
  workspaceSlug: string;
  decision: {
    id: string;
    productId: string | null;
    projectId: string | null;
    goalId: number | null;
    keyResultId: string | null;
    adrDocumentId: string | null;
    product: { id: string; name: string; slug: string } | null;
    project: { id: string; name: string; slug: string } | null;
    goal: { id: number; title: string } | null;
    keyResult: { id: string; title: string } | null;
    adrDocument: { id: string; number: number | null; title: string } | null;
  };
  canEdit: boolean;
}

const NONE = "__none__";

export function DecisionScopePanel({
  workspaceId,
  workspaceSlug,
  decision,
  canEdit,
}: DecisionScopePanelProps) {
  const utils = api.useUtils();
  const [editing, setEditing] = useState(false);

  const { data: products } = api.product.product.list.useQuery(
    { workspaceId },
    { enabled: editing },
  );
  const { data: projects } = api.project.getAll.useQuery({ workspaceId }, { enabled: editing });
  const { data: goals } = api.goal.getAllMyGoals.useQuery({ workspaceId }, { enabled: editing });
  const { data: goal } = api.goal.getById.useQuery(
    { id: decision.goalId ?? 0 },
    { enabled: editing && decision.goalId !== null },
  );
  const { data: adrs } = api.adr.list.useQuery({ workspaceId }, { enabled: editing });

  const update = api.decision.update.useMutation({
    onSuccess: async () => {
      await utils.decision.get.invalidate({ workspaceId, decisionId: decision.id });
      await utils.decision.list.invalidate();
    },
    onError: (error) =>
      notifications.show({ title: "Couldn't update scope", message: error.message, color: "red" }),
  });

  const save = (patch: Parameters<typeof update.mutate>[0] extends infer T
    ? Omit<T, "workspaceId" | "decisionId">
    : never) => update.mutate({ workspaceId, decisionId: decision.id, ...patch });

  const withNone = (rows: Array<{ value: string; label: string }>) => [
    { value: NONE, label: "—" },
    ...rows,
  ];

  const rows: Array<{ key: string; label: string; value: React.ReactNode }> = [];
  rows.push({
    key: "product",
    label: "Product",
    value: decision.product ? decision.product.name : "Workspace-wide",
  });
  if (decision.project) {
    rows.push({
      key: "project",
      label: "Project",
      value: (
        <Anchor component={Link} href={`/w/${workspaceSlug}/projects/${decision.project.slug}`} size="sm">
          {decision.project.name}
        </Anchor>
      ),
    });
  }
  if (decision.goal) {
    rows.push({
      key: "goal",
      label: "Objective",
      value: (
        <Anchor component={Link} href={`/w/${workspaceSlug}/goals/${decision.goal.id}`} size="sm">
          {decision.goal.title}
        </Anchor>
      ),
    });
  }
  if (decision.keyResult) {
    rows.push({ key: "kr", label: "Key result", value: decision.keyResult.title });
  }
  if (decision.adrDocument) {
    rows.push({
      key: "adr",
      label: "Formalised as",
      value: (
        <Anchor
          component={Link}
          href={`/w/${workspaceSlug}/decisions/${decision.adrDocument.id}`}
          size="sm"
        >
          {decision.adrDocument.title}
        </Anchor>
      ),
    });
  }

  return (
    <Stack gap="xs">
      <Group gap="xs" justify="space-between">
        <Title order={5} className="text-text-secondary">
          Scope
        </Title>
        {canEdit ? (
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<IconPencil size={13} />}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Done" : "Edit scope"}
          </Button>
        ) : null}
      </Group>

      {!editing ? (
        <Stack gap={2}>
          {rows.map((r) => (
            <Text key={r.key} size="sm" className="text-text-secondary">
              {r.label}: {r.value}
            </Text>
          ))}
        </Stack>
      ) : (
        <Group gap="xs" align="flex-end" wrap="wrap">
          <Select
            size="xs"
            w={200}
            label="Product"
            data={withNone((products ?? []).map((p) => ({ value: p.id, label: p.name })))}
            value={decision.productId ?? NONE}
            onChange={(v) => save({ productId: v === NONE ? null : v })}
            searchable
            disabled={update.isPending}
          />
          <Select
            size="xs"
            w={200}
            label="Project"
            data={withNone((projects ?? []).map((p) => ({ value: p.id, label: p.name })))}
            value={decision.projectId ?? NONE}
            onChange={(v) => save({ projectId: v === NONE ? null : v })}
            searchable
            disabled={update.isPending}
          />
          <Select
            size="xs"
            w={220}
            label="Objective"
            data={withNone((goals ?? []).map((g) => ({ value: String(g.id), label: g.title })))}
            value={decision.goalId !== null ? String(decision.goalId) : NONE}
            onChange={(v) =>
              save({ goalId: v === NONE || v === null ? null : Number(v), keyResultId: null })
            }
            searchable
            disabled={update.isPending}
          />
          <Select
            size="xs"
            w={220}
            label="Key result"
            placeholder={decision.goalId === null ? "Pick an objective first" : "Pick a key result"}
            data={withNone((goal?.keyResults ?? []).map((k) => ({ value: k.id, label: k.title })))}
            value={decision.keyResultId ?? NONE}
            onChange={(v) => save({ keyResultId: v === NONE ? null : v })}
            searchable
            disabled={update.isPending || decision.goalId === null}
          />
          <Select
            size="xs"
            w={260}
            label="Formalised as (ADR)"
            data={withNone(
              (adrs ?? []).map((a) => ({
                value: a.id,
                label: `${a.label ?? "ADR"} — ${a.title}`,
              })),
            )}
            value={decision.adrDocumentId ?? NONE}
            onChange={(v) => save({ adrDocumentId: v === NONE ? null : v })}
            searchable
            disabled={update.isPending}
          />
        </Group>
      )}
    </Stack>
  );
}
