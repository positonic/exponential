"use client";

import { useState } from "react";
import { ActionIcon, Badge, Button, Select, Text, TextInput } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
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

  const invalidate = () => utils.product.feature.getById.invalidate({ id: featureId });

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
        <div className="border border-border-primary rounded-lg overflow-hidden mb-3">
          {requirements.map((req, i) => {
            const reqScope = scopes.find((s) => s.id === req.scopeId);
            return (
              <div
                key={req.id}
                className={`flex items-start gap-3 px-3 py-2.5 ${i < requirements.length - 1 ? "border-b border-border-primary" : ""}`}
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
                <Text
                  size="sm"
                  className={`flex-1 min-w-0 ${req.checkedAt != null ? "text-text-muted line-through" : "text-text-primary"}`}
                >
                  {req.statement}
                </Text>
                {req.kind && (
                  <Badge size="xs" variant="outline" color="gray" className="shrink-0">
                    {REQUIREMENT_KIND_LABELS[req.kind] ?? req.kind}
                  </Badge>
                )}
                {reqScope && (
                  <Badge size="xs" variant="light" color="gray" className="shrink-0">
                    {reqScope.version}
                  </Badge>
                )}
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="xs"
                  onClick={() => deleteRequirement.mutate({ id: req.id })}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </div>
            );
          })}
        </div>
      ) : (
        <Text size="xs" mb={12} className="text-text-muted">
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
          className="w-36"
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
        <div className="mt-3">
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
