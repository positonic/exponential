"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

const STATUS_OPTIONS = [
  { value: "PLANNED", label: "Planned" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

type CycleStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export function CycleDetailClient() {
  const router = useRouter();
  const params = useParams();
  const cycleId = params.cycleId as string;
  const productSlug = params.productSlug as string;
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const { data: cycle, isLoading } = api.product.cycle.getById.useQuery(
    { id: cycleId },
    { enabled: !!cycleId },
  );

  const [status, setStatus] = useState<CycleStatus | null>(null);
  const [cycleGoal, setCycleGoal] = useState("");
  const [achievements, setAchievements] = useState("");

  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);

  useEffect(() => {
    if (cycle) {
      setStatus(cycle.status as CycleStatus);
      setCycleGoal(cycle.cycleGoal ?? "");
      setAchievements(cycle.achievements ?? "");
      setName(cycle.name);
      setStartDate(cycle.startDate ? new Date(cycle.startDate) : null);
      setEndDate(cycle.endDate ? new Date(cycle.endDate) : null);
    }
  }, [cycle]);

  const updateCycle = api.product.cycle.update.useMutation({
    onSuccess: async () => {
      await utils.product.cycle.getById.invalidate({ id: cycleId });
      if (cycle?.workspaceId) {
        await utils.product.cycle.list.invalidate({
          workspaceId: cycle.workspaceId,
        });
      }
    },
  });

  const updateHeader = api.product.cycle.update.useMutation({
    onSuccess: async () => {
      setHeaderError(null);
      setIsEditingHeader(false);
      await utils.product.cycle.getById.invalidate({ id: cycleId });
      if (cycle?.workspaceId) {
        await utils.product.cycle.list.invalidate({
          workspaceId: cycle.workspaceId,
        });
      }
    },
    onError: (err) => setHeaderError(err.message),
  });

  const deleteCycle = api.product.cycle.delete.useMutation({
    onSuccess: async () => {
      if (cycle?.workspaceId) {
        await utils.product.cycle.list.invalidate({
          workspaceId: cycle.workspaceId,
        });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products/${productSlug}/cycles`);
      }
    },
  });

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={40} width={300} />
        <Skeleton height={120} />
      </Stack>
    );
  }
  if (!cycle) return <Text className="text-text-muted">Cycle not found</Text>;

  const onSave = () => {
    updateCycle.mutate({
      id: cycleId,
      status: status ?? undefined,
      cycleGoal: cycleGoal.trim() || null,
      achievements: achievements.trim() || null,
    });
  };

  const onSaveHeader = () => {
    updateHeader.mutate({
      id: cycleId,
      name: name.trim(),
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    });
  };

  const onCancelHeader = () => {
    if (cycle) {
      setName(cycle.name);
      setStartDate(cycle.startDate ? new Date(cycle.startDate) : null);
      setEndDate(cycle.endDate ? new Date(cycle.endDate) : null);
    }
    setHeaderError(null);
    setIsEditingHeader(false);
  };

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete cycle",
      children: <Text size="sm">This will permanently delete the cycle.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteCycle.mutate({ id: cycleId }),
    });
  };

  const totalPoints = cycle.tickets.reduce(
    (sum, t) => sum + (t.points ?? 0),
    0,
  );
  const donePoints = cycle.tickets
    .filter((t) => t.status === "DONE")
    .reduce((sum, t) => sum + (t.points ?? 0), 0);

  // Only render the back link once the workspace has resolved — otherwise the
  // slug is undefined and the href becomes "/w/undefined/…" (a broken link).
  const backPath = workspace
    ? `/w/${workspace.slug}/products/${productSlug}/cycles`
    : null;

  return (
    <Stack gap="lg">
      {/* Back nav */}
      {backPath && (
        <Link
          href={backPath}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <IconArrowLeft size={14} />
          Cycles
        </Link>
      )}

      <Group justify="space-between" align="flex-start">
        {isEditingHeader ? (
          <Stack gap="sm" style={{ flex: 1 }} maw={520}>
            <TextInput
              label="Name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              maxLength={120}
              required
            />
            <Group grow>
              <DateInput
                label="Start date"
                value={startDate}
                onChange={(v) =>
                  setStartDate(
                    v ? (typeof v === "string" ? new Date(v) : v) : null,
                  )
                }
                clearable
              />
              <DateInput
                label="End date"
                value={endDate}
                onChange={(v) =>
                  setEndDate(
                    v ? (typeof v === "string" ? new Date(v) : v) : null,
                  )
                }
                clearable
              />
            </Group>
            {headerError && (
              <Text size="sm" className="text-text-error">
                {headerError}
              </Text>
            )}
            <Group>
              <Button
                size="sm"
                onClick={onSaveHeader}
                loading={updateHeader.isPending}
                disabled={!name.trim()}
              >
                Save
              </Button>
              <Button size="sm" variant="subtle" onClick={onCancelHeader}>
                Cancel
              </Button>
            </Group>
          </Stack>
        ) : (
          <div>
            <Group gap="xs" align="center">
              <Title order={2} className="text-text-primary">
                {cycle.name}
              </Title>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => setIsEditingHeader(true)}
              >
                Edit
              </Button>
            </Group>
            {(cycle.startDate ?? cycle.endDate) && (
              <Text size="sm" className="text-text-muted mt-1">
                {cycle.startDate
                  ? new Date(cycle.startDate).toLocaleDateString()
                  : "?"}
                {" - "}
                {cycle.endDate
                  ? new Date(cycle.endDate).toLocaleDateString()
                  : "?"}
              </Text>
            )}
          </div>
        )}
        <Group>
          <Select
            data={STATUS_OPTIONS}
            value={status}
            onChange={(v) => setStatus(v as CycleStatus)}
            w={160}
          />
          <Button color="red" variant="outline" onClick={onDelete}>
            Delete
          </Button>
        </Group>
      </Group>

      {/* Velocity summary */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Group gap="xl">
          <div>
            <Text size="xs" className="text-text-muted">
              Tickets
            </Text>
            <Title order={4} className="text-text-primary">
              {cycle.tickets.length}
            </Title>
          </div>
          <div>
            <Text size="xs" className="text-text-muted">
              Completed
            </Text>
            <Title order={4} className="text-text-primary">
              {cycle.tickets.filter((t) => t.status === "DONE").length}
            </Title>
          </div>
          <div>
            <Text size="xs" className="text-text-muted">
              Points
            </Text>
            <Title order={4} className="text-text-primary">
              {donePoints} / {totalPoints}
            </Title>
          </div>
        </Group>
      </Card>

      {/* Goal + achievements */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="sm">
          <Title order={5} className="text-text-primary">
            Cycle goal & achievements
          </Title>
          <Textarea
            label="Goal"
            placeholder="What we set out to do..."
            value={cycleGoal}
            onChange={(e) => setCycleGoal(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Textarea
            label="Achievements"
            placeholder="What actually shipped..."
            value={achievements}
            onChange={(e) => setAchievements(e.currentTarget.value)}
            autosize
            minRows={3}
          />
          <Group justify="flex-end">
            <Button
              size="sm"
              onClick={onSave}
              loading={updateCycle.isPending}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Tickets */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Title order={5} className="text-text-primary mb-2">
          Tickets in this cycle
        </Title>
        {cycle.tickets.length === 0 ? (
          <Text size="sm" className="text-text-muted italic">
            No tickets assigned yet. Assign tickets to this cycle from the ticket
            detail page.
          </Text>
        ) : (
          <Stack gap="xs">
            {cycle.tickets.map((t) => (
              <Card
                key={t.id}
                padding="sm"
                className="border border-border-primary bg-background-primary"
              >
                <Group justify="space-between">
                  <div>
                    <Text size="sm" className="text-text-primary">
                      {t.title}
                    </Text>
                    <Group gap="xs" mt={2}>
                      <Badge size="xs" variant="light">
                        {t.type.toLowerCase()}
                      </Badge>
                      <Badge size="xs" variant="outline">
                        {t.status.toLowerCase().replace("_", " ")}
                      </Badge>
                      {t.points !== null && t.points !== undefined && (
                        <Badge size="xs" variant="outline">
                          {t.points} pts
                        </Badge>
                      )}
                    </Group>
                  </div>
                  {t.assignee && (
                    <Text size="xs" className="text-text-muted">
                      @{t.assignee.name}
                    </Text>
                  )}
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
