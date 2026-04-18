"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

export default function NewRetrospectivePage() {
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const [title, setTitle] = useState("");
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [coversFromDate, setCoversFromDate] = useState<Date | null>(null);
  const [coversToDate, setCoversToDate] = useState<Date | null>(null);
  const [conductedAt, setConductedAt] = useState<Date | null>(null);
  const [participants, setParticipants] = useState("");
  const [wentWell, setWentWell] = useState("");
  const [wentPoorly, setWentPoorly] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createRetro = api.product.retrospective.create.useMutation({
    onSuccess: async (retro) => {
      if (workspaceId) {
        await utils.product.retrospective.list.invalidate({ workspaceId });
      }
      if (workspace) {
        router.push(
          `/w/${workspace.slug}/products/${productSlug}/retrospectives/${retro.id}`,
        );
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!workspace || !workspaceId) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createRetro.mutate({
      workspaceId,
      productId: product?.id,
      cycleId: cycleId ?? undefined,
      title: title.trim(),
      coversFromDate: coversFromDate ?? undefined,
      coversToDate: coversToDate ?? undefined,
      conductedAt: conductedAt ?? undefined,
      participants: participants.trim() || undefined,
      wentWell: wentWell.trim() || undefined,
      wentPoorly: wentPoorly.trim() || undefined,
      actionItems: actionItems.trim() || undefined,
    });
  };

  return (
    <Stack gap="lg" maw={800}>
      <div>
        <Title order={2} className="text-text-primary">
          New retrospective
        </Title>
      </div>

      <Card className="border border-border-primary bg-surface-secondary">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <TextInput
              label="Title"
              placeholder="e.g. Sprint 12 retro"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              required
              maxLength={300}
            />
            <Group grow>
              <Select
                label="Linked cycle (optional)"
                clearable
                data={
                  cycles?.map((c) => ({ value: c.id, label: c.name })) ?? []
                }
                value={cycleId}
                onChange={setCycleId}
              />
              <DateInput
                label="Conducted at"
                value={conductedAt}
                onChange={(v) =>
                  setConductedAt(
                    v ? (typeof v === "string" ? new Date(v) : v) : null,
                  )
                }
                clearable
              />
            </Group>
            <Group grow>
              <DateInput
                label="Covers from"
                value={coversFromDate}
                onChange={(v) =>
                  setCoversFromDate(
                    v ? (typeof v === "string" ? new Date(v) : v) : null,
                  )
                }
                clearable
              />
              <DateInput
                label="Covers to"
                value={coversToDate}
                onChange={(v) =>
                  setCoversToDate(
                    v ? (typeof v === "string" ? new Date(v) : v) : null,
                  )
                }
                clearable
              />
            </Group>
            <TextInput
              label="Participants"
              value={participants}
              onChange={(e) => setParticipants(e.currentTarget.value)}
            />
            <Textarea
              label="What went well"
              value={wentWell}
              onChange={(e) => setWentWell(e.currentTarget.value)}
              autosize
              minRows={3}
            />
            <Textarea
              label="What went poorly"
              value={wentPoorly}
              onChange={(e) => setWentPoorly(e.currentTarget.value)}
              autosize
              minRows={3}
            />
            <Textarea
              label="Action items"
              value={actionItems}
              onChange={(e) => setActionItems(e.currentTarget.value)}
              autosize
              minRows={3}
            />
            {error && (
              <Text size="sm" className="text-text-error">
                {error}
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                variant="subtle"
                component={Link}
                href={`/w/${workspace.slug}/products/${productSlug}/retrospectives`}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="brand"
                loading={createRetro.isPending}
                disabled={!title.trim()}
              >
                Create retrospective
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
