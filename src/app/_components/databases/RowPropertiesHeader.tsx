"use client";

import { useCallback, useMemo, useState } from "react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import type { PropertyValue } from "~/lib/databases/properties";
import type { PropertyDef } from "~/lib/databases/schema";
import { computedValue, displayValue } from "~/lib/databases/display";
import type { PickerUser } from "~/app/_components/shared/PersonPicker";
import { TextCell } from "./cells/TextCell";
import { CheckboxCell } from "./cells/CheckboxCell";
import { SelectCell } from "./cells/SelectCell";
import { DateCell } from "./cells/DateCell";
import { PersonCell } from "./cells/PersonCell";
import styles from "./DatabaseBlock.module.css";

const TEXT_EDITED = new Set(["text", "number", "url"]);
const READ_ONLY = new Set(["createdTime", "lastEditedTime", "createdBy", "relation"]);

export interface RowPropertiesRow {
  id: string;
  title: string;
  values: Record<string, PropertyValue | null>;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface RowPropertiesHeaderViewProps {
  properties: PropertyDef[];
  row: RowPropertiesRow;
  workspaceId: string | null;
  people: ReadonlyMap<string, PickerUser>;
  editable: boolean;
  onWrite: (propertyId: string, value: unknown) => void | Promise<void>;
  onCreateOption?: (def: PropertyDef, name: string) => Promise<string | null>;
}

/** One property's field: the same cell the table uses, laid out as a row of the header. */
function PropertyField({
  def,
  row,
  workspaceId,
  people,
  editable,
  onWrite,
  onCreateOption,
}: Omit<RowPropertiesHeaderViewProps, "properties"> & { def: PropertyDef }) {
  const [editing, setEditing] = useState(false);
  const raw = computedValue(def, row) ?? row.values[def.id];
  const canEdit = editable && !READ_ONLY.has(def.type);
  const text = displayValue(def, raw, { personName: (id) => people.get(id)?.name ?? people.get(id)?.email ?? undefined });

  let control: React.ReactNode;
  if (def.type === "checkbox") {
    control = (
      <CheckboxCell def={def} value={typeof raw === "boolean" ? raw : null} editable={canEdit} onCommit={(v) => void onWrite(def.id, v)} />
    );
  } else if (def.type === "select" || def.type === "multiSelect") {
    control = (
      <SelectCell
        def={def}
        value={typeof raw === "string" || Array.isArray(raw) ? raw : null}
        editable={canEdit}
        onCommit={(v) => void onWrite(def.id, v)}
        onCreateOption={onCreateOption ? (name) => onCreateOption(def, name) : undefined}
      />
    );
  } else if (def.type === "date") {
    control = <DateCell def={def} value={typeof raw === "string" ? raw : null} editable={canEdit} onCommit={(v) => void onWrite(def.id, v)} />;
  } else if (def.type === "person" || def.type === "createdBy") {
    control = (
      <PersonCell
        def={def}
        value={Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : null}
        workspaceId={workspaceId}
        people={people}
        editable={canEdit && def.type === "person"}
        onCommit={(v) => void onWrite(def.id, v)}
      />
    );
  } else if (TEXT_EDITED.has(def.type) && canEdit) {
    control = (
      <button
        type="button"
        className={styles.fieldButton}
        aria-label={editing ? undefined : `Edit ${def.name}`}
        onClick={() => setEditing(true)}
      >
        <TextCell
          def={def}
          value={typeof raw === "string" || typeof raw === "number" ? raw : null}
          display={text || "—"}
          editing={editing}
          onCommit={(v) => {
            setEditing(false);
            void onWrite(def.id, v);
          }}
          onCancel={() => setEditing(false)}
        />
      </button>
    );
  } else {
    control = <span className={text ? styles.cellText : styles.cellEmpty}>{text || "—"}</span>;
  }

  return (
    <div className={styles.field} data-property-id={def.id}>
      <span className={styles.fieldLabel}>{def.name}</span>
      <span className={styles.fieldValue}>{control}</span>
    </div>
  );
}

/**
 * A Row page's property header (ADR-0078 §3): every non-title property as a
 * label/value line above the prose, edited with the same cells the table
 * uses. The title is the page title, edited where every page's title is.
 */
export function RowPropertiesHeaderView({ properties, ...rest }: RowPropertiesHeaderViewProps) {
  const fields = properties.filter((p) => p.type !== "title");
  if (fields.length === 0) return null;
  return (
    <section className={styles.fields} aria-label="Properties" data-testid="row-properties">
      {fields.map((def) => (
        <PropertyField key={def.id} def={def} {...rest} />
      ))}
    </section>
  );
}

interface RowPropertiesHeaderProps {
  row: RowPropertiesRow;
  database: { id: string };
  workspaceId: string;
  editable: boolean;
}

/** The header wired to the database: reads the schema, writes through `database.updateRow`. */
export function RowPropertiesHeader({ row, database, workspaceId, editable }: RowPropertiesHeaderProps) {
  const utils = api.useUtils();
  const { data: definition } = api.database.get.useQuery({ id: database.id });
  const { data: members } = api.workspace.listMembers.useQuery({ workspaceId }, { staleTime: 60_000 });
  const updateRow = api.database.updateRow.useMutation();
  const updateProperty = api.database.updateProperty.useMutation();
  const people = useMemo(() => {
    const map = new Map<string, PickerUser>();
    for (const m of members ?? []) map.set(m.id, { id: m.id, name: m.name, email: m.email, image: m.image });
    return map;
  }, [members]);

  const onWrite = useCallback(
    async (propertyId: string, value: unknown) => {
      try {
        await updateRow.mutateAsync({ rowId: row.id, values: { [propertyId]: value } });
        await Promise.all([
          utils.page.get.invalidate({ id: row.id }),
          utils.database.listRows.invalidate({ id: database.id }),
        ]);
      } catch (error) {
        notifications.show({
          color: "red",
          title: "Not saved",
          message: error instanceof Error ? error.message : "The value was refused.",
        });
      }
    },
    [database.id, row.id, updateRow, utils],
  );

  const onCreateOption = useCallback(
    async (def: PropertyDef, name: string) => {
      try {
        const result = await updateProperty.mutateAsync({
          id: database.id,
          propertyId: def.id,
          options: [...(def.options ?? []), { name }],
        });
        await utils.database.get.invalidate({ id: database.id });
        return result.property.options?.find((o) => o.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null;
      } catch (error) {
        notifications.show({ color: "red", title: "Could not add the option", message: error instanceof Error ? error.message : "" });
        return null;
      }
    },
    [database.id, updateProperty, utils],
  );

  if (!definition) return null;
  return (
    <RowPropertiesHeaderView
      properties={definition.properties}
      row={row}
      workspaceId={workspaceId}
      people={people}
      editable={editable}
      onWrite={onWrite}
      onCreateOption={onCreateOption}
    />
  );
}
