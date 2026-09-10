"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { CeremonyKind } from "@prisma/client";
import { api, type RouterOutputs } from "~/trpc/react";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { CadencePicker } from "./CadencePicker";
import { DEFAULT_CADENCE, buildCadenceRule } from "~/lib/ceremonies/cadence";
import {
  AGENDA_SECTION_TYPES,
  type AgendaSectionTemplate,
  type AgendaSectionType,
  type CeremonyTemplate,
} from "~/server/services/ceremonies/templates";

type CeremonyDetail = RouterOutputs["ceremony"]["get"];

export const CEREMONY_KIND_LABELS: Record<CeremonyKind, string> = {
  STANDUP: "Standup",
  PLANNING: "Planning",
  REVIEW: "Review",
  RETROSPECTIVE: "Retrospective",
  PRIORITISATION: "Prioritisation",
  ALL_HANDS: "All hands",
  ONE_ON_ONE: "1:1",
  CUSTOM: "Custom",
};

interface FormState {
  name: string;
  kind: CeremonyKind;
  aliases: string[];
  purpose: string;
  notFor: string;
  inputs: string;
  outputs: string;
  cadenceRule: string;
  timezone: string;
  startsOn: Date | null;
  durationMinutes: number;
  leadTimeHours: number;
  ownerId: string | null;
  participantUserIds: string[];
  productId: string | null;
  teamId: string | null;
  projectId: string | null;
  agendaTemplate: AgendaSectionTemplate[];
  isActive: boolean;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function emptyForm(): FormState {
  return {
    name: "",
    kind: "CUSTOM",
    aliases: [],
    purpose: "",
    notFor: "",
    inputs: "",
    outputs: "",
    cadenceRule: buildCadenceRule(DEFAULT_CADENCE),
    timezone: browserTimezone(),
    startsOn: new Date(),
    durationMinutes: 30,
    leadTimeHours: 24,
    ownerId: null,
    participantUserIds: [],
    productId: null,
    teamId: null,
    projectId: null,
    agendaTemplate: [],
    isActive: true,
  };
}

function fromTemplate(t: CeremonyTemplate): FormState {
  return {
    ...emptyForm(),
    name: t.name,
    kind: t.kind,
    aliases: [...t.aliases],
    purpose: t.purpose,
    notFor: t.notFor,
    inputs: t.inputs,
    outputs: t.outputs,
    cadenceRule: t.cadenceRule,
    durationMinutes: t.durationMinutes,
    leadTimeHours: t.leadTimeHours,
    agendaTemplate: t.agendaTemplate.map((s) => ({ ...s })),
  };
}

function readAgendaTemplate(value: unknown): AgendaSectionTemplate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const o = raw as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.type !== "string" || typeof o.title !== "string") return [];
    return [
      {
        key: o.key,
        type: o.type as AgendaSectionType,
        title: o.title,
        minutes: typeof o.minutes === "number" ? o.minutes : undefined,
        config: o.config && typeof o.config === "object" ? (o.config as Record<string, unknown>) : undefined,
      },
    ];
  });
}

function fromCeremony(c: CeremonyDetail): FormState {
  return {
    name: c.name,
    kind: c.kind,
    aliases: [...c.aliases],
    purpose: c.purpose ?? "",
    notFor: c.notFor ?? "",
    inputs: c.inputs ?? "",
    outputs: c.outputs ?? "",
    cadenceRule: c.cadenceRule,
    timezone: c.timezone,
    startsOn: new Date(c.startsOn),
    durationMinutes: c.durationMinutes,
    leadTimeHours: c.leadTimeHours,
    ownerId: c.ownerId,
    participantUserIds: c.participants.map((p) => p.userId),
    productId: c.productId,
    teamId: c.teamId,
    projectId: c.projectId,
    agendaTemplate: readAgendaTemplate(c.agendaTemplate),
    isActive: c.isActive,
  };
}

interface CeremonyEditorModalProps {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Edit an existing ceremony (fetched by id) … */
  ceremonyId?: string | null;
  /** … or start a new one from a template. */
  template?: CeremonyTemplate | null;
  onSaved?: () => void;
}

/**
 * Create / edit a ceremony definition (ADR-0059). Prose fields are Markdown
 * through `MarkdownInput`; cadence through the structured picker; owner and
 * participants from the workspace's members.
 */
export function CeremonyEditorModal({
  opened,
  onClose,
  workspaceId,
  ceremonyId = null,
  template = null,
  onSaved,
}: CeremonyEditorModalProps) {
  const utils = api.useUtils();
  const isEdit = Boolean(ceremonyId);

  const { data: existing, isLoading: loadingExisting } = api.ceremony.get.useQuery(
    { workspaceId, id: ceremonyId ?? "" },
    { enabled: opened && Boolean(ceremonyId) },
  );
  const { data: members = [] } = api.workspace.listMembers.useQuery({ workspaceId }, { enabled: opened });
  const { data: products = [] } = api.product.product.list.useQuery({ workspaceId }, { enabled: opened });
  const { data: projects = [] } = api.project.getAll.useQuery({ workspaceId }, { enabled: opened });
  const { data: teams = [] } = api.team.list.useQuery(undefined, { enabled: opened });

  const [form, setForm] = useState<FormState>(emptyForm);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!opened) {
      setSeededFor(null);
      return;
    }
    const seedKey = ceremonyId ? `edit:${ceremonyId}` : `new:${template?.slug ?? "blank"}`;
    if (seededFor === seedKey) return;
    if (ceremonyId) {
      if (existing) {
        setForm(fromCeremony(existing));
        setSeededFor(seedKey);
      }
      return;
    }
    setForm(template ? fromTemplate(template) : emptyForm());
    setSeededFor(seedKey);
  }, [opened, ceremonyId, template, existing, seededFor]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC"];
    }
  }, []);

  const memberOptions = useMemo(
    () => members.map((m) => ({ value: m.id, label: m.name ?? m.email ?? m.id })),
    [members],
  );
  const workspaceTeams = useMemo(
    () => teams.filter((t) => (t as { workspaceId?: string | null }).workspaceId === workspaceId),
    [teams, workspaceId],
  );

  const onDone = async () => {
    await Promise.all([utils.ceremony.list.invalidate(), utils.ceremony.get.invalidate()]);
    onSaved?.();
    onClose();
  };
  const create = api.ceremony.create.useMutation({
    onSuccess: async (res) => {
      notifications.show({
        title: "Ceremony created",
        message:
          res.occurrencesCreated > 0
            ? `${res.ceremony.name} is set up with ${res.occurrencesCreated} upcoming occurrence${res.occurrencesCreated === 1 ? "" : "s"}.`
            : `${res.ceremony.name} is set up.`,
        color: "green",
      });
      await onDone();
    },
    onError: (e) => notifications.show({ title: "Couldn't create ceremony", message: e.message, color: "red" }),
  });
  const update = api.ceremony.update.useMutation({
    onSuccess: async () => {
      notifications.show({ title: "Ceremony saved", message: "Changes apply to future occurrences.", color: "green" });
      await onDone();
    },
    onError: (e) => notifications.show({ title: "Couldn't save ceremony", message: e.message, color: "red" }),
  });
  const saving = create.isPending || update.isPending;

  const canSave = form.name.trim().length > 0 && form.cadenceRule.trim().length > 0 && form.startsOn !== null;

  const submit = () => {
    if (!canSave || !form.startsOn) return;
    const payload = {
      workspaceId,
      name: form.name.trim(),
      kind: form.kind,
      aliases: form.aliases,
      purpose: form.purpose || null,
      notFor: form.notFor || null,
      inputs: form.inputs || null,
      outputs: form.outputs || null,
      cadenceRule: form.cadenceRule.trim(),
      timezone: form.timezone,
      startsOn: form.startsOn,
      durationMinutes: form.durationMinutes,
      leadTimeHours: form.leadTimeHours,
      ownerId: form.ownerId ?? undefined,
      participantUserIds: form.participantUserIds,
      productId: form.productId,
      teamId: form.teamId,
      projectId: form.projectId,
      agendaTemplate: form.agendaTemplate,
    };
    if (ceremonyId) update.mutate({ ...payload, id: ceremonyId, isActive: form.isActive });
    else create.mutate(payload);
  };

  const updateSection = (index: number, patch: Partial<AgendaSectionTemplate>) =>
    set(
      "agendaTemplate",
      form.agendaTemplate.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  const addSection = () =>
    set("agendaTemplate", [
      ...form.agendaTemplate,
      { key: `section_${form.agendaTemplate.length + 1}_${Date.now().toString(36)}`, type: "free_text", title: "", minutes: 10 },
    ]);
  const removeSection = (index: number) =>
    set(
      "agendaTemplate",
      form.agendaTemplate.filter((_, i) => i !== index),
    );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? "Edit ceremony" : template ? `New ceremony from “${template.name}”` : "New ceremony"}
      size="xl"
      centered
    >
      {isEdit && loadingExisting ? (
        <Text size="sm" className="text-text-muted">
          Loading…
        </Text>
      ) : (
        <Stack gap="md">
          <Group grow align="flex-start">
            <TextInput
              label="Name"
              required
              value={form.name}
              onChange={(e) => set("name", e.currentTarget.value)}
              data-testid="ceremony-name"
            />
            <Select
              label="Kind"
              data={Object.values(CeremonyKind).map((k) => ({ value: k, label: CEREMONY_KIND_LABELS[k] }))}
              value={form.kind}
              onChange={(v) => v && set("kind", v as CeremonyKind)}
              allowDeselect={false}
            />
          </Group>
          <TagsInput
            label="Title aliases"
            description="Calendar or recording titles that match these attach automatically."
            value={form.aliases}
            onChange={(v) => set("aliases", v)}
            placeholder="Add an alias and press Enter"
          />

          <CadencePicker value={form.cadenceRule} onChange={(rule) => set("cadenceRule", rule)} />
          <Group grow align="flex-start">
            <Select
              label="Time zone"
              data={timezones}
              value={form.timezone}
              onChange={(v) => v && set("timezone", v)}
              searchable
              allowDeselect={false}
            />
            <DateInput
              label="Starts on"
              description="The rule is anchored here; earlier dates never get occurrences."
              value={form.startsOn}
              onChange={(v) => set("startsOn", v ? new Date(v) : null)}
              valueFormat="D MMM YYYY"
              popoverProps={{ withinPortal: true }}
            />
            <NumberInput
              label="Duration (min)"
              min={5}
              max={24 * 60}
              value={form.durationMinutes}
              onChange={(v) => set("durationMinutes", typeof v === "number" ? v : 30)}
            />
            <NumberInput
              label="Agenda lead time (h)"
              description="Hours before the start to generate and circulate the agenda."
              min={0}
              max={24 * 14}
              value={form.leadTimeHours}
              onChange={(v) => set("leadTimeHours", typeof v === "number" ? v : 24)}
            />
          </Group>

          <Group grow align="flex-start">
            <Select
              label="Owner"
              data={memberOptions}
              value={form.ownerId}
              onChange={(v) => set("ownerId", v)}
              placeholder="Defaults to you"
              searchable
              clearable
            />
            <MultiSelect
              label="Participants"
              description="Workspace members. Pick a team below to include everyone on it."
              data={memberOptions}
              value={form.participantUserIds}
              onChange={(v) => set("participantUserIds", v)}
              searchable
              clearable
            />
          </Group>
          <Group grow align="flex-start">
            <Select
              label="Team"
              data={workspaceTeams.map((t) => ({ value: t.id, label: t.name }))}
              value={form.teamId}
              onChange={(v) => set("teamId", v)}
              placeholder="Optional"
              clearable
              searchable
            />
            <Select
              label="Product"
              data={products.map((p) => ({ value: p.id, label: p.name }))}
              value={form.productId}
              onChange={(v) => set("productId", v)}
              placeholder="Optional"
              clearable
              searchable
            />
            <Select
              label="Project"
              data={projects.map((p) => ({ value: p.id, label: p.name }))}
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              placeholder="Optional"
              clearable
              searchable
            />
          </Group>

          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Purpose
            </Text>
            <MarkdownInput value={form.purpose} onChange={(v) => set("purpose", v)} placeholder="Why this meeting exists" minRows={2} />
          </Stack>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Not for
            </Text>
            <MarkdownInput value={form.notFor} onChange={(v) => set("notFor", v)} placeholder="What gets parked for another ceremony" minRows={2} />
          </Stack>
          <Group grow align="flex-start">
            <Stack gap={6}>
              <Text size="sm" fw={500}>
                Inputs
              </Text>
              <MarkdownInput value={form.inputs} onChange={(v) => set("inputs", v)} placeholder="What must exist before it starts" minRows={2} />
            </Stack>
            <Stack gap={6}>
              <Text size="sm" fw={500}>
                Outputs
              </Text>
              <MarkdownInput value={form.outputs} onChange={(v) => set("outputs", v)} placeholder="What it must produce" minRows={2} />
            </Stack>
          </Group>

          <Stack gap={6}>
            <Group justify="space-between">
              <div>
                <Text size="sm" fw={500}>
                  Agenda template
                </Text>
                <Text size="xs" className="text-text-muted">
                  Typed sections in running order. Each type binds to a query over workspace data when agendas are generated.
                </Text>
              </div>
              <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={addSection}>
                Add section
              </Button>
            </Group>
            {form.agendaTemplate.length === 0 && (
              <Text size="xs" className="text-text-muted">
                No sections yet.
              </Text>
            )}
            {form.agendaTemplate.map((section, index) => (
              <Group key={section.key} gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  label={index === 0 ? "Title" : undefined}
                  value={section.title}
                  onChange={(e) => updateSection(index, { title: e.currentTarget.value })}
                  size="xs"
                  style={{ flex: 1 }}
                />
                <Select
                  label={index === 0 ? "Type" : undefined}
                  data={AGENDA_SECTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  value={section.type}
                  onChange={(v) => v && updateSection(index, { type: v as AgendaSectionType })}
                  allowDeselect={false}
                  size="xs"
                  w={180}
                />
                <NumberInput
                  label={index === 0 ? "Min" : undefined}
                  value={section.minutes ?? 0}
                  min={0}
                  onChange={(v) => updateSection(index, { minutes: typeof v === "number" ? v : 0 })}
                  size="xs"
                  w={80}
                />
                <ActionIcon variant="subtle" color="gray" aria-label="Remove section" onClick={() => removeSection(index)}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>

          {isEdit && (
            <Switch
              label="Active"
              description="Inactive ceremonies stop generating occurrences and are hidden from pickers."
              checked={form.isActive}
              onChange={(e) => set("isActive", e.currentTarget.checked)}
            />
          )}

          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving} disabled={!canSave} data-testid="ceremony-save">
              {isEdit ? "Save changes" : "Create ceremony"}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
