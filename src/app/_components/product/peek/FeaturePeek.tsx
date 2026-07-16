"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  Menu,
  Popover,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconCategory,
  IconChecklist,
  IconDots,
  IconFlag,
  IconFlame,
  IconMap2,
  IconTag,
  IconTarget,
} from "@tabler/icons-react";
import type { JSONContent } from "@tiptap/core";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { PropertyPill, PillRow, pillClassName } from "~/app/_components/product/PropertyPill";
import { FeatureScopesSection } from "~/app/_components/product/FeatureScopesSection";
import { FeatureRequirementsSection } from "~/app/_components/product/FeatureRequirementsSection";
import { PriorityIcon, PRIORITY_LABELS } from "~/app/_components/product/PriorityIcon";
import { LabelsCombobox } from "~/app/_components/product/LabelsCombobox";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { ActivityTimeline } from "~/app/_components/shared/ActivityTimeline";
import { useFeatureActivity } from "~/hooks/useFeatureActivity";
import { ActivityFilterMenu, useActivityFilter } from "~/app/_components/shared/ActivityFilterMenu";
import { FeatureBodyDocument } from "~/app/_components/prd/FeatureBodyDocument";
import {
  FEATURE_STATUSES,
  FEATURE_STATUS_LABELS,
  FEATURE_STATUS_COLORS,
} from "~/lib/feature-statuses";

const EFFORT_OPTIONS = [1, 2, 3, 5, 8, 13];

/**
 * Full feature content for the peek drawer: PRD body, the SAME interactive
 * scopes and requirements blocks as the detail page (shared components),
 * and activity, with the properties sidebar compressed into the pill strip.
 */
export function FeaturePeek({ featureId, basePath }: { featureId: string; basePath: string }) {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: feature, isLoading } = api.product.feature.getById.useQuery(
    { id: featureId },
    { enabled: !!featureId },
  );
  const { data: areas } = api.product.feature.listAreas.useQuery(
    { productId: feature?.product.id ?? "" },
    { enabled: !!feature?.product.id },
  );
  const { data: goals } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );
  const { data: tags } = api.tag.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const invalidate = async () => {
    await utils.product.feature.getById.invalidate({ id: featureId });
    await utils.product.feature.listEvents.invalidate({ featureId });
    if (feature?.product.id) {
      await utils.product.feature.list.invalidate({ productId: feature.product.id });
    }
  };

  // Optimistic single-field patches (see TicketPeek): instant pill feedback,
  // rollback on error, background reconcile on settle.
  const updateFeature = api.product.feature.update.useMutation({
    onMutate: async (vars) => {
      await utils.product.feature.getById.cancel({ id: featureId });
      const prev = utils.product.feature.getById.getData({ id: featureId });
      if (prev) {
        const next = { ...prev };
        if (vars.name !== undefined) next.name = vars.name;
        if (vars.status !== undefined) next.status = vars.status;
        if (vars.priority !== undefined) next.priority = vars.priority ?? null;
        if (vars.effort !== undefined) next.effort = vars.effort ?? null;
        if (vars.areaId !== undefined) {
          const a = (areas ?? []).find((x) => x.id === vars.areaId);
          next.areaId = vars.areaId ?? null;
          next.area = vars.areaId && a ? { id: a.id, name: a.name } : null;
        }
        if (vars.goalId !== undefined) {
          const g = (goals ?? []).find((x) => x.id === vars.goalId);
          next.goalId = vars.goalId ?? null;
          next.goal =
            vars.goalId && g
              ? { ...(prev.goal ?? { period: null, parentGoalId: null, parentGoal: null }), id: g.id, title: g.title }
              : null;
        }
        utils.product.feature.getById.setData({ id: featureId }, next);
      }
      return { prev };
    },
    onError: (_err, _vars, mctx) => {
      if (mctx?.prev) {
        utils.product.feature.getById.setData({ id: featureId }, mctx.prev);
      }
      notifications.show({
        title: "Update failed",
        message: "Your change was not saved. Please try again.",
        color: "red",
      });
    },
    onSettled: invalidate,
  });
  const setFeatureTags = api.tag.setFeatureTags.useMutation({ onSuccess: invalidate });
  const createTag = api.tag.create.useMutation({
    onSuccess: async (newTag) => {
      await utils.tag.list.invalidate();
      const currentIds = feature?.tags?.map((t: { tag: { id: string } }) => t.tag.id) ?? [];
      setFeatureTags.mutate({ featureId, tagIds: [...currentIds, newTag.id] });
    },
  });

  const setField = (field: string, value: unknown) => {
    updateFeature.mutate({ id: featureId, [field]: value });
  };

  // Deprecation cascade prompt (same as the detail page). Three explicit
  // actions - a true Cancel must exist; "cancel = also deprecate" broke the
  // back-out contract.
  const handleStatusChange = (val: string) => {
    const hasLiveScopes = (feature?.scopes ?? []).some((s) => s.status === "SHIPPED");
    if (val === "DEPRECATED" && hasLiveScopes) {
      const modalId = "deprecate-feature";
      const deprecate = (deprecateScopes: boolean) => {
        modals.close(modalId);
        updateFeature.mutate({
          id: featureId,
          status: "DEPRECATED",
          ...(deprecateScopes ? { deprecateScopes: true } : {}),
        });
      };
      modals.open({
        modalId,
        title: "Deprecate feature",
        children: (
          <Stack gap="md">
            <Text size="sm">
              Also deprecate this feature&apos;s live scopes? The feature stays in
              the registry as product history either way.
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" onClick={() => modals.close(modalId)}>
                Cancel
              </Button>
              <Button color="orange" variant="light" onClick={() => deprecate(false)}>
                Feature only
              </Button>
              <Button color="orange" onClick={() => deprecate(true)}>
                Feature + scopes
              </Button>
            </Group>
          </Stack>
        ),
      });
      return;
    }
    setField("status", val);
  };

  const activity = useFeatureActivity(featureId);
  const [activityFilter, setActivityFilter] = useActivityFilter();
  const [nameValue, setNameValue] = useState("");
  useEffect(() => {
    if (feature) setNameValue(feature.name);
  }, [feature]);

  // One-row strip: relational pills render when set or explicitly revealed
  // via the ⋯ overflow.
  // Reveals persist across prev/next flips - collapsing what the user just
  // opened mid-triage was a recall burden.
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const reveal = (key: string) =>
    setRevealed((prev) => new Set(prev).add(key));

  const requirementsMeta = useMemo(() => {
    if (!feature || feature.requirements.length === 0) return undefined;
    const met = feature.requirements.filter((r) => r.checkedAt != null).length;
    return `${met}/${feature.requirements.length} met`;
  }, [feature]);

  if (isLoading || !feature) {
    return (
      <Stack gap="md">
        <Skeleton height={20} width={180} />
        <Skeleton height={32} width="80%" />
        <Skeleton height={28} />
        <Skeleton height={160} />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Editable name */}
      <Textarea
        value={nameValue}
        onChange={(e) => setNameValue(e.currentTarget.value)}
        autosize
        minRows={1}
        maxRows={3}
        variant="unstyled"
        classNames={{ input: "text-text-primary font-bold p-0 leading-tight resize-none" }}
        styles={{ input: { fontWeight: 700, fontSize: "1.25rem", paddingTop: 6, paddingBottom: 6 } }}
        onKeyDown={(e) => {
          // A feature name has no newlines - Enter commits.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          const trimmed = nameValue.trim();
          if (trimmed && trimmed !== feature.name) setField("name", trimmed);
        }}
      />

      {/* Property strip - line 1: workflow */}
      <div>
        <PillRow>
          <PropertyPill
            tooltip="Status"
            icon={
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: `var(--mantine-color-${FEATURE_STATUS_COLORS[feature.status] ?? "gray"}-6)` }}
              />
            }
            label={FEATURE_STATUS_LABELS[feature.status] ?? feature.status}
          >
            {FEATURE_STATUSES.map((s) => (
              <Menu.Item
                key={s.value}
                onClick={() => handleStatusChange(s.value)}
                leftSection={
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: `var(--mantine-color-${s.color}-6)` }}
                  />
                }
              >
                {s.label}
              </Menu.Item>
            ))}
          </PropertyPill>

          <PropertyPill
            tooltip="Priority"
            ghost={feature.priority == null}
            icon={feature.priority == null ? <IconFlag size={13} /> : <PriorityIcon priority={feature.priority} size={13} />}
            label={feature.priority == null ? "Priority" : (PRIORITY_LABELS[feature.priority] ?? String(feature.priority))}
          >
            {[0, 1, 2, 3, 4].map((p) => (
              <Menu.Item key={p} leftSection={<PriorityIcon priority={p} size={13} />} onClick={() => setField("priority", p)}>
                {PRIORITY_LABELS[p]}
              </Menu.Item>
            ))}
          </PropertyPill>

          {/* Effort rides in the ⋯ overflow until set (see TicketPeek). */}
          {(feature.effort != null || revealed.has("effort")) && (
            <PropertyPill
              tooltip="Effort"
              ghost={feature.effort == null}
              icon={<IconFlame size={13} />}
              label={feature.effort == null ? "Effort" : String(feature.effort)}
            >
              {EFFORT_OPTIONS.map((n) => (
                <Menu.Item key={n} onClick={() => setField("effort", n)}>
                  {n}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={() => setField("effort", null)}>Clear</Menu.Item>
            </PropertyPill>
          )}

          {(!!feature.area || revealed.has("area")) && (
            <PropertyPill
              tooltip="Area"
              ghost={!feature.area}
              icon={<IconMap2 size={13} />}
              label={feature.area?.name ?? "Area"}
            >
              {(areas ?? []).map((a) => (
                <Menu.Item key={a.id} onClick={() => setField("areaId", a.id)}>
                  {a.name}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={() => setField("areaId", null)}>No area</Menu.Item>
            </PropertyPill>
          )}

          {(!!feature.goal || revealed.has("goal")) && (
            <PropertyPill
              tooltip="Goal"
              ghost={!feature.goal}
              icon={<IconTarget size={13} />}
              label={feature.goal?.title ?? "Goal"}
            >
              {(goals ?? []).map((g) => (
                <Menu.Item key={g.id} onClick={() => setField("goalId", g.id)}>
                  {g.title}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={() => setField("goalId", null)}>No goal</Menu.Item>
            </PropertyPill>
          )}

          {((feature.tags?.length ?? 0) > 0 || revealed.has("labels")) && (
            <Popover position="bottom-start" withinPortal shadow="md">
              <Popover.Target>
                <button
                  type="button"
                  className={pillClassName((feature.tags?.length ?? 0) === 0)}
                >
                  <IconTag size={13} />
                  <span className="truncate">
                    {(feature.tags?.length ?? 0) > 0
                      ? feature.tags.map((t: { tag: { name: string } }) => t.tag.name).join(", ")
                      : "Labels"}
                  </span>
                </button>
              </Popover.Target>
              <Popover.Dropdown
                styles={{ dropdown: { backgroundColor: "var(--color-bg-elevated)", border: "1px solid var(--color-border-primary)", minWidth: 260 } }}
              >
                <LabelsCombobox
                  selectedIds={feature.tags?.map((t: { tag: { id: string } }) => t.tag.id) ?? []}
                  allTags={tags?.allTags ?? []}
                  entityTags={feature.tags ?? []}
                  onChange={(tagIds) => setFeatureTags.mutate({ featureId, tagIds })}
                  onCreate={(name) => {
                    if (workspaceId) createTag.mutate({ name, color: "avatar-blue", workspaceId });
                  }}
                />
              </Popover.Dropdown>
            </Popover>
          )}

          {/* ⋯ overflow: reveal unset properties */}
          <PropertyPill tooltip="More" ghost icon={<IconDots size={13} />} label="">
            {feature.effort == null && !revealed.has("effort") && (
              <Menu.Item leftSection={<IconFlame size={13} />} onClick={() => reveal("effort")}>Effort</Menu.Item>
            )}
            {!feature.area && !revealed.has("area") && (
              <Menu.Item leftSection={<IconMap2 size={13} />} onClick={() => reveal("area")}>Area</Menu.Item>
            )}
            {!feature.goal && !revealed.has("goal") && (
              <Menu.Item leftSection={<IconTarget size={13} />} onClick={() => reveal("goal")}>Goal</Menu.Item>
            )}
            {(feature.tags?.length ?? 0) === 0 && !revealed.has("labels") && (
              <Menu.Item leftSection={<IconTag size={13} />} onClick={() => reveal("labels")}>Labels</Menu.Item>
            )}
            {(feature.effort != null || revealed.has("effort")) &&
              (!!feature.area || revealed.has("area")) &&
              (!!feature.goal || revealed.has("goal")) &&
              ((feature.tags?.length ?? 0) > 0 || revealed.has("labels")) && (
                <Menu.Item disabled>Nothing more to add</Menu.Item>
              )}
          </PropertyPill>
        </PillRow>

        {/* Meta - counts only; creator/date live in the Activity timeline.
            (mt via prop: Tailwind margin utilities are dead on Mantine Text) */}
        <Text size="xs" mt={8} className="text-text-muted">
          {feature._count.tickets} tickets · {feature.scopes.length} scopes
        </Text>
      </div>

      <div className="border-t border-border-primary" />

      {/* Sections get pt-2 on top of the Stack's 16px gap (see TicketPeek):
          24px between sections vs 8px header-to-content inside one. */}

      {/* Description - the living rich document (same editor as the page). */}
      <div className="pt-2">
        <CollapsibleSection title="Description">
          <FeatureBodyDocument
            featureId={featureId}
            descriptionDoc={(feature.descriptionDoc as JSONContent | null) ?? null}
            description={feature.description ?? null}
            docVersion={feature.docVersion}
            editable
            enableComments
          />
        </CollapsibleSection>
      </div>

      {/* Scopes - the SAME interactive block as the detail page (status
          select, scope-page links, delete, add form). */}
      <div className="pt-2">
        <CollapsibleSection
          title="Scopes"
          icon={<IconCategory size={14} className="text-text-muted" />}
          meta={feature.scopes.length > 0 ? String(feature.scopes.length) : undefined}
        >
          <FeatureScopesSection
            featureId={featureId}
            productId={feature.product.id}
            scopes={feature.scopes}
            scopesPath={`${basePath}/features/${featureId}/scopes`}
          />
        </CollapsibleSection>
      </div>

      {/* Requirements - the SAME interactive block as the detail page
          (check off, kind + scope association, delete, add form). */}
      <div className="pt-2">
        <CollapsibleSection
          title="Requirements"
          icon={<IconChecklist size={14} className="text-text-muted" />}
          meta={requirementsMeta}
        >
          <FeatureRequirementsSection
            featureId={featureId}
            requirements={feature.requirements}
            scopes={feature.scopes}
            userStories={feature.userStories}
          />
        </CollapsibleSection>
      </div>

      {/* Activity */}
      <div className="pt-2">
        <CollapsibleSection
          title="Activity"
          action={<ActivityFilterMenu value={activityFilter} onChange={setActivityFilter} />}
        >
          <ActivityTimeline activity={activity} filter={activityFilter} />
        </CollapsibleSection>
      </div>
    </Stack>
  );
}
