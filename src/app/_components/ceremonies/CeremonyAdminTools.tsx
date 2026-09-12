"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
} from "@mantine/core";
import { IconFileImport, IconLink } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api, type RouterOutputs } from "~/trpc/react";

type BackfillResult = RouterOutputs["ceremony"]["backfillAttachments"];

const whenFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

/**
 * Owner/admin tools on Settings → Ceremonies (ADR-0059): import definitions
 * from a JSON file (the template shape, keyed by slug) and backfill
 * attachments of existing recordings — dry run first, then commit.
 */
export function CeremonyAdminTools({ workspaceId }: { workspaceId: string }) {
  const utils = api.useUtils();
  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [backfill, setBackfill] = useState<BackfillResult | null>(null);

  const importDefinitions = api.ceremony.importDefinitions.useMutation({
    onSuccess: async (rows) => {
      const created = rows.filter((r) => r.action === "created").length;
      const updated = rows.length - created;
      const unresolved = rows.flatMap((r) => r.unresolved);
      notifications.show({
        title: "Definitions imported",
        message: `${created} created, ${updated} updated${unresolved.length ? `; unresolved names: ${Array.from(new Set(unresolved)).join(", ")}` : ""}.`,
        color: unresolved.length ? "yellow" : "green",
      });
      await utils.ceremony.list.invalidate();
      setImportOpen(false);
      setJsonText("");
    },
    onError: (e) => setImportError(e.message),
  });

  const runBackfill = api.ceremony.backfillAttachments.useMutation({
    onSuccess: async (result) => {
      setBackfill(result);
      if (!result.dryRun) {
        notifications.show({
          title: "Backfill committed",
          message: `${result.matched} of ${result.scanned} recordings attached.`,
          color: "green",
        });
        await Promise.all([utils.ceremony.list.invalidate(), utils.transcription.getAllTranscriptions.invalidate(), utils.transcription.getMeetingCards.invalidate()]);
      }
    },
    onError: (e) => notifications.show({ title: "Backfill failed", message: e.message, color: "red" }),
  });

  const submitImport = () => {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setImportError(`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    // Accept either a bare array or the fixture envelope { timezone, startsOn, definitions }.
    const envelope = Array.isArray(parsed) ? { definitions: parsed } : (parsed as Record<string, unknown>);
    const definitions = envelope.definitions;
    if (!Array.isArray(definitions) || definitions.length === 0) {
      setImportError('Expected a JSON array of definitions, or an object with a "definitions" array.');
      return;
    }
    importDefinitions.mutate({
      workspaceId,
      definitions: definitions as never,
      timezone: typeof envelope.timezone === "string" ? envelope.timezone : undefined,
      startsOn: typeof envelope.startsOn === "string" ? new Date(envelope.startsOn) : undefined,
    });
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    void file.text().then((t) => setJsonText(t));
  };

  return (
    <Paper withBorder radius="md" p="lg" data-testid="ceremony-admin-tools">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={600}>Import and backfill</Text>
            <Text size="xs" className="text-text-muted">
              Import definitions from a JSON file (the template shape, keyed by slug), then attach existing recordings
              to occurrences by title alias. Run the backfill as a dry run first and review the report.
            </Text>
          </div>
          <Group gap="xs">
            <Button variant="default" size="xs" leftSection={<IconFileImport size={14} />} onClick={() => setImportOpen(true)} data-testid="import-json">
              Import JSON
            </Button>
            <Button
              variant="default"
              size="xs"
              leftSection={<IconLink size={14} />}
              loading={runBackfill.isPending && runBackfill.variables?.dryRun !== false}
              onClick={() => runBackfill.mutate({ workspaceId, dryRun: true })}
              data-testid="backfill-dry-run"
            >
              Backfill (dry run)
            </Button>
          </Group>
        </Group>

        {backfill && (
          <Stack gap="xs" data-testid="backfill-report">
            <Group gap="xs">
              <Badge variant="light" color={backfill.dryRun ? "blue" : "green"}>
                {backfill.dryRun ? "Dry run" : "Committed"}
              </Badge>
              <Text size="sm">
                {backfill.matched} of {backfill.scanned} unattached recordings match
                {backfill.occurrencesCreated > 0 ? ` · ${backfill.occurrencesCreated} occurrences generated` : ""}
              </Text>
              {backfill.dryRun && backfill.matched > 0 && (
                <Button
                  size="xs"
                  loading={runBackfill.isPending && runBackfill.variables?.dryRun === false}
                  onClick={() => runBackfill.mutate({ workspaceId, dryRun: false })}
                  data-testid="backfill-commit"
                >
                  Commit {backfill.matched} attachment{backfill.matched === 1 ? "" : "s"}
                </Button>
              )}
            </Group>
            {backfill.rows.length > 0 && (
              <Table verticalSpacing={4} fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Recording</Table.Th>
                    <Table.Th>Anchor date</Table.Th>
                    <Table.Th>Ceremony</Table.Th>
                    <Table.Th>Occurrence</Table.Th>
                    <Table.Th>Reason</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {backfill.rows.map((r) => (
                    <Table.Tr key={r.meetingId} data-testid={`backfill-row-${r.meetingId}`}>
                      <Table.Td>{r.title ?? r.meetingId}</Table.Td>
                      <Table.Td>{new Date(r.anchorDate).toLocaleString(undefined, whenFmt)}</Table.Td>
                      <Table.Td>{r.ceremonyName ?? <span className="text-text-muted">—</span>}</Table.Td>
                      <Table.Td>
                        {r.scheduledStart ? new Date(r.scheduledStart).toLocaleString(undefined, whenFmt) : <span className="text-text-muted">—</span>}
                      </Table.Td>
                      <Table.Td className={r.occurrenceId ? "" : "text-text-muted"}>{r.reason}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        )}
      </Stack>

      <Modal opened={importOpen} onClose={() => setImportOpen(false)} title="Import ceremony definitions" size="lg" centered>
        <Stack gap="sm">
          <Text size="xs" className="text-text-muted">
            A JSON array of definitions, or an object with <code>timezone</code>, <code>startsOn</code> and a{" "}
            <code>definitions</code> array (see <code>scripts/fixtures/ceremonies-clear.json</code>). Definitions
            are matched by slug: existing ones are updated, new ones created. Owner and participant names resolve
            against workspace members.
          </Text>
          <FileInput label="From file" placeholder="ceremonies.json" accept="application/json" onChange={onFile} size="xs" clearable />
          <Textarea
            label="Or paste JSON"
            value={jsonText}
            onChange={(e) => setJsonText(e.currentTarget.value)}
            autosize
            minRows={8}
            maxRows={18}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
            data-testid="import-json-text"
          />
          {importError && (
            <Alert color="red" variant="light">
              {importError}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitImport} loading={importDefinitions.isPending} disabled={!jsonText.trim()} data-testid="import-json-submit">
              Import
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
