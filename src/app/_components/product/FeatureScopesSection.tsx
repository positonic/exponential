"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionIcon, Button, Group, Menu, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconPlus, IconTrash } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import {
  SCOPE_STATUS_OPTIONS,
  SCOPE_STATUS_LABELS,
  SCOPE_STATUS_COLORS,
} from "~/lib/feature-statuses";

export interface FeatureScopeRow {
  id: string;
  version: string;
  description: string;
  status: string;
  shippedAt: Date | string | null;
}

/**
 * The interactive Scopes block (rows with status select, scope-page link,
 * delete, plus the add form) - extracted from the feature detail page so the
 * feature peek renders the exact same functionality. Callers wrap it in a
 * CollapsibleSection.
 */
export function FeatureScopesSection({
  featureId,
  productId,
  scopes,
  scopesPath,
}: {
  featureId: string;
  productId: string;
  scopes: FeatureScopeRow[];
  /** Base href of the feature's scope pages (`.../features/<id>/scopes`). */
  scopesPath: string;
}) {
  const utils = api.useUtils();
  const [scopeVersion, setScopeVersion] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");

  const invalidate = async () => {
    await utils.product.feature.getById.invalidate({ id: featureId });
    await utils.product.feature.listEvents.invalidate({ featureId });
    await utils.product.feature.list.invalidate({ productId });
  };

  const addScope = api.product.feature.addScope.useMutation({
    onSuccess: async () => {
      setScopeVersion("");
      setScopeDescription("");
      await invalidate();
    },
  });
  const updateScope = api.product.feature.updateScope.useMutation({ onSuccess: invalidate });
  const deleteScope = api.product.feature.deleteScope.useMutation({ onSuccess: invalidate });

  return (
    <div>
      {scopes.length > 0 ? (
        <div className="border border-border-primary rounded-lg overflow-hidden mb-4">
          {scopes.map((scope, i) => (
            <div
              key={scope.id}
              className={`flex items-start justify-between gap-3 px-3 py-2.5 ${i < scopes.length - 1 ? "border-b border-border-primary" : ""}`}
            >
              <div className="flex-1">
                <Group gap="sm">
                  <Link
                    href={`${scopesPath}/${scope.id}`}
                    className="text-sm font-medium text-text-primary hover:underline"
                  >
                    {scope.version}
                  </Link>
                  {/* Content-sized menu trigger, not a fixed-width Select:
                      a 110px input left a dead gap and an orphaned chevron
                      floating mid-row after short values like "Live". */}
                  <Menu position="bottom-start" withinPortal shadow="md">
                    <Menu.Target>
                      <UnstyledButton
                        className="inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                        style={{ color: `var(--mantine-color-${SCOPE_STATUS_COLORS[scope.status] ?? "gray"}-5)` }}
                      >
                        {SCOPE_STATUS_LABELS[scope.status] ?? scope.status}
                        <IconChevronDown size={12} />
                      </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {SCOPE_STATUS_OPTIONS.map((o) => (
                        <Menu.Item
                          key={o.value}
                          onClick={() =>
                            updateScope.mutate({
                              id: scope.id,
                              status: o.value as "PLANNED" | "IN_PROGRESS" | "SHIPPED" | "DEPRECATED",
                            })
                          }
                          leftSection={
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: `var(--mantine-color-${SCOPE_STATUS_COLORS[o.value] ?? "gray"}-6)` }}
                            />
                          }
                        >
                          {o.label}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                  {scope.shippedAt && (
                    <Text size="xs" className="text-text-muted">
                      live since {new Date(scope.shippedAt).toLocaleDateString()}
                    </Text>
                  )}
                </Group>
                <div className="mt-1">
                  <MarkdownRenderer content={scope.description} />
                </div>
              </div>
              <ActionIcon
                variant="subtle"
                color="red"
                size="xs"
                onClick={() => deleteScope.mutate({ id: scope.id })}
              >
                <IconTrash size={12} />
              </ActionIcon>
            </div>
          ))}
        </div>
      ) : (
        <Text size="xs" mb={16} className="text-text-muted">
          No scopes yet - scopes are a feature&apos;s delivery slices (v1, v2, new platforms).
        </Text>
      )}
      <div className="flex gap-2 items-end">
        <TextInput
          placeholder="v1.0"
          value={scopeVersion}
          onChange={(e) => setScopeVersion(e.currentTarget.value)}
          size="xs"
          className="w-28"
        />
        <TextInput
          placeholder="Description"
          value={scopeDescription}
          onChange={(e) => setScopeDescription(e.currentTarget.value)}
          size="xs"
          className="flex-1"
        />
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={12} />}
          onClick={() => {
            if (scopeVersion.trim() && scopeDescription.trim())
              addScope.mutate({ featureId, version: scopeVersion.trim(), description: scopeDescription.trim() });
          }}
          loading={addScope.isPending}
          disabled={!scopeVersion.trim() || !scopeDescription.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
