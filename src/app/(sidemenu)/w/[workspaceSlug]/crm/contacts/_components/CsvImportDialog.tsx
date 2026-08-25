"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  Modal,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconFileSpreadsheet,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  CONTACT_CSV_TARGETS,
  parseCsv,
  suggestTarget,
  type CsvColumnMapping,
  type ParsedCsv,
} from "~/lib/contactCsvImport";

interface CsvImportDialogProps {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
}

type ImportStep = "upload" | "mapping" | "progress" | "success";

/**
 * Rows per importFromCsv call. Each chunk is processed synchronously inside
 * one request (~2 queries per row), so this keeps a call to a few seconds —
 * background processing doesn't survive serverless, so the client drives the
 * whole import chunk by chunk.
 */
const IMPORT_CHUNK_SIZE = 100;

interface ImportProgress {
  processed: number;
  total: number;
  created: number;
  updated: number;
  errorCount: number;
  errors: string[];
}

const TARGET_OPTIONS = CONTACT_CSV_TARGETS.map((t) => ({
  value: t.value,
  label: t.label,
}));

/** First non-empty cell of a column, for the mapping table's preview. */
function sampleValue(parsed: ParsedCsv, columnIndex: number): string {
  for (const row of parsed.rows.slice(0, 20)) {
    const cell = (row[columnIndex] ?? "").trim();
    if (cell !== "") return cell;
  }
  return "";
}

export function CsvImportDialog({
  opened,
  onClose,
  workspaceId,
}: CsvImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Where to pick the chunk loop back up: the server batch (created by the
  // first chunk) and the next unsent row. Lets "Retry" resume after a failed
  // chunk instead of re-importing from row 0.
  const resumeRef = useRef<{ batchId: string | null; offset: number }>({
    batchId: null,
    offset: 0,
  });

  const hasDealColumn = Object.values(mapping).includes("dealValue");
  const emailColumnCount = Object.values(mapping).filter(
    (t) => t === "email",
  ).length;

  // Pipelines (with their stages) for the deal destination pickers.
  const { data: pipelines } = api.pipeline.list.useQuery(
    { workspaceId },
    { enabled: opened && hasDealColumn },
  );

  // Default the destination to the first pipeline's "won" stage — imported
  // revenue is money already collected, not an open opportunity.
  useEffect(() => {
    if (!hasDealColumn || !pipelines || pipelines.length === 0) return;
    const pipeline =
      pipelines.find((p) => p.id === pipelineId) ?? pipelines[0]!;
    if (pipelineId !== pipeline.id) setPipelineId(pipeline.id);
    const stages = pipeline.pipelineStages;
    if (!stages.some((s) => s.id === stageId)) {
      const fallback = stages.find((s) => s.type === "won") ?? stages[0];
      setStageId(fallback?.id ?? null);
    }
  }, [hasDealColumn, pipelines, pipelineId, stageId]);

  const importMutation = api.crmContact.importFromCsv.useMutation();

  // Send the file chunk by chunk, sequentially; each response carries the
  // batch's cumulative counters. Continues from resumeRef, so calling it
  // again after a failed chunk resumes rather than restarts.
  const runImport = async () => {
    if (!parsed) return;
    setStep("progress");
    setImportError(null);
    const rows = parsed.rows;
    const dealConfig =
      hasDealColumn && pipelineId && stageId ? { pipelineId, stageId } : null;
    try {
      while (resumeRef.current.offset < rows.length) {
        const offset = resumeRef.current.offset;
        const chunk = rows.slice(offset, offset + IMPORT_CHUNK_SIZE);
        const result = await importMutation.mutateAsync({
          workspaceId,
          batchId: resumeRef.current.batchId,
          totalRows: rows.length,
          headers: parsed.headers,
          rows: chunk,
          rowOffset: offset,
          mapping,
          dealConfig,
        });
        resumeRef.current = {
          batchId: result.batchId,
          offset: offset + chunk.length,
        };
        setProgress({
          processed: result.processedContacts,
          total: rows.length,
          created: result.newContacts,
          updated: result.updatedContacts,
          errorCount: result.errorCount,
          errors: result.errors,
        });
      }
      setStep("success");
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "The import was interrupted",
      );
    }
  };

  const handleFile = (selected: File | null) => {
    setFile(selected);
    setParseError(null);
    if (!selected) return;
    selected
      .text()
      .then((text) => {
        const result = parseCsv(text);
        if (result.rows.length === 0) {
          setParseError("The file has no data rows below the header.");
          return;
        }
        setParsed(result);
        const suggested: CsvColumnMapping = {};
        for (const header of result.headers) {
          suggested[header] = suggestTarget(header);
        }
        setMapping(suggested);
        setStep("mapping");
      })
      .catch((error: unknown) => {
        setParseError(
          error instanceof Error ? error.message : "Could not read the file",
        );
      });
  };

  const handleClose = () => {
    setStep("upload");
    setFile(null);
    setParseError(null);
    setParsed(null);
    setMapping({});
    setPipelineId(null);
    setStageId(null);
    setProgress(null);
    setImportError(null);
    resumeRef.current = { batchId: null, offset: 0 };
    onClose();
  };

  const handleStartImport = () => {
    resumeRef.current = { batchId: null, offset: 0 };
    setProgress(null);
    void runImport();
  };

  const canStart =
    emailColumnCount === 1 && (!hasDealColumn || (pipelineId && stageId));

  const progressPercentage =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  const selectedPipeline = pipelines?.find((p) => p.id === pipelineId);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import Contacts from CSV"
      size="xl"
      closeOnClickOutside={step !== "progress" || importError !== null}
      closeOnEscape={step !== "progress" || importError !== null}
    >
      <Stack gap="lg">
        {step === "upload" && (
          <>
            <Text size="sm" c="dimmed">
              Upload a CSV file with one row per contact. You&apos;ll map its
              columns to contact fields in the next step. Contacts are matched
              by email, so re-importing the same file is safe.
            </Text>
            <FileInput
              label="CSV file"
              placeholder="Choose a .csv file"
              accept=".csv,text/csv"
              leftSection={<IconFileSpreadsheet size={16} />}
              value={file}
              onChange={handleFile}
            />
            {parseError && (
              <Alert icon={<IconAlertCircle />} color="red">
                {parseError}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={handleClose}>
                Cancel
              </Button>
            </Group>
          </>
        )}

        {step === "mapping" && parsed && (
          <>
            <Text size="sm" c="dimmed">
              {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}{" "}
              found. Choose where each column should go. Columns set to
              &quot;Keep as imported data&quot; are stored on the contact under
              their original column name.
            </Text>

            <Table.ScrollContainer minWidth={560} mah={360}>
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>CSV column</Table.Th>
                    <Table.Th>Example value</Table.Th>
                    <Table.Th>Import as</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {parsed.headers.map((header, i) => (
                    <Table.Tr key={header}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {header}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed" truncate maw={180}>
                          {sampleValue(parsed, i)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          data={TARGET_OPTIONS}
                          value={mapping[header] ?? "skip"}
                          onChange={(value) => {
                            const target = CONTACT_CSV_TARGETS.find(
                              (t) => t.value === value,
                            )?.value;
                            setMapping((prev) => ({
                              ...prev,
                              [header]: target ?? "skip",
                            }));
                          }}
                          allowDeselect={false}
                          searchable
                          size="xs"
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {emailColumnCount !== 1 && (
              <Alert icon={<IconAlertCircle />} color="yellow">
                {emailColumnCount === 0
                  ? "Map one column to Email — it's how contacts are matched and de-duplicated."
                  : "Only one column can be mapped to Email."}
              </Alert>
            )}

            {hasDealColumn && (
              <>
                <Divider label="Revenue → Deals" labelPosition="center" />
                <Text size="sm" c="dimmed">
                  Each contact with a revenue value gets a deal in the pipeline
                  and stage below (skipped if the contact already has a deal in
                  that pipeline).
                </Text>
                {pipelines && pipelines.length === 0 ? (
                  <Alert icon={<IconAlertCircle />} color="yellow">
                    This workspace has no pipeline yet. Create one under CRM →
                    Pipeline first, or set the revenue column to &quot;Keep as
                    imported data&quot;.
                  </Alert>
                ) : (
                  <Group grow>
                    <Select
                      label="Pipeline"
                      data={(pipelines ?? []).map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                      value={pipelineId}
                      onChange={(value) => {
                        setPipelineId(value);
                        setStageId(null);
                      }}
                      allowDeselect={false}
                    />
                    <Select
                      label="Stage"
                      data={(selectedPipeline?.pipelineStages ?? []).map(
                        (s) => ({ value: s.id, label: s.name }),
                      )}
                      value={stageId}
                      onChange={setStageId}
                      allowDeselect={false}
                    />
                  </Group>
                )}
              </>
            )}

            <Group justify="space-between" mt="md">
              <Button variant="subtle" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                onClick={handleStartImport}
                disabled={!canStart}
                loading={importMutation.isPending}
              >
                Import {parsed.rows.length} contact
                {parsed.rows.length === 1 ? "" : "s"}
              </Button>
            </Group>
          </>
        )}

        {step === "progress" && (
          <>
            <Text size="sm" c="dimmed">
              Importing your contacts... This may take a few minutes.
            </Text>

            <Stack gap="md">
              <div>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>
                    Progress
                  </Text>
                  <Text size="sm" c="dimmed">
                    {progress?.processed ?? 0} of{" "}
                    {progress?.total ?? parsed?.rows.length ?? 0} rows
                  </Text>
                </Group>
                <Progress
                  value={progressPercentage}
                  size="lg"
                  animated={importError === null}
                  striped
                />
              </div>

              <Paper p="md" withBorder>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm">Status:</Text>
                    <Badge
                      color={importError === null ? "blue" : "red"}
                      variant="light"
                    >
                      {importError === null ? "IN_PROGRESS" : "INTERRUPTED"}
                    </Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">New Contacts:</Text>
                    <Text size="sm" fw={500}>
                      {progress?.created ?? 0}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Updated Contacts:</Text>
                    <Text size="sm" fw={500}>
                      {progress?.updated ?? 0}
                    </Text>
                  </Group>
                  {(progress?.errorCount ?? 0) > 0 && (
                    <Group justify="space-between">
                      <Text size="sm" c="red">
                        Errors:
                      </Text>
                      <Text size="sm" fw={500} c="red">
                        {progress?.errorCount}
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Paper>

              {importError !== null ? (
                <Alert
                  icon={<IconAlertCircle />}
                  color="red"
                  title="Import interrupted"
                >
                  <Stack gap="xs" align="flex-start">
                    <Text size="sm">
                      {importError} — nothing was lost; Retry continues from
                      where it stopped.
                    </Text>
                    <Button size="xs" onClick={() => void runImport()}>
                      Retry
                    </Button>
                  </Stack>
                </Alert>
              ) : (
                <Alert icon={<IconAlertCircle />} color="blue">
                  Please keep this window open while importing. You can
                  continue working in other tabs.
                </Alert>
              )}
            </Stack>
          </>
        )}

        {step === "success" && (
          <>
            <Alert icon={<IconCheck />} color="green" title="Import Complete">
              Your contacts have been imported.
            </Alert>

            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Import Summary
                </Text>
                <Divider />
                <Group justify="space-between">
                  <Text size="sm">Rows Processed:</Text>
                  <Text size="sm" fw={500}>
                    {progress?.processed ?? 0}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="green">
                    New Contacts:
                  </Text>
                  <Text size="sm" fw={500} c="green">
                    {progress?.created ?? 0}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="blue">
                    Updated Contacts:
                  </Text>
                  <Text size="sm" fw={500} c="blue">
                    {progress?.updated ?? 0}
                  </Text>
                </Group>
                {(progress?.errorCount ?? 0) > 0 && (
                  <>
                    <Group justify="space-between">
                      <Text size="sm" c="red">
                        Rows Skipped:
                      </Text>
                      <Text size="sm" fw={500} c="red">
                        {progress?.errorCount}
                      </Text>
                    </Group>
                    {(progress?.errors.length ?? 0) > 0 && (
                      <Alert icon={<IconAlertCircle />} color="yellow" mt="xs">
                        <Stack gap={2}>
                          {progress?.errors.slice(0, 10).map((err) => (
                            <Text size="xs" key={err}>
                              {err}
                            </Text>
                          ))}
                          {(progress?.errorCount ?? 0) >
                            (progress?.errors.length ?? 0) && (
                            <Text size="xs" c="dimmed">
                              …and{" "}
                              {(progress?.errorCount ?? 0) -
                                (progress?.errors.length ?? 0)}{" "}
                              more
                            </Text>
                          )}
                        </Stack>
                      </Alert>
                    )}
                  </>
                )}
              </Stack>
            </Paper>

            <Button onClick={handleClose} fullWidth>
              Done
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}
