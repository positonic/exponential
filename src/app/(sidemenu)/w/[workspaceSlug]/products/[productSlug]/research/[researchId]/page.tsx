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
  Textarea,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconPlus, IconTrash, IconLink, IconLinkOff } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

const INSIGHT_TYPES = [
  { value: "PAIN_POINT", label: "Pain point" },
  { value: "OPPORTUNITY", label: "Opportunity" },
  { value: "FEEDBACK", label: "Feedback" },
  { value: "PERSONA", label: "Persona" },
  { value: "JOURNEY", label: "Journey" },
  { value: "OBSERVATION", label: "Observation" },
  { value: "COMPETITIVE", label: "Competitive" },
];

const INSIGHT_TYPE_COLORS: Record<string, string> = {
  PAIN_POINT: "red",
  OPPORTUNITY: "teal",
  FEEDBACK: "blue",
  PERSONA: "grape",
  JOURNEY: "cyan",
  OBSERVATION: "orange",
  COMPETITIVE: "indigo",
};

type InsightType = "PAIN_POINT" | "OPPORTUNITY" | "FEEDBACK" | "PERSONA" | "JOURNEY" | "OBSERVATION" | "COMPETITIVE";

export default function ResearchDetailPage() {
  const router = useRouter();
  const params = useParams();
  const researchId = params.researchId as string;
  const productSlug = params.productSlug as string;
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const { data: research, isLoading } = api.product.research.getById.useQuery(
    { id: researchId },
    { enabled: !!researchId },
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId: research?.product.id ?? "" },
    { enabled: !!research?.product.id },
  );

  const [insightType, setInsightType] = useState<InsightType>("PAIN_POINT");
  const [insightDescription, setInsightDescription] = useState("");
  const [linkTargets, setLinkTargets] = useState<Record<string, string | null>>(
    {},
  );

  const addInsight = api.product.research.addInsight.useMutation({
    onSuccess: async () => {
      setInsightDescription("");
      await utils.product.research.getById.invalidate({ id: researchId });
    },
  });

  const deleteInsight = api.product.research.deleteInsight.useMutation({
    onSuccess: async () => {
      await utils.product.research.getById.invalidate({ id: researchId });
    },
  });

  const linkInsight = api.product.research.linkInsightToFeature.useMutation({
    onSuccess: async () => {
      await utils.product.research.getById.invalidate({ id: researchId });
    },
  });

  const unlinkInsight = api.product.research.unlinkInsightFromFeature.useMutation({
    onSuccess: async () => {
      await utils.product.research.getById.invalidate({ id: researchId });
    },
  });

  const deleteResearch = api.product.research.delete.useMutation({
    onSuccess: async () => {
      if (research?.product.id) {
        await utils.product.research.list.invalidate({
          productId: research.product.id,
        });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products/${productSlug}/research`);
      }
    },
  });

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={40} width={300} />
        <Skeleton height={200} />
      </Stack>
    );
  }
  if (!research)
    return <Text className="text-text-muted">Research not found</Text>;

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete research",
      children: (
        <Text size="sm">
          This will permanently delete this research and all its insights.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteResearch.mutate({ id: researchId }),
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2} className="text-text-primary">
              {research.title}
            </Title>
            <Badge variant="light">
              {research.type.toLowerCase().replace("_", " ")}
            </Badge>
          </Group>
          {research.conductedAt && (
            <Text size="sm" className="text-text-muted mt-1">
              Conducted: {new Date(research.conductedAt).toLocaleDateString()}
            </Text>
          )}
          {research.participants && (
            <Text size="sm" className="text-text-muted">
              Participants: {research.participants}
            </Text>
          )}
        </div>
        <Button color="red" variant="outline" onClick={onDelete}>
          Delete
        </Button>
      </Group>

      {research.notes && (
        <Card className="border border-border-primary bg-surface-secondary">
          <Text className="text-text-primary whitespace-pre-wrap">
            {research.notes}
          </Text>
        </Card>
      )}

      {/* Insights */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="sm">
          <Title order={5} className="text-text-primary">
            Insights
          </Title>
          {research.insights.length === 0 ? (
            <Text size="sm" className="text-text-muted italic">
              No insights captured yet.
            </Text>
          ) : (
            <Stack gap="sm">
              {research.insights.map((insight) => (
                <Card
                  key={insight.id}
                  className="border border-border-primary bg-background-primary"
                >
                  <Group justify="space-between" align="flex-start">
                    <div className="flex-1">
                      <Group gap="xs">
                        <Badge
                          size="sm"
                          color={INSIGHT_TYPE_COLORS[insight.type] ?? "gray"}
                          variant="light"
                        >
                          {insight.type.toLowerCase().replace("_", " ")}
                        </Badge>
                        <Badge size="sm" variant="outline">
                          {insight.status.toLowerCase()}
                        </Badge>
                      </Group>
                      <Text size="sm" className="text-text-primary mt-1">
                        {insight.description}
                      </Text>
                      {insight.features.length > 0 && (
                        <Stack gap={4} mt="xs">
                          {insight.features.map((link) => (
                            <Group key={link.feature.id} gap="xs">
                              <IconLink size={12} className="text-text-muted" />
                              <Text size="xs" className="text-text-muted">
                                Linked to:{" "}
                                <span className="text-text-primary">
                                  {link.feature.name}
                                </span>
                              </Text>
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() =>
                                  unlinkInsight.mutate({
                                    insightId: insight.id,
                                    featureId: link.feature.id,
                                  })
                                }
                              >
                                <IconLinkOff size={12} />
                              </ActionIcon>
                            </Group>
                          ))}
                        </Stack>
                      )}
                      {/* Link to feature */}
                      <Group gap="xs" mt="xs" align="flex-end">
                        <Select
                          size="xs"
                          placeholder="Link to feature..."
                          clearable
                          searchable
                          data={
                            features?.map((f) => ({
                              value: f.id,
                              label: f.name,
                            })) ?? []
                          }
                          value={linkTargets[insight.id] ?? null}
                          onChange={(v) =>
                            setLinkTargets((prev) => ({
                              ...prev,
                              [insight.id]: v,
                            }))
                          }
                          style={{ minWidth: 220 }}
                        />
                        <Button
                          size="xs"
                          disabled={!linkTargets[insight.id]}
                          onClick={() => {
                            const featureId = linkTargets[insight.id];
                            if (!featureId) return;
                            linkInsight.mutate({
                              insightId: insight.id,
                              featureId,
                            });
                            setLinkTargets((prev) => ({
                              ...prev,
                              [insight.id]: null,
                            }));
                          }}
                        >
                          Link
                        </Button>
                      </Group>
                    </div>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => deleteInsight.mutate({ id: insight.id })}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}

          {/* Add insight form */}
          <Card className="border border-border-primary bg-background-primary">
            <Stack gap="xs">
              <Text size="sm" fw={500} className="text-text-primary">
                Add insight
              </Text>
              <Group grow>
                <Select
                  size="xs"
                  data={INSIGHT_TYPES}
                  value={insightType}
                  onChange={(v) => v && setInsightType(v as InsightType)}
                />
              </Group>
              <Textarea
                size="xs"
                placeholder="Describe the pain point, wish, or opportunity..."
                value={insightDescription}
                onChange={(e) => setInsightDescription(e.currentTarget.value)}
                autosize
                minRows={2}
              />
              <Group justify="flex-end">
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={() =>
                    addInsight.mutate({
                      researchId,
                      type: insightType,
                      description: insightDescription.trim(),
                    })
                  }
                  loading={addInsight.isPending}
                  disabled={!insightDescription.trim()}
                >
                  Add insight
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>
      </Card>
    </Stack>
  );
}
