"use client";

import { useCallback, useMemo, useState } from "react";
import { Alert, Button, FileInput, Group, Modal, Select, Stack, Table, Text, Textarea } from "@mantine/core";
import { IconAlertCircle, IconFileSpreadsheet } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import type { PropertyValue } from "~/lib/databases/properties";
import type { CsvCellError, CsvColumnTarget, CsvMapping } from "~/lib/databases/csv";
import { CSV_NEW_COLUMN_TYPES } from "~/lib/databases/csv";
import { displayValue } from "~/lib/databases/display";
import type { PropertyDef, PropertyType } from "~/lib/databases/schema";

/** What `database.previewCsv` returns, as the dialog reads it. */
export interface CsvPreviewData {
  headers: string[];
  mapping: CsvMapping;
  columns: { header: string; target: CsvColumnTarget; propertyName: string | null; type: PropertyType | null }[];
  rows: { index: number; title: string | undefined; values: Record<string, PropertyValue | null>; errors: CsvCellError[] }[];
  total: number;
  importable: number;
  newOptions: Record<string, string[]>;
}

const TYPE_LABELS: Partial<Record<PropertyType, string>> = {
  text: "Text",
  number: "Number",
  select: "Select",
  multiSelect: "Multi-select",
  date: "Date",
  checkbox: "Checkbox",
  url: "URL",
  person: "Person",
};

/** Rows the preview table shows; the counts cover the whole file. */
const PREVIEW_ROWS = 25;

/** Properties a CSV column may land on: not relations, not the read-only ones. */
function importable(properties: readonly PropertyDef[]): PropertyDef[] {
  return properties.filter(
    (p) => p.type !== "relation" && p.type !== "createdTime" && p.type !== "lastEditedTime" && p.type !== "createdBy",
  );
}

/** A target as the mapping Select encodes it. */
function encodeTarget(target: CsvColumnTarget): string {
  if (target.kind === "skip") return "skip";
  if (target.kind === "property") return `property:${target.propertyId}`;
  return `new:${target.type}`;
}

function decodeTarget(value: string, header: string): CsvColumnTarget {
  if (value === "skip") return { kind: "skip" };
  if (value.startsWith("property:")) return { kind: "property", propertyId: value.slice("property:".length) };
  return { kind: "new", name: header.trim(), type: value.slice("new:".length) as PropertyType };
}

export interface CsvImportDialogViewProps {
  opened: boolean;
  onClose: () => void;
  properties: PropertyDef[];
  csv: string;
  onCsvChange: (csv: string) => void;
  preview: CsvPreviewData | null;
  isPreviewing: boolean;
  previewError: string | null;
  onChangeMapping: (header: string, target: CsvColumnTarget) => void;
  onCommit: () => Promise<void> | void;
  committing: boolean;
}

/**
 * The import dialog (ADR-0078, V4): pick or paste a CSV, map each column to
 * a property — an existing one, a new one of a chosen type, or skipped —
 * and read the typed preview: every cell that does not fit is marked and
 * its row will be left out; the options a select column would add are
 * listed. Nothing is created until "Import".
 */
export function CsvImportDialogView({
  opened,
  onClose,
  properties,
  csv,
  onCsvChange,
  preview,
  isPreviewing,
  previewError,
  onChangeMapping,
  onCommit,
  committing,
}: CsvImportDialogViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const targets = importable(properties);
  const byId = new Map(properties.map((p) => [p.id, p]));
  const targetChoices = [
    { group: "Skip", items: [{ value: "skip", label: "Don't import" }] },
    { group: "Existing property", items: targets.map((p) => ({ value: `property:${p.id}`, label: p.name })) },
    {
      group: "New property",
      items: CSV_NEW_COLUMN_TYPES.map((t) => ({ value: `new:${t}`, label: `New ${TYPE_LABELS[t] ?? t}` })),
    },
  ];
  const shownColumns = preview?.columns.filter((c) => c.target.kind !== "skip") ?? [];
  const newOptionLines = Object.entries(preview?.newOptions ?? {}).map(([id, names]) => {
    const column = preview?.columns.find((c) =>
      c.target.kind === "property" ? c.target.propertyId === id : c.target.kind === "new" && `new:${c.target.name}` === id,
    );
    return `${column?.propertyName ?? id}: ${names.join(", ")}`;
  });

  const onFile = (selected: File | null) => {
    setFile(selected);
    if (!selected) return;
    void selected.text().then(onCsvChange);
  };

  const cellText = (column: CsvPreviewData["columns"][number], row: CsvPreviewData["rows"][number]) => {
    const error = row.errors.find((e) => e.header === column.header);
    if (error) return { text: error.reason, error: true };
    if (column.type === "title") return { text: row.title ?? "", error: false };
    const key = column.target.kind === "property" ? column.target.propertyId : column.target.kind === "new" ? `new:${column.target.name}` : "";
    const value = row.values[key];
    const def = column.target.kind === "property" ? byId.get(column.target.propertyId) : undefined;
    const text = def ? displayValue(def, value) : value === null || value === undefined ? "" : Array.isArray(value) ? value.join(", ") : String(value);
    return { text, error: false };
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Import a CSV"
      size="xl"
      closeOnClickOutside={!committing}
      closeOnEscape={!committing}
    >
      <Stack gap="sm">
        <Group align="flex-end" gap="sm">
          <FileInput
            label="File"
            placeholder="Choose a .csv"
            accept=".csv,text/csv"
            leftSection={<IconFileSpreadsheet size={16} />}
            value={file}
            onChange={onFile}
            className="flex-1"
            size="xs"
          />
        </Group>
        <Textarea
          label="Or paste CSV"
          aria-label="CSV text"
          size="xs"
          autosize
          minRows={2}
          maxRows={6}
          value={csv}
          onChange={(e) => onCsvChange(e.currentTarget.value)}
          placeholder={"Name,Status,Score\nAlert latency,Tracked,7"}
        />
        {previewError ? (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {previewError}
          </Alert>
        ) : null}
        {preview ? (
          <>
            <Text size="xs" fw={600} className="text-text-primary">
              Columns
            </Text>
            <Table verticalSpacing={4} withRowBorders={false}>
              <Table.Tbody>
                {preview.headers.map((header) => {
                  const target = preview.mapping[header] ?? { kind: "skip" };
                  return (
                    <Table.Tr key={header}>
                      <Table.Td className="w-1/3">
                        <Text size="sm">{header || <span className="text-text-muted">(blank header)</span>}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          aria-label={`Import ${header || "blank column"} as`}
                          data={targetChoices}
                          value={encodeTarget(target)}
                          allowDeselect={false}
                          comboboxProps={{ withinPortal: true }}
                          onChange={(next) => {
                            if (next) onChangeMapping(header, decodeTarget(next, header));
                          }}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            <Text size="xs" fw={600} className="text-text-primary" data-testid="csv-summary">
              {preview.importable} of {preview.total} row{preview.total === 1 ? "" : "s"} will be created
              {preview.total - preview.importable > 0 ? `; ${preview.total - preview.importable} left out for a cell that does not fit` : ""}
              {isPreviewing ? " (updating…)" : ""}
            </Text>
            {newOptionLines.length ? (
              <Text size="xs" className="text-text-secondary" data-testid="csv-new-options">
                Options the import will add — {newOptionLines.join(" · ")}
              </Text>
            ) : null}
            {shownColumns.length ? (
              <Table.ScrollContainer minWidth={480} mah={320}>
                <Table verticalSpacing={2} fz="xs" data-testid="csv-preview">
                  <Table.Thead>
                    <Table.Tr>
                      {shownColumns.map((c) => (
                        <Table.Th key={c.header}>{c.propertyName ?? c.header}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {preview.rows.slice(0, PREVIEW_ROWS).map((row) => (
                      <Table.Tr key={row.index} data-row-ok={row.errors.length === 0 ? "true" : "false"}>
                        {shownColumns.map((c) => {
                          const cell = cellText(c, row);
                          return (
                            <Table.Td key={c.header} className={cell.error ? "text-status-error" : row.errors.length ? "text-text-muted" : undefined}>
                              {cell.text}
                            </Table.Td>
                          );
                        })}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : null}
            {preview.rows.length > PREVIEW_ROWS ? (
              <Text size="xs" className="text-text-muted">
                Showing the first {PREVIEW_ROWS} of {preview.rows.length} rows.
              </Text>
            ) : null}
          </>
        ) : csv.trim() ? (
          <Text size="xs" className="text-text-muted">
            Reading…
          </Text>
        ) : null}

        <Group justify="flex-end" gap="sm">
          <Button size="xs" variant="subtle" onClick={onClose} disabled={committing}>
            Cancel
          </Button>
          <Button
            size="xs"
            loading={committing}
            disabled={!preview || preview.importable === 0 || isPreviewing}
            onClick={() => void onCommit()}
          >
            Import {preview?.importable ?? 0} row{preview?.importable === 1 ? "" : "s"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface CsvImportDialogProps {
  databaseId: string;
  properties: PropertyDef[];
  opened: boolean;
  onClose: () => void;
  /** After a commit: the block re-reads its schema and rows. */
  onImported: () => Promise<void> | void;
}

/** The dialog wired to `database.previewCsv` / `database.commitCsv`. */
export function CsvImportDialog({ databaseId, properties, opened, onClose, onImported }: CsvImportDialogProps) {
  const [csv, setCsv] = useState("");
  const [overrides, setOverrides] = useState<CsvMapping>({});
  const commit = api.database.commitCsv.useMutation();
  const hasCsv = csv.trim().length > 0;
  const mappingInput = useMemo(() => (Object.keys(overrides).length ? overrides : undefined), [overrides]);
  const previewQuery = api.database.previewCsv.useQuery(
    { id: databaseId, csv, ...(mappingInput ? { mapping: mappingInput } : {}) },
    { enabled: opened && hasCsv, retry: false, placeholderData: (prev) => prev },
  );
  const preview = (hasCsv ? previewQuery.data : undefined) ?? null;

  // The server suggests the first mapping; from then on the dialog sends the
  // whole mapping, so what it previews is what it commits.
  const onChangeMapping = useCallback(
    (header: string, target: CsvColumnTarget) => {
      setOverrides((prev) => ({ ...(preview?.mapping ?? {}), ...prev, [header]: target }));
    },
    [preview],
  );

  const reset = () => {
    setCsv("");
    setOverrides({});
  };

  const onCommit = async () => {
    if (!preview) return;
    try {
      const result = await commit.mutateAsync({ id: databaseId, csv, mapping: preview.mapping });
      notifications.show({
        color: "green",
        title: `Imported ${result.created.length} row${result.created.length === 1 ? "" : "s"}`,
        message: result.skipped.length
          ? `${result.skipped.length} left out for a cell that did not fit.`
          : result.properties.length
            ? `Added ${result.properties.map((p) => p.name).join(", ")}.`
            : undefined,
      });
      await onImported();
      reset();
      onClose();
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Import failed",
        message: error instanceof Error ? error.message : "Nothing was created.",
      });
    }
  };

  return (
    <CsvImportDialogView
      opened={opened}
      onClose={() => {
        reset();
        onClose();
      }}
      properties={properties}
      csv={csv}
      onCsvChange={(next) => {
        setCsv(next);
        setOverrides({});
      }}
      preview={preview}
      isPreviewing={previewQuery.isFetching}
      previewError={previewQuery.error?.message ?? null}
      onChangeMapping={onChangeMapping}
      onCommit={onCommit}
      committing={commit.isPending}
    />
  );
}
