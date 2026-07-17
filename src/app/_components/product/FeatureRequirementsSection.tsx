"use client";

import { useRef, useState } from "react";
import { ActionIcon, Badge, Button, Menu, Select, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconCheck, IconPlus, IconTrash } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { REQUIREMENT_KIND_OPTIONS, REQUIREMENT_KIND_LABELS } from "~/lib/feature-statuses";

export interface FeatureRequirementRow {
  id: string;
  statement: string;
  kind: string | null;
  scopeId: string | null;
  checkedAt: Date | string | null;
}

export interface LegacyUserStory {
  id: string;
  asA: string | null;
  iWant: string | null;
  soThat: string | null;
}

/**
 * The interactive Requirements block (checkable EARS statements with kind and
 * scope association, delete, plus the add form; legacy user stories render
 * read-only, ADR-0039) - extracted from the feature detail page so the
 * feature peek renders the exact same functionality. Callers wrap it in a
 * CollapsibleSection.
 */
export function FeatureRequirementsSection({
  featureId,
  requirements,
  scopes,
  userStories,
}: {
  featureId: string;
  requirements: FeatureRequirementRow[];
  scopes: Array<{ id: string; version: string }>;
  userStories?: LegacyUserStory[];
}) {
  const utils = api.useUtils();
  const [reqStatement, setReqStatement] = useState("");
  const [reqKind, setReqKind] = useState<string | null>(null);
  const [reqScopeId, setReqScopeId] = useState<string | null>(null);

  // In-place statement editing (the In-Place Edit Rule, DESIGN.md).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Esc-cancel guard: blur fires before the cancel setState applies.
  const cancelingEdit = useRef(false);

  const invalidate = () => utils.product.feature.getById.invalidate({ id: featureId });

  const updateRequirement = api.product.feature.updateRequirement.useMutation({
    onSuccess: () => {
      setEditingId(null);
      void invalidate();
    },
  });

  const commitStatement = (req: FeatureRequirementRow) => {
    const v = editValue.trim();
    if (v && v !== req.statement) {
      updateRequirement.mutate({ id: req.id, statement: v });
    } else {
      setEditingId(null);
    }
  };

  const addRequirement = api.product.feature.addRequirement.useMutation({
    onSuccess: async () => {
      setReqStatement("");
      setReqKind(null);
      setReqScopeId(null);
      await invalidate();
    },
  });
  const setRequirementChecked = api.product.feature.setRequirementChecked.useMutation({
    onSuccess: () => void invalidate(),
  });
  const deleteRequirement = api.product.feature.deleteRequirement.useMutation({
    onSuccess: () => void invalidate(),
  });

  const submit = () =>
    addRequirement.mutate({
      featureId,
      statement: reqStatement.trim(),
      kind: (reqKind ?? undefined) as "FUNCTIONAL" | "NON_FUNCTIONAL" | "CONSTRAINT" | undefined,
      scopeId: reqScopeId ?? undefined,
    });

  return (
    <div>
      {requirements.length > 0 ? (
        <div className="border border-border-primary rounded-lg overflow-hidden mb-4">
          {requirements.map((req, i) => {
            const reqScope = scopes.find((s) => s.id === req.scopeId);
            return (
              <div
                key={req.id}
                className={`group flex items-start gap-3 px-3 py-2.5 ${i < requirements.length - 1 ? "border-b border-border-primary" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={req.checkedAt != null}
                  onChange={(e) =>
                    setRequirementChecked.mutate({ id: req.id, checked: e.currentTarget.checked })
                  }
                  className="mt-0.5 shrink-0 cursor-pointer accent-[var(--color-brand-primary)]"
                  aria-label="Requirement met"
                />
                {editingId === req.id ? (
                  <TextInput
                    value={editValue}
                    onChange={(e) => setEditValue(e.currentTarget.value)}
                    // Layered dismiss: Esc cancels this edit, not the drawer
                    // (Mantine's close listener is window-level).
                    data-mantine-stop-propagation="true"
                    autoFocus
                    size="xs"
                    variant="unstyled"
                    className="flex-1 min-w-0"
                    classNames={{ input: "text-sm text-text-primary" }}
                    styles={{ input: { minHeight: 22, height: 22 } }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitStatement(req);
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        cancelingEdit.current = true;
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={() => {
                      if (cancelingEdit.current) {
                        cancelingEdit.current = false;
                        setEditingId(null);
                        return;
                      }
                      commitStatement(req);
                    }}
                  />
                ) : (
                  // Click to edit in place (Enter commits, Esc cancels).
                  <UnstyledButton
                    onClick={() => {
                      setEditingId(req.id);
                      setEditValue(req.statement);
                    }}
                    className={`flex-1 min-w-0 truncate text-left text-sm ${req.checkedAt != null ? "text-text-muted line-through" : "text-text-primary"}`}
                  >
                    {req.statement}
                  </UnstyledButton>
                )}
                {req.kind && (
                  <Badge size="xs" variant="outline" color="gray" className="shrink-0">
                    {REQUIREMENT_KIND_LABELS[req.kind] ?? req.kind}
                  </Badge>
                )}
                {/* Scope association switches in place; the ghost trigger
                    appears on hover when no scope is set. */}
                {scopes.length > 0 && (
                  <Menu position="bottom-end" withinPortal shadow="md">
                    <Menu.Target>
                      <UnstyledButton
                        className={`shrink-0 ${reqScope ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"}`}
                        aria-label="Change scope"
                      >
                        {reqScope ? (
                          <Badge size="xs" variant="light" color="gray" className="cursor-pointer">
                            {reqScope.version}
                          </Badge>
                        ) : (
                          <Badge size="xs" variant="outline" color="gray" className="cursor-pointer border-dashed">
                            + scope
                          </Badge>
                        )}
                      </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {scopes.map((s) => (
                        <Menu.Item
                          key={s.id}
                          rightSection={s.id === req.scopeId ? <IconCheck size={13} className="text-text-muted" /> : undefined}
                          onClick={() => updateRequirement.mutate({ id: req.id, scopeId: s.id })}
                        >
                          {s.version}
                        </Menu.Item>
                      ))}
                      <Menu.Divider />
                      <Menu.Item onClick={() => updateRequirement.mutate({ id: req.id, scopeId: null })}>
                        No scope
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 text-brand-error hover:bg-surface-hover"
                  onClick={() => deleteRequirement.mutate({ id: req.id })}
                  aria-label="Delete requirement"
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </div>
            );
          })}
        </div>
      ) : (
        <Text size="xs" mb={16} className="text-text-muted">
          No requirements yet. Write testable EARS statements: &quot;When
          &lt;trigger&gt;, the system shall &lt;response&gt;&quot;.
        </Text>
      )}
      <div className="flex gap-2 items-end">
        <TextInput
          placeholder="The system shall..."
          value={reqStatement}
          onChange={(e) => setReqStatement(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && reqStatement.trim()) {
              e.preventDefault();
              submit();
            }
          }}
          size="xs"
          className="flex-1"
        />
        <Select
          placeholder="Kind"
          value={reqKind}
          onChange={setReqKind}
          data={REQUIREMENT_KIND_OPTIONS}
          size="xs"
          clearable
          className="w-28"
          comboboxProps={{ withinPortal: true }}
        />
        {scopes.length > 0 && (
          <Select
            placeholder="Scope"
            value={reqScopeId}
            onChange={setReqScopeId}
            data={scopes.map((s) => ({ value: s.id, label: s.version }))}
            size="xs"
            clearable
            className="w-28"
            comboboxProps={{ withinPortal: true }}
          />
        )}
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={12} />}
          onClick={submit}
          loading={addRequirement.isPending}
          disabled={!reqStatement.trim()}
        >
          Add
        </Button>
      </div>
      {(userStories?.length ?? 0) > 0 && (
        <div className="mt-4">
          <Text size="xs" mb={4} className="text-text-muted">
            Legacy user stories (read-only - superseded by requirements, ADR-0039):
          </Text>
          <div className="border border-border-primary rounded-lg overflow-hidden opacity-70">
            {userStories!.map((story, i) => (
              <div
                key={story.id}
                className={`px-3 py-2 ${i < userStories!.length - 1 ? "border-b border-border-primary" : ""}`}
              >
                <Text size="xs" className="text-text-secondary">
                  <span className="text-text-muted">As a</span> {story.asA ?? "-"}{" "}
                  <span className="text-text-muted">I want</span> {story.iWant ?? "-"}{" "}
                  <span className="text-text-muted">so that</span> {story.soThat ?? "-"}
                </Text>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
