"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

const STATUS_COLORS: Record<string, string> = {
  IDEA: "gray",
  DEFINED: "blue",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  ARCHIVED: "dark",
};

const SCOPE_STATUS: Record<string, string> = {
  PLANNED: "gray",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  DEPRECATED: "red",
};

export default function FeatureDetailPage() {
  const router = useRouter();
  const params = useParams();
  const featureId = params.featureId as string;
  const productSlug = params.productSlug as string;
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const { data: feature, isLoading } = api.product.feature.getById.useQuery(
    { id: featureId },
    { enabled: !!featureId },
  );

  // Scope form
  const [scopeVersion, setScopeVersion] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");

  // Story form
  const [storyAsA, setStoryAsA] = useState("");
  const [storyIWant, setStoryIWant] = useState("");
  const [storySoThat, setStorySoThat] = useState("");
  const [storyScopeId, setStoryScopeId] = useState<string | null>(null);

  const addScope = api.product.feature.addScope.useMutation({
    onSuccess: async () => {
      setScopeVersion("");
      setScopeDescription("");
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const deleteScope = api.product.feature.deleteScope.useMutation({
    onSuccess: async () => {
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const addUserStory = api.product.feature.addUserStory.useMutation({
    onSuccess: async () => {
      setStoryAsA("");
      setStoryIWant("");
      setStorySoThat("");
      setStoryScopeId(null);
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const deleteUserStory = api.product.feature.deleteUserStory.useMutation({
    onSuccess: async () => {
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const deleteFeature = api.product.feature.delete.useMutation({
    onSuccess: async () => {
      if (feature?.product.id) {
        await utils.product.feature.list.invalidate({
          productId: feature.product.id,
        });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products/${productSlug}/features`);
      }
    },
  });

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={40} width={300} />
        <Skeleton height={100} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (!feature) {
    return <Text className="text-text-muted">Feature not found</Text>;
  }

  const onAddScope = () => {
    if (!scopeVersion.trim() || !scopeDescription.trim()) return;
    addScope.mutate({
      featureId,
      version: scopeVersion.trim(),
      description: scopeDescription.trim(),
    });
  };

  const onAddStory = () => {
    addUserStory.mutate({
      featureId,
      scopeId: storyScopeId ?? undefined,
      asA: storyAsA.trim() || undefined,
      iWant: storyIWant.trim() || undefined,
      soThat: storySoThat.trim() || undefined,
    });
  };

  const onDeleteFeature = () => {
    modals.openConfirmModal({
      title: "Delete feature",
      children: (
        <Text size="sm">
          This will permanently delete the feature and all its scopes and user
          stories.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteFeature.mutate({ id: featureId }),
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2} className="text-text-primary">
              {feature.name}
            </Title>
            <Badge color={STATUS_COLORS[feature.status] ?? "gray"} variant="light">
              {feature.status.replace("_", " ").toLowerCase()}
            </Badge>
          </Group>
          {feature.description && (
            <Text className="text-text-muted mt-2">{feature.description}</Text>
          )}
          {feature.vision && (
            <Card className="border border-border-primary bg-surface-primary mt-3">
              <Text size="xs" className="text-text-muted uppercase">
                Vision
              </Text>
              <Text size="sm" className="text-text-primary mt-1">
                {feature.vision}
              </Text>
            </Card>
          )}
          {feature.goal && (
            <Text size="sm" className="text-text-muted mt-2">
              Aligned to:{" "}
              <span className="text-text-primary">{feature.goal.title}</span>
              {feature.goal.period ? ` (${feature.goal.period})` : ""}
            </Text>
          )}
        </div>
        <Button color="red" variant="outline" onClick={onDeleteFeature}>
          Delete
        </Button>
      </Group>

      {/* Scopes */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="sm">
          <Title order={5} className="text-text-primary">
            Scopes (versioned deliverables)
          </Title>
          <Text size="xs" className="text-text-muted">
            Capture what shipped (or will ship) in each version of this feature.
          </Text>

          {feature.scopes.length === 0 ? (
            <Text size="sm" className="text-text-muted italic">
              No scopes yet.
            </Text>
          ) : (
            <Stack gap="xs">
              {feature.scopes.map((scope) => (
                <Card
                  key={scope.id}
                  className="border border-border-primary bg-background-primary"
                >
                  <Group justify="space-between" align="flex-start">
                    <div className="flex-1">
                      <Group gap="sm">
                        <Text fw={600} className="text-text-primary">
                          {scope.version}
                        </Text>
                        <Badge
                          color={SCOPE_STATUS[scope.status] ?? "gray"}
                          variant="light"
                          size="sm"
                        >
                          {scope.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      </Group>
                      <Text size="sm" className="text-text-muted mt-1 whitespace-pre-wrap">
                        {scope.description}
                      </Text>
                    </div>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => deleteScope.mutate({ id: scope.id })}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}

          {/* Add scope form */}
          <Card className="border border-border-primary bg-background-primary">
            <Stack gap="xs">
              <Text size="sm" fw={500} className="text-text-primary">
                Add scope
              </Text>
              <TextInput
                placeholder="Version (e.g. v1.0)"
                value={scopeVersion}
                onChange={(e) => setScopeVersion(e.currentTarget.value)}
                size="xs"
              />
              <Textarea
                placeholder="What ships in this version? (markdown supported)"
                value={scopeDescription}
                onChange={(e) => setScopeDescription(e.currentTarget.value)}
                autosize
                minRows={2}
                size="xs"
              />
              <Group justify="flex-end">
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={onAddScope}
                  loading={addScope.isPending}
                  disabled={!scopeVersion.trim() || !scopeDescription.trim()}
                >
                  Add scope
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>
      </Card>

      {/* User stories */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="sm">
          <Title order={5} className="text-text-primary">
            User stories
          </Title>
          {feature.userStories.length === 0 ? (
            <Text size="sm" className="text-text-muted italic">
              No stories yet.
            </Text>
          ) : (
            <Stack gap="xs">
              {feature.userStories.map((story) => (
                <Card
                  key={story.id}
                  className="border border-border-primary bg-background-primary"
                >
                  <Group justify="space-between" align="flex-start">
                    <div className="flex-1">
                      <Text size="sm" className="text-text-primary">
                        <strong>As a</strong> {story.asA ?? "-"}{" "}
                        <strong>I want</strong> {story.iWant ?? "-"}{" "}
                        <strong>so that</strong> {story.soThat ?? "-"}
                      </Text>
                      {story.acceptanceCriteria && (
                        <Text size="xs" className="text-text-muted mt-1 whitespace-pre-wrap">
                          {story.acceptanceCriteria}
                        </Text>
                      )}
                    </div>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => deleteUserStory.mutate({ id: story.id })}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}

          {/* Add story form */}
          <Card className="border border-border-primary bg-background-primary">
            <Stack gap="xs">
              <Text size="sm" fw={500} className="text-text-primary">
                Add user story
              </Text>
              <TextInput
                size="xs"
                placeholder="As a (persona)"
                value={storyAsA}
                onChange={(e) => setStoryAsA(e.currentTarget.value)}
              />
              <TextInput
                size="xs"
                placeholder="I want ..."
                value={storyIWant}
                onChange={(e) => setStoryIWant(e.currentTarget.value)}
              />
              <TextInput
                size="xs"
                placeholder="so that ..."
                value={storySoThat}
                onChange={(e) => setStorySoThat(e.currentTarget.value)}
              />
              {feature.scopes.length > 0 && (
                <Select
                  size="xs"
                  placeholder="Optionally link to scope"
                  clearable
                  data={feature.scopes.map((s) => ({
                    value: s.id,
                    label: s.version,
                  }))}
                  value={storyScopeId}
                  onChange={setStoryScopeId}
                />
              )}
              <Group justify="flex-end">
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={onAddStory}
                  loading={addUserStory.isPending}
                  disabled={!storyIWant.trim()}
                >
                  Add story
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>
      </Card>

      {/* Linked insights */}
      {feature.insights.length > 0 && (
        <Card className="border border-border-primary bg-surface-secondary">
          <Stack gap="sm">
            <Title order={5} className="text-text-primary">
              Linked research insights
            </Title>
            <Stack gap="xs">
              {feature.insights.map((link) => (
                <Card
                  key={link.insight.id}
                  className="border border-border-primary bg-background-primary"
                >
                  <Group justify="space-between">
                    <div>
                      <Badge size="xs" variant="light">
                        {link.insight.type.toLowerCase().replace("_", " ")}
                      </Badge>
                      <Text size="sm" className="text-text-primary mt-1">
                        {link.insight.title ?? link.insight.description}
                      </Text>
                      {link.insight.source && (
                        <Text size="xs" className="text-text-muted mt-1">
                          {link.insight.source}
                        </Text>
                      )}
                      {!link.insight.source && link.insight.research && (
                        <Text size="xs" className="text-text-muted mt-1">
                          From: {link.insight.research.title}
                        </Text>
                      )}
                    </div>
                  </Group>
                </Card>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
