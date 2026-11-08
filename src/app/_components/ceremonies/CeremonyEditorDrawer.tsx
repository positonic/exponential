"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Drawer,
  MultiSelect,
  NumberInput,
  Popover,
  ScrollArea,
  Select,
  Skeleton,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import {
  IconCalendarRepeat,
  IconFileDescription,
  IconListDetails,
  IconMicrophone,
  IconPlus,
  IconTrash,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { CeremonyKind } from "@prisma/client";
import { api, type RouterOutputs } from "~/trpc/react";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { PersonPicker } from "~/app/_components/shared/PersonPicker";
import { CadencePicker } from "./CadencePicker";
import { CeremonyIconPicker, CeremonyIconTile } from "./CeremonyIcon";
import { DEFAULT_CADENCE, buildCadenceRule } from "~/lib/ceremonies/cadence";
import { isCeremonyIconKey } from "~/lib/ceremonies/icons";
import { meetingUrlKey } from "~/lib/ceremonies/meetingUrl";
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
  /** Null follows the kind's default icon. */
  icon: string | null;
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
  /** The projects this ceremony reviews (same workspace). */
  projectIds: string[];
  agendaTemplate: AgendaSectionTemplate[];
  /** Append the linked-projects section to every generated agenda. */
  includeProjects: boolean;
  /** Run "Extract outputs" on every recording that attaches to an occurrence. */
  autoExtractOutputs: boolean;
  isActive: boolean;
  /**
   * Whether agendas go to a Matrix room. Not stored: the ceremony posts
   * exactly when it has a room, so Off saves the room as null. The picked
   * room is kept in the form while Off so switching back restores it.
   */
  postToMatrix: boolean;
  matrixRoomId: string | null;
  /** The video room link; "" when none. */
  meetingUrl: string;
}

/** Empty prose is stored as null, never as "". */
function orNull(value: string): string | null {
  return value.trim() === "" ? null : value;
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
    icon: null,
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
    projectIds: [],
    agendaTemplate: [],
    includeProjects: true,
    autoExtractOutputs: false,
    isActive: true,
    postToMatrix: false,
    matrixRoomId: null,
    meetingUrl: "",
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
    icon: c.icon,
    aliases: [...c.aliases],
    purpose: c.purpose ?? "",
    notFor: c.notFor ?? "",
    inputs: c.inputs ?? "",
    outputs: c.outputs ?? "",
    cadenceRule: c.cadenceRule ?? "",
    timezone: c.timezone,
    startsOn: new Date(c.startsOn),
    durationMinutes: c.durationMinutes,
    leadTimeHours: c.leadTimeHours,
    ownerId: c.ownerId,
    participantUserIds: c.participants.map((p) => p.userId),
    productId: c.productId,
    teamId: c.teamId,
    projectIds: c.projects.map((p) => p.projectId),
    agendaTemplate: readAgendaTemplate(c.agendaTemplate),
    includeProjects: c.includeProjects,
    autoExtractOutputs: c.autoExtractOutputs,
    isActive: c.isActive,
    postToMatrix: Boolean(c.matrixRoomId),
    matrixRoomId: c.matrixRoomId,
    meetingUrl: c.meetingUrl ?? "",
  };
}

interface CeremonyEditorDrawerProps {
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
 * participants from the workspace's members. A right-hand drawer, opened from
 * Settings → Ceremonies and from the ceremony page itself.
 */
export function CeremonyEditorDrawer({
  opened,
  onClose,
  workspaceId,
  ceremonyId = null,
  template = null,
  onSaved,
}: CeremonyEditorDrawerProps) {
  const utils = api.useUtils();
  const isEdit = Boolean(ceremonyId);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const { data: existing, error: existingError } = api.ceremony.get.useQuery(
    { workspaceId, id: ceremonyId ?? "" },
    { enabled: opened && Boolean(ceremonyId) },
  );
  const { data: members = [] } = api.workspace.listMembers.useQuery({ workspaceId }, { enabled: opened });
  const { data: products = [] } = api.product.product.list.useQuery({ workspaceId }, { enabled: opened });
  const { data: projects = [] } = api.project.getAll.useQuery({ workspaceId }, { enabled: opened });
  const { data: workspaceTeams = [] } = api.team.list.useQuery({ workspaceId }, { enabled: opened });
  const [form, setForm] = useState<FormState>(emptyForm);
  // Matrix destination (ADR-0059): the workspace's registered servers and the
  // rooms their bots have joined, the same source the summary picker uses.
  const { data: matrixServers = [] } = api.matrixServer.list.useQuery({ workspaceId }, { enabled: opened });
  // Which server's rooms to browse. A ceremony stores only the room id (the
  // poster resolves the server), so this is a browse aid — but a workspace
  // with two servers must still be able to reach the second one's rooms.
  const [browseServerId, setBrowseServerId] = useState<string | null>(null);
  const activeServerId = browseServerId ?? matrixServers[0]?.id ?? null;
  const { data: matrixRooms } = api.matrixServer.rooms.useQuery(
    { workspaceId, serverId: activeServerId ?? "" },
    { enabled: opened && Boolean(activeServerId), retry: false },
  );
  const matrixRoomOptions = useMemo(() => {
    const joined = (matrixRooms?.joined ?? []).map((r) => ({ value: r.roomId, label: r.name }));
    const current = form.matrixRoomId;
    return current && !joined.some((o) => o.value === current) ? [...joined, { value: current, label: current }] : joined;
  }, [matrixRooms, form.matrixRoomId]);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = ceremonyId ? `edit:${ceremonyId}` : `new:${template?.slug ?? "blank"}`;
  // Until the form holds this ceremony's values it may still hold the last
  // one opened; saving then would write those values over this ceremony.
  const isSeeded = opened && seededFor === seedKey;
  useEffect(() => {
    if (!opened) {
      setSeededFor(null);
      setBrowseServerId(null);
      setIconPickerOpen(false);
      return;
    }
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
  }, [opened, ceremonyId, template, existing, seededFor, seedKey]);

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

  const meetingUrlInvalid = form.meetingUrl.trim() !== "" && meetingUrlKey(form.meetingUrl) === null;
  const matrixRoomMissing = form.postToMatrix && !form.matrixRoomId;
  const canSave =
    isSeeded &&
    form.name.trim().length > 0 &&
    form.cadenceRule.trim().length > 0 &&
    form.startsOn !== null &&
    !meetingUrlInvalid &&
    !matrixRoomMissing;

  const submit = () => {
    if (!canSave || !form.startsOn) return;
    const payload = {
      workspaceId,
      name: form.name.trim(),
      kind: form.kind,
      icon: isCeremonyIconKey(form.icon) ? form.icon : null,
      aliases: form.aliases,
      purpose: orNull(form.purpose),
      notFor: orNull(form.notFor),
      inputs: orNull(form.inputs),
      outputs: orNull(form.outputs),
      cadenceRule: form.cadenceRule.trim(),
      timezone: form.timezone,
      startsOn: form.startsOn,
      durationMinutes: form.durationMinutes,
      leadTimeHours: form.leadTimeHours,
      ownerId: form.ownerId ?? undefined,
      participantUserIds: form.participantUserIds,
      productId: form.productId,
      teamId: form.teamId,
      projectIds: form.projectIds,
      agendaTemplate: form.agendaTemplate,
      includeProjects: form.includeProjects,
      autoExtractOutputs: form.autoExtractOutputs,
      matrixRoomId: form.postToMatrix ? form.matrixRoomId : null,
      meetingUrl: orNull(form.meetingUrl.trim()),
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
  const selectedTeamName = workspaceTeams.find((t) => t.id === form.teamId)?.name ?? null;
  const plannedMinutes = form.agendaTemplate.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const eyebrow = isEdit ? "Edit ceremony" : template ? `New from “${template.name}”` : "New ceremony";

  return (
    <Drawer.Root opened={opened} onClose={onClose} position="right" size={640}>
      <Drawer.Overlay />
      {/* Flex column must go through `styles.content`: a plain `style` prop is
          also spread onto the fixed inner wrapper and undocks the drawer. */}
      <Drawer.Content styles={{ content: { display: "flex", flexDirection: "column" } }}>
        <Drawer.Header>
          <div className="flex w-full min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{eyebrow}</div>
              <div className="truncate text-base font-semibold text-text-primary">
                {isSeeded ? form.name.trim() || "Untitled ceremony" : "Loading…"}
              </div>
            </div>
            <Drawer.CloseButton />
          </div>
        </Drawer.Header>

        <ScrollArea className="min-h-0 flex-1" type="hover" scrollbarSize={8}>
          {!isSeeded && isEdit && existingError ? (
            <Stack gap={4} p="lg">
              <Text size="sm" fw={500}>
                Couldn&apos;t load this ceremony
              </Text>
              <Text size="sm" className="text-text-muted">
                {existingError.message}
              </Text>
            </Stack>
          ) : !isSeeded ? (
            <Stack gap="md" p="lg">
              <Skeleton height={36} />
              <Skeleton height={120} />
              <Skeleton height={120} />
            </Stack>
          ) : (
            <div className="flex flex-col gap-8 px-5 py-5">
              {/* Identity */}
              <section>
                <div className="flex items-end gap-3">
                  <Popover
                    opened={iconPickerOpen}
                    onChange={setIconPickerOpen}
                    position="bottom-start"
                    shadow="md"
                    withinPortal
                  >
                    <Popover.Target>
                      <Tooltip label="Icon shown on meeting cards" withArrow openDelay={300}>
                        <UnstyledButton
                          aria-label="Change icon"
                          onClick={() => setIconPickerOpen((o) => !o)}
                          className="rounded-lg"
                          data-testid="ceremony-icon-button"
                        >
                          <CeremonyIconTile
                            icon={form.icon}
                            kind={form.kind}
                            className="hover:border-border-strong"
                          />
                        </UnstyledButton>
                      </Tooltip>
                    </Popover.Target>
                    <Popover.Dropdown maw={420}>
                      <Text size="xs" className="text-text-muted" mb="xs">
                        Follows the kind until you pick one.
                      </Text>
                      <CeremonyIconPicker
                        value={form.icon}
                        kind={form.kind}
                        onChange={(icon) => {
                          set("icon", icon);
                          setIconPickerOpen(false);
                        }}
                      />
                    </Popover.Dropdown>
                  </Popover>
                  <TextInput
                    className="flex-1"
                    label="Name"
                    required
                    value={form.name}
                    onChange={(e) => set("name", e.currentTarget.value)}
                    data-testid="ceremony-name"
                  />
                  <Select
                    w={170}
                    label="Kind"
                    data={Object.values(CeremonyKind).map((k) => ({ value: k, label: CEREMONY_KIND_LABELS[k] }))}
                    value={form.kind}
                    onChange={(v) => v && set("kind", v as CeremonyKind)}
                    allowDeselect={false}
                  />
                </div>
              </section>

              <section>
                <SectionLabel icon={IconCalendarRepeat}>Schedule</SectionLabel>
                <Stack gap="md">
                  <CadencePicker value={form.cadenceRule} onChange={(rule) => set("cadenceRule", rule)} />
                  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
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
                      value={form.startsOn}
                      onChange={(v) => set("startsOn", v ? new Date(v) : null)}
                      valueFormat="D MMM YYYY"
                      popoverProps={{ withinPortal: true }}
                    />
                    <NumberInput
                      label="Duration"
                      suffix=" min"
                      min={5}
                      max={24 * 60}
                      value={form.durationMinutes}
                      onChange={(v) => set("durationMinutes", typeof v === "number" ? v : 30)}
                    />
                  </div>
                  <Text size="xs" className="text-text-muted">
                    No occurrences are generated before the start date.
                  </Text>
                </Stack>
              </section>

              <section>
                <SectionLabel icon={IconUsers}>People &amp; scope</SectionLabel>
                <Stack gap="md">
                  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                    <PersonPicker
                      trigger="field"
                      label="Owner"
                      noneLabel="Defaults to you"
                      workspaceId={workspaceId}
                      value={form.ownerId}
                      onChange={(id) => set("ownerId", id)}
                    />
                    <Select
                      label="Team"
                      data={workspaceTeams.map((t) => ({ value: t.id, label: t.name }))}
                      value={form.teamId}
                      onChange={(v) => set("teamId", v)}
                      placeholder="None"
                      clearable
                      searchable
                    />
                  </div>
                  <MultiSelect
                    label="Participants"
                    description={
                      selectedTeamName
                        ? `Everyone on ${selectedTeamName} takes part too.`
                        : "Pick a team above to include everyone on it."
                    }
                    data={memberOptions}
                    value={form.participantUserIds}
                    onChange={(v) => set("participantUserIds", v)}
                    placeholder={form.participantUserIds.length ? undefined : "Add workspace members"}
                    searchable
                    clearable
                  />
                  <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
                    <Select
                      label="Product"
                      data={products.map((p) => ({ value: p.id, label: p.name }))}
                      value={form.productId}
                      onChange={(v) => set("productId", v)}
                      placeholder="None"
                      clearable
                      searchable
                    />
                    <MultiSelect
                      label="Projects it reviews"
                      data={projects.map((p) => ({ value: p.id, label: p.name }))}
                      value={form.projectIds}
                      onChange={(v) => set("projectIds", v)}
                      placeholder={form.projectIds.length ? undefined : "None"}
                      clearable
                      searchable
                      data-testid="ceremony-projects"
                    />
                  </div>
                </Stack>
              </section>

              <section>
                <SectionLabel icon={IconFileDescription}>Charter</SectionLabel>
                <Stack gap="md">
                  <ProseField label="Purpose">
                    <MarkdownInput value={form.purpose} onChange={(v) => set("purpose", v)} placeholder="Why this meeting exists" minRows={2} />
                  </ProseField>
                  <ProseField label="Not for">
                    <MarkdownInput value={form.notFor} onChange={(v) => set("notFor", v)} placeholder="What gets parked for another ceremony" minRows={2} />
                  </ProseField>
                  <ProseField label="Inputs">
                    <MarkdownInput value={form.inputs} onChange={(v) => set("inputs", v)} placeholder="What must exist before it starts" minRows={2} />
                  </ProseField>
                  <ProseField label="Outputs">
                    <MarkdownInput value={form.outputs} onChange={(v) => set("outputs", v)} placeholder="What it must produce" minRows={2} />
                  </ProseField>
                </Stack>
              </section>

              <section>
                <SectionLabel icon={IconListDetails}>Agenda</SectionLabel>
                <Stack gap="md">
                  <div className="overflow-hidden rounded-md border border-border-subtle">
                    {form.agendaTemplate.length > 0 && (
                      <div className="grid grid-cols-[1fr_120px_64px_28px] sm:grid-cols-[1fr_160px_76px_28px] gap-2 border-b border-border-subtle px-3 py-2 text-xs font-medium text-text-muted">
                        <span>Section</span>
                        <span>Type</span>
                        <span>Min</span>
                        <span />
                      </div>
                    )}
                    <div className="divide-y divide-border-subtle">
                      {form.agendaTemplate.map((section, index) => (
                        <div key={section.key} className="grid grid-cols-[1fr_120px_64px_28px] sm:grid-cols-[1fr_160px_76px_28px] items-center gap-2 px-3 py-2">
                          <TextInput
                            aria-label="Section title"
                            placeholder="Section title"
                            value={section.title}
                            onChange={(e) => updateSection(index, { title: e.currentTarget.value })}
                            size="xs"
                          />
                          <Select
                            aria-label="Section type"
                            data={AGENDA_SECTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                            value={section.type}
                            onChange={(v) => v && updateSection(index, { type: v as AgendaSectionType })}
                            allowDeselect={false}
                            size="xs"
                          />
                          <NumberInput
                            aria-label="Minutes"
                            value={section.minutes ?? 0}
                            min={0}
                            onChange={(v) => updateSection(index, { minutes: typeof v === "number" ? v : 0 })}
                            size="xs"
                          />
                          <ActionIcon variant="subtle" color="gray" aria-label="Remove section" onClick={() => removeSection(index)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </div>
                      ))}
                    </div>
                    <div
                      className={`flex items-center justify-between gap-2 px-3 py-2 ${
                        form.agendaTemplate.length > 0 ? "border-t border-border-subtle" : ""
                      }`}
                    >
                      <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={addSection}>
                        Add section
                      </Button>
                      <Text size="xs" className="text-text-muted">
                        {form.agendaTemplate.length === 0
                          ? "No sections yet"
                          : `${plannedMinutes} of ${form.durationMinutes} min planned`}
                      </Text>
                    </div>
                  </div>
                  <Text size="xs" className="text-text-muted">
                    Sections run in this order. Each type fills itself from workspace data when the agenda is generated.
                  </Text>
                  <NumberInput
                    label="Circulate the agenda"
                    suffix=" h before the start"
                    min={0}
                    max={24 * 14}
                    value={form.leadTimeHours}
                    onChange={(v) => set("leadTimeHours", typeof v === "number" ? v : 24)}
                    w={240}
                  />
                  <Switch
                    label="List linked projects on the agenda"
                    description="Ends each agenda with the active projects in scope, each with its DRI and next action."
                    checked={form.includeProjects}
                    onChange={(e) => set("includeProjects", e.currentTarget.checked)}
                    data-testid="ceremony-include-projects"
                  />
                  <Switch
                    label="Post agendas to Matrix"
                    description={
                      matrixServers.length === 0 && !form.postToMatrix
                        ? "Register a Matrix server under Settings → Integrations first."
                        : "Posts each agenda to a room as it goes out. Off keeps it inside Exponential."
                    }
                    checked={form.postToMatrix}
                    onChange={(e) => set("postToMatrix", e.currentTarget.checked)}
                    disabled={matrixServers.length === 0 && !form.postToMatrix}
                    data-testid="ceremony-post-to-matrix"
                  />
                  {form.postToMatrix && (
                    <div className="grid grid-cols-1 items-start gap-3 pl-[52px] sm:grid-cols-2">
                      {matrixServers.length > 1 && (
                        <Select
                          label="Server"
                          data={matrixServers.map((server) => ({ value: server.id, label: server.name }))}
                          value={activeServerId}
                          onChange={(v) => {
                            setBrowseServerId(v);
                            // A room id belongs to one server; switching servers invalidates the pick.
                            set("matrixRoomId", null);
                          }}
                          allowDeselect={false}
                          searchable
                          data-testid="ceremony-matrix-server"
                        />
                      )}
                      <Select
                        label="Room"
                        description="The bot must have joined it."
                        data={matrixRoomOptions}
                        value={form.matrixRoomId}
                        onChange={(v) => set("matrixRoomId", v)}
                        placeholder="Choose a room"
                        error={matrixRoomMissing ? "Choose a room, or turn Matrix posting off." : undefined}
                        searchable
                        data-testid="ceremony-matrix-room"
                      />
                    </div>
                  )}
                </Stack>
              </section>

              <section>
                <SectionLabel icon={IconMicrophone}>Recordings</SectionLabel>
                <Stack gap="md">
                  <TextInput
                    label="Meeting link"
                    description="Recordings made in this room are filed here automatically."
                    placeholder="https://talk.syntro.fi/rooms/standup"
                    value={form.meetingUrl}
                    onChange={(e) => set("meetingUrl", e.currentTarget.value)}
                    error={meetingUrlInvalid ? "Enter the full room link, including the room name" : undefined}
                    data-testid="ceremony-meeting-url"
                  />
                  <TagsInput
                    label="Title aliases"
                    description="Calendar or recording titles that match these attach automatically."
                    value={form.aliases}
                    onChange={(v) => set("aliases", v)}
                    placeholder={form.aliases.length ? "Add another" : "Add an alias and press Enter"}
                  />
                  <Switch
                    label="Extract outputs automatically"
                    description="Drafts actions, decisions and open questions from each recording within about half an hour. A person still reviews them."
                    checked={form.autoExtractOutputs}
                    onChange={(e) => set("autoExtractOutputs", e.currentTarget.checked)}
                    data-testid="ceremony-auto-extract-outputs"
                  />
                </Stack>
              </section>
            </div>
          )}
        </ScrollArea>

        <div className="flex shrink-0 items-center gap-3 border-t border-border-subtle px-5 py-3">
          {isEdit && (
            <Tooltip
              label="Inactive ceremonies stop generating occurrences and are hidden from pickers."
              withArrow
              multiline
              w={260}
            >
              <div>
                <Switch
                  label="Active"
                  checked={form.isActive}
                  onChange={(e) => set("isActive", e.currentTarget.checked)}
                  data-testid="ceremony-active"
                />
              </div>
            </Tooltip>
          )}
          <span className="flex-1" />
          <Button variant="subtle" color="gray" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={!canSave} data-testid="ceremony-save">
            {isEdit ? "Save changes" : "Create ceremony"}
          </Button>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

function SectionLabel({ icon: IconComponent, children }: { icon: Icon; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <IconComponent size={14} className="text-text-faint" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{children}</span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

function ProseField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      {children}
    </Stack>
  );
}
