"use client";

import { useParams, useRouter } from "next/navigation";
import {
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export default function RetrospectiveDetailPage() {
  const router = useRouter();
  const params = useParams();
  const retroId = params.retroId as string;
  const productSlug = params.productSlug as string;
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const { data: retro, isLoading } = api.product.retrospective.getById.useQuery(
    { id: retroId },
    { enabled: !!retroId },
  );

  const deleteRetro = api.product.retrospective.delete.useMutation({
    onSuccess: async () => {
      if (retro?.workspaceId) {
        await utils.product.retrospective.list.invalidate({
          workspaceId: retro.workspaceId,
        });
      }
      if (workspace) {
        router.push(
          `/w/${workspace.slug}/products/${productSlug}/retrospectives`,
        );
      }
    },
  });

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={40} width={300} />
        <Skeleton height={300} />
      </Stack>
    );
  }
  if (!retro) return <Text className="text-text-muted">Not found</Text>;

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete retrospective",
      children: <Text size="sm">This will permanently delete the retrospective.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteRetro.mutate({ id: retroId }),
    });
  };

  const Section = ({ title, content }: { title: string; content: string | null }) =>
    content ? (
      <Card className="border border-border-primary bg-surface-secondary">
        <Title order={5} className="text-text-primary mb-2">
          {title}
        </Title>
        <Text className="text-text-primary whitespace-pre-wrap">{content}</Text>
      </Card>
    ) : null;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} className="text-text-primary">
            {retro.title}
          </Title>
          <Stack gap={2} mt="xs">
            {retro.conductedAt && (
              <Text size="sm" className="text-text-muted">
                Conducted: {new Date(retro.conductedAt).toLocaleDateString()}
              </Text>
            )}
            {(retro.coversFromDate ?? retro.coversToDate) && (
              <Text size="sm" className="text-text-muted">
                Covers:{" "}
                {retro.coversFromDate
                  ? new Date(retro.coversFromDate).toLocaleDateString()
                  : "?"}
                {" - "}
                {retro.coversToDate
                  ? new Date(retro.coversToDate).toLocaleDateString()
                  : "?"}
              </Text>
            )}
            {retro.cycle && (
              <Text size="sm" className="text-text-muted">
                Cycle: <span className="text-text-primary">{retro.cycle.name}</span>
              </Text>
            )}
            {retro.participants && (
              <Text size="sm" className="text-text-muted">
                Participants: {retro.participants}
              </Text>
            )}
          </Stack>
        </div>
        <Button color="red" variant="outline" onClick={onDelete}>
          Delete
        </Button>
      </Group>

      <Section title="What went well" content={retro.wentWell} />
      <Section title="What went poorly" content={retro.wentPoorly} />
      <Section title="Action items" content={retro.actionItems} />
      <Section title="Notes" content={retro.notes} />
    </Stack>
  );
}
