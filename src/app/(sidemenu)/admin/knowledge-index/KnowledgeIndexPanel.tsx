"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconDatabase,
  IconFileText,
  IconLink,
  IconMicrophone,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

/** Small batches keep each request well inside the serverless time limit. */
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 500;
/** Stays under the server's 10,000-id cap on `excludeIds`. */
const MAX_EXCLUDED_IDS = 9_000;

interface StatCardProps {
  title: string;
  value: number | undefined;
  detail?: string;
  icon: React.ReactNode;
  isLoading: boolean;
}

function StatCard({ title, value, detail, icon, isLoading }: StatCardProps) {
  return (
    <Card className="border border-border-primary bg-surface-secondary">
      <div className="flex items-center gap-4">
        <div className="rounded-lg bg-background-primary p-3 text-text-muted">
          {icon}
        </div>
        <div>
          <Text size="sm" className="text-text-muted">
            {title}
          </Text>
          {isLoading ? (
            <Skeleton height={28} width={60} mt={4} />
          ) : (
            <Title order={3} className="text-text-primary">
              {value?.toLocaleString() ?? 0}
            </Title>
          )}
          {detail && !isLoading && (
            <Text size="xs" className="text-text-muted">
              {detail}
            </Text>
          )}
        </div>
      </div>
    </Card>
  );
}

interface BackfillProgress {
  isRunning: boolean;
  stopRequested: boolean;
  indexed: number;
  empty: number;
  failed: number;
  remaining: number | null;
  stopReason: string | null;
  error: string | null;
}

const IDLE_PROGRESS: BackfillProgress = {
  isRunning: false,
  stopRequested: false,
  indexed: 0,
  empty: 0,
  failed: 0,
  remaining: null,
  stopReason: null,
  error: null,
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function KnowledgeIndexPanel() {
  const utils = api.useUtils();
  const { data: stats, isLoading } = api.admin.getKnowledgeIndexStats.useQuery();
  const backfill = api.admin.backfillKnowledgeIndex.useMutation();

  const [progress, setProgress] = useState<BackfillProgress>(IDLE_PROGRESS);
  const stopRef = useRef(false);
  // Set synchronously on entry: `progress.isRunning` only flips after a
  // re-render, so a quick double-click could otherwise start two loops that
  // embed the same rows twice.
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  // Stop the loop if the admin navigates away mid-run, and stop touching
  // state once the panel is gone.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRef.current = true;
    };
  }, []);

  const updateProgress = (update: (prev: BackfillProgress) => BackfillProgress) => {
    if (mountedRef.current) setProgress(update);
  };

  const runBackfill = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    stopRef.current = false;
    setProgress({ ...IDLE_PROGRESS, isRunning: true });

    // Rows that failed or produced no chunks still match "pending", so they are
    // sent back as excludeIds to stop the loop retrying them forever. Rows that
    // indexed drop out of the server query on their own.
    const excludeIds: string[] = [];
    // The only way out of the while-condition is the Stop button (or leaving
    // the page, where nothing is shown); every other exit sets its own reason.
    let stopReason = "Stopped by you";

    try {
      while (!stopRef.current) {
        const result = await backfill.mutateAsync({ limit: BATCH_SIZE, excludeIds });
        for (const item of result.results) {
          if (item.error !== undefined || item.chunkCount === 0) excludeIds.push(item.id);
        }

        // Live counters come from the batch result; the stats query (several
        // full-table aggregates) is refreshed once, when the run ends.
        updateProgress((prev) => ({
          ...prev,
          indexed: prev.indexed + result.successful,
          empty: prev.empty + result.empty,
          failed: prev.failed + result.failed,
          remaining: result.remaining,
        }));

        if (result.attemptedIds.length === 0 || result.remaining === 0) {
          stopReason = "Finished: nothing left to index";
          break;
        }
        // The server caps excludeIds; stop cleanly rather than have the next
        // request rejected mid-run.
        if (excludeIds.length >= MAX_EXCLUDED_IDS) {
          stopReason = "Stopped: too many meetings could not be indexed";
          break;
        }
        await wait(BATCH_DELAY_MS);
      }
      updateProgress((prev) => ({ ...prev, isRunning: false, stopReason }));
    } catch (error) {
      updateProgress((prev) => ({
        ...prev,
        isRunning: false,
        stopReason: "Stopped on error",
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    } finally {
      runningRef.current = false;
      // Fire-and-forget: a refetch aborted by unmounting must not surface as
      // an unhandled rejection from the void-ed run.
      if (mountedRef.current) {
        void utils.admin.getKnowledgeIndexStats.invalidate().catch(() => undefined);
      }
    }
  };

  const stopBackfill = () => {
    stopRef.current = true;
    setProgress((prev) => ({ ...prev, stopRequested: true }));
  };

  const transcriptions = stats?.transcriptions;
  const resources = stats?.resources;
  const indexablePending =
    (transcriptions?.pending ?? 0) - (transcriptions?.pendingWithoutOwner ?? 0);
  const attempted = progress.indexed + progress.empty + progress.failed;
  const progressTotal = attempted + (progress.remaining ?? 0);
  const progressPercent = progressTotal > 0 ? (attempted / progressTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <Title order={2} className="text-text-primary">
          Knowledge index
        </Title>
        <Text className="text-text-muted">
          Embedding coverage across all users and workspaces
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard
          title="Meetings indexed"
          value={transcriptions?.indexed}
          detail={`of ${(transcriptions?.total ?? 0).toLocaleString()} with a transcript`}
          icon={<IconMicrophone size={24} />}
          isLoading={isLoading}
        />
        <StatCard
          title="Meetings pending"
          value={transcriptions?.pending}
          detail={
            (transcriptions?.pendingWithoutOwner ?? 0) > 0
              ? `${transcriptions?.pendingWithoutOwner.toLocaleString()} have no owner and can't be indexed`
              : undefined
          }
          icon={<IconFileText size={24} />}
          isLoading={isLoading}
        />
        <StatCard
          title="Resources indexed"
          value={resources?.indexed}
          detail={`of ${(resources?.total ?? 0).toLocaleString()} with content, ${(resources?.pending ?? 0).toLocaleString()} pending`}
          icon={<IconLink size={24} />}
          isLoading={isLoading}
        />
        <StatCard
          title="Total chunks"
          value={stats?.totalChunks}
          detail={
            (stats?.orphanChunks ?? 0) > 0
              ? `${stats?.orphanChunks.toLocaleString()} orphaned (source deleted)`
              : "No orphan chunks"
          }
          icon={<IconDatabase size={24} />}
          isLoading={isLoading}
        />
      </SimpleGrid>

      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={4} className="text-text-primary">
                Index pending meetings
              </Title>
              <Text size="sm" className="text-text-muted">
                Embeds meetings that have a transcript but no chunks, newest first,{" "}
                {BATCH_SIZE} at a time. {indexablePending.toLocaleString()} can be indexed now.
              </Text>
            </div>
            {progress.isRunning ? (
              <Button
                variant="light"
                color="red"
                leftSection={<IconPlayerStop size={16} />}
                onClick={stopBackfill}
              >
                Stop
              </Button>
            ) : (
              <Button
                leftSection={<IconPlayerPlay size={16} />}
                onClick={() => void runBackfill()}
                disabled={isLoading || indexablePending <= 0}
              >
                Index pending meetings
              </Button>
            )}
          </Group>

          {(progress.isRunning || attempted > 0 || progress.stopReason) && (
            <Stack gap={4}>
              <Progress
                value={progressPercent}
                animated={progress.isRunning}
                size="sm"
              />
              <Text size="sm" className="text-text-secondary">
                {progress.indexed.toLocaleString()} indexed
                {progress.empty > 0 && `, ${progress.empty.toLocaleString()} produced no chunks`}
                {progress.failed > 0 && `, ${progress.failed.toLocaleString()} failed`}
                {progress.remaining !== null &&
                  `, ${progress.remaining.toLocaleString()} remaining`}
              </Text>
              <Text size="xs" className="text-text-muted">
                {progress.isRunning
                  ? progress.stopRequested
                    ? "Stopping after this batch…"
                    : "Running..."
                  : progress.stopReason}
              </Text>
            </Stack>
          )}

          {progress.error && (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
              title="Batch failed"
            >
              {progress.error}
            </Alert>
          )}
        </Stack>
      </Card>

      <Card className="border border-border-primary bg-surface-secondary">
        <Title order={4} className="mb-2 text-text-primary">
          Chunks by source type
        </Title>
        {isLoading ? (
          <Skeleton height={120} />
        ) : (stats?.chunksBySource.length ?? 0) === 0 ? (
          <Text size="sm" className="text-text-muted">
            No chunks yet
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Source type</Table.Th>
                <Table.Th>Chunks</Table.Th>
                <Table.Th>Sources</Table.Th>
                <Table.Th>Orphan chunks</Table.Th>
                <Table.Th>Orphan sources</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stats?.chunksBySource.map((row) => (
                <Table.Tr key={row.sourceType}>
                  <Table.Td>
                    <Text size="sm" className="font-mono text-text-primary">
                      {row.sourceType}
                    </Text>
                  </Table.Td>
                  <Table.Td>{row.chunks.toLocaleString()}</Table.Td>
                  <Table.Td>{row.sources.toLocaleString()}</Table.Td>
                  <Table.Td>{row.orphanChunks.toLocaleString()}</Table.Td>
                  <Table.Td>{row.orphanSources.toLocaleString()}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {((transcriptions?.chunkedWithoutText ?? 0) > 0 ||
          (resources?.chunkedWithoutText ?? 0) > 0) && (
          <Text size="xs" mt="sm" className="text-text-muted">
            Chunked but now empty: {(transcriptions?.chunkedWithoutText ?? 0).toLocaleString()}{" "}
            meetings, {(resources?.chunkedWithoutText ?? 0).toLocaleString()} resources.
          </Text>
        )}
      </Card>
    </div>
  );
}
