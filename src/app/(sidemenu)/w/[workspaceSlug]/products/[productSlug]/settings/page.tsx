"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Select,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Reusable setting row: label+description left, control right
// ---------------------------------------------------------------------------

function SettingRow({
  label,
  description,
  children,
  noBorder,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 py-4 px-5 ${
        noBorder ? "" : "border-b border-border-primary"
      }`}
    >
      <div className="flex-1 min-w-0">
        <Text size="sm" fw={600} className="text-text-primary">
          {label}
        </Text>
        {description && (
          <Text size="xs" className="text-text-muted mt-0.5">
            {description}
          </Text>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary overflow-hidden">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket stage config row
// ---------------------------------------------------------------------------

const TICKET_STATUSES = ["Backlog", "Todo", "In progress", "In review", "Done", "Cancelled"];
const EPIC_STATUSES = ["Open", "In progress", "Done", "Cancelled"];
const CYCLE_STATUSES = ["Planned", "Active", "Completed", "Archived"];
const FEATURE_STATUSES = ["Idea", "Defined", "In progress", "Shipped", "Archived"];

function StageRow({
  label,
  description,
  stages,
  noBorder,
}: {
  label: string;
  description: string;
  stages: string[];
  noBorder?: boolean;
}) {
  return (
    <div
      className={`py-4 px-5 ${noBorder ? "" : "border-b border-border-primary"}`}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <Text size="sm" fw={600} className="text-text-primary">
            {label}
          </Text>
          <Text size="xs" className="text-text-muted mt-0.5">
            {description}
          </Text>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {stages.map((s) => (
          <span
            key={s}
            className="rounded-full border border-border-primary px-2.5 py-0.5 text-xs text-text-secondary"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CYCLE_DURATION_OPTIONS = [
  { value: "1", label: "1 week" },
  { value: "2", label: "2 weeks" },
  { value: "3", label: "3 weeks" },
  { value: "4", label: "4 weeks" },
  { value: "6", label: "6 weeks" },
];

export default function ProductSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enableCycles, setEnableCycles] = useState(true);
  const [cycleDuration, setCycleDuration] = useState("2");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description ?? "");
    }
  }, [product]);

  const updateProduct = api.product.product.update.useMutation({
    onSuccess: async () => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
        await utils.product.product.getBySlug.invalidate({
          workspaceId,
          slug: productSlug,
        });
      }
    },
    onError: (err) => setError(err.message),
  });

  const deleteProduct = api.product.product.delete.useMutation({
    onSuccess: async () => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products`);
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!product || !workspace) return null;

  const onSave = () => {
    setError(null);
    updateProduct.mutate({
      id: product.id,
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete product",
      children: (
        <Text size="sm">
          This will permanently delete the product and all of its features,
          tickets, research, and retrospectives. This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteProduct.mutate({ id: product.id }),
    });
  };

  const backPath = `/w/${workspace.slug}/products/${productSlug}`;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <Link
        href={backPath}
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-4"
      >
        <IconArrowLeft size={16} />
        Back to {product.name}
      </Link>
      <Title order={2} className="text-text-primary mb-8">
        Settings
      </Title>

      {/* ── General ── */}
      <Title order={4} className="text-text-primary mb-3">
        General
      </Title>
      <SectionCard>
        <SettingRow label="Name" description="The display name for this product.">
          <TextInput
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            size="xs"
            maxLength={120}
            styles={{ input: { width: 200, textAlign: "right" } }}
          />
        </SettingRow>
        <SettingRow
          label="Description"
          description="A short summary shown on the product overview."
          noBorder
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            size="xs"
            autosize
            minRows={1}
            maxRows={3}
            maxLength={2000}
            styles={{ input: { width: 200, textAlign: "right" } }}
          />
        </SettingRow>
      </SectionCard>

      {error && (
        <Text size="sm" c="red" mt="xs">
          {error}
        </Text>
      )}

      <div className="flex justify-end mt-3 mb-10">
        <Button
          size="xs"
          color="brand"
          onClick={onSave}
          loading={updateProduct.isPending}
          disabled={!name.trim()}
        >
          Save changes
        </Button>
      </div>

      {/* ── Delivery Flow ── */}
      <Title order={4} className="text-text-primary mb-3">
        Delivery Flow
      </Title>

      {/* Cycles */}
      <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
        Cycles
      </Text>
      <SectionCard>
        <SettingRow
          label="Enable cycles"
          description="Time-boxed iterations to group and track tickets."
        >
          <Switch
            checked={enableCycles}
            onChange={(e) => setEnableCycles(e.currentTarget.checked)}
            size="sm"
          />
        </SettingRow>
        {enableCycles && (
          <SettingRow
            label="Cycle duration"
            description="Default length for new cycles."
            noBorder
          >
            <Select
              value={cycleDuration}
              onChange={(v) => v && setCycleDuration(v)}
              data={CYCLE_DURATION_OPTIONS}
              size="xs"
              comboboxProps={{ withinPortal: true }}
              styles={{ input: { width: 120, textAlign: "right" } }}
            />
          </SettingRow>
        )}
      </SectionCard>

      {/* Stages */}
      <Text
        size="xs"
        fw={600}
        className="text-text-muted uppercase tracking-wider mb-2 mt-6"
      >
        Stages
      </Text>
      <SectionCard>
        <StageRow
          label="Tickets"
          description="Workflow stages for tickets."
          stages={TICKET_STATUSES}
        />
        <StageRow
          label="Epics"
          description="Lifecycle stages for epics."
          stages={EPIC_STATUSES}
        />
        <StageRow
          label="Cycles"
          description="Lifecycle stages for cycles."
          stages={CYCLE_STATUSES}
        />
        <StageRow
          label="Features"
          description="Lifecycle stages for features."
          stages={FEATURE_STATUSES}
          noBorder
        />
      </SectionCard>

      {/* ── Danger Zone ── */}
      <Title order={4} className="text-text-primary mb-3 mt-10">
        Danger zone
      </Title>
      <div className="rounded-lg border border-red-500/40 bg-surface-secondary overflow-hidden">
        <SettingRow
          label="Delete this product"
          description="Permanently removes all features, tickets, research, and retrospectives."
          noBorder
        >
          <Button
            color="red"
            variant="outline"
            size="xs"
            onClick={onDelete}
            loading={deleteProduct.isPending}
          >
            Delete
          </Button>
        </SettingRow>
      </div>

      <div className="h-16" />
    </div>
  );
}
