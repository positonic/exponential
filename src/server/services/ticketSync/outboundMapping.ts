import type { TicketStatus } from "@prisma/client";
import {
  mapPoints,
  mapPriority,
  mapStatus,
  mapStatusToNotion,
  mapType,
} from "./mapping";
import type { SyncedFields, SyncedFieldKey } from "./merge";

/**
 * ticketSync/outboundMapping — the reverse of mapping.ts: a local `SyncedFields`
 * value → the Notion property write payload for a `pages.update` call.
 *
 * The guiding rule (ADR-0046, resolved during implementation): when a local
 * value has NO safe Notion counterpart — an unmapped status/priority/type with
 * no matching option in the target database — the field is SKIPPED with a
 * warning, never defaulted (that would corrupt the customer's Notion) and never
 * fatal to the job (the other fields still push). A bad outbound write reaches
 * a live customer workspace with no revert, so every field maps defensively.
 *
 * Relational fields (cycle, assignee) need async Notion lookups (page id by
 * cycle title, person id by email); the engine resolves those and appends them
 * to the payload. This module covers the synchronous scalar/select/label
 * fields only, and is pure — no Prisma, no Notion client.
 */

/** One property's shape from a Notion database schema (databases.retrieve). */
export interface NotionPropertySchema {
  type: string;
  /** Option names for select / status / multi_select properties. */
  options?: string[];
}

/** Notion database property schema, keyed by property NAME. */
export type NotionDbSchema = Record<string, NotionPropertySchema>;

/** Property-name overrides (mirrors the inbound adapter's PropertyNames). */
export interface OutboundPropertyNames {
  status: string;
  priority: string;
  type: string;
  effort: string;
  label: string;
  cycle: string;
  assignee: string;
}

export interface OutboundMapContext {
  schema: NotionDbSchema;
  propertyNames: OutboundPropertyNames;
  statusMap?: Record<string, TicketStatus> | null;
  /** The title property name (type "title") in the target database. */
  titleProperty: string | null;
  /** The status option currently on the page, for sticky-collapse. */
  currentRemoteStatusRaw: string | null;
}

export interface OutboundMapResult {
  /** The `properties` object to hand to pages.update. */
  properties: Record<string, unknown>;
  /** Field keys actually written to `properties`. */
  wrote: SyncedFieldKey[];
  /** Field keys deliberately skipped (no safe Notion counterpart). */
  skipped: SyncedFieldKey[];
  warnings: string[];
}

function optionsFor(
  schema: NotionDbSchema,
  property: string,
): { type: string; options: string[] } | null {
  const prop = schema[property];
  if (!prop) return null;
  return { type: prop.type, options: prop.options ?? [] };
}

/**
 * Build the Notion `properties` payload for the scalar/select/label subset of
 * an `applyToRemote` set. Cycle and assignee are handled by the engine
 * (they need async id lookups) and are ignored here.
 */
export function mapFieldsToNotion(
  applyToRemote: Partial<SyncedFields>,
  ctx: OutboundMapContext,
): OutboundMapResult {
  const properties: Record<string, unknown> = {};
  const wrote: SyncedFieldKey[] = [];
  const skipped: SyncedFieldKey[] = [];
  const warnings: string[] = [];

  const record = (key: SyncedFieldKey, name: string, value: unknown) => {
    properties[name] = value;
    wrote.push(key);
  };
  const skip = (key: SyncedFieldKey, reason: string) => {
    skipped.push(key);
    warnings.push(reason);
  };

  // ── title ────────────────────────────────────────────────────────────────
  if ("title" in applyToRemote) {
    if (ctx.titleProperty) {
      record("title", ctx.titleProperty, {
        title: [{ text: { content: applyToRemote.title ?? "" } }],
      });
    } else {
      skip("title", "no title property found in the Notion database");
    }
  }

  // ── status (sticky collapse) ───────────────────────────────────────────────
  if ("status" in applyToRemote) {
    const status = applyToRemote.status!;
    const meta = optionsFor(ctx.schema, ctx.propertyNames.status);
    const optionName = mapStatusToNotion(status, {
      statusMap: ctx.statusMap,
      currentRemoteRaw: ctx.currentRemoteStatusRaw,
      availableOptions: meta?.options,
    });
    if (optionName === null) {
      // null means either "already collapsed to this option" (no write needed)
      // or "no option maps to this status" — both are correctly a no-op write.
      // Distinguish so the run log names an unmapped status vs. a redundant one.
      const collapsed =
        ctx.currentRemoteStatusRaw !== null &&
        mapStatus(ctx.currentRemoteStatusRaw, ctx.statusMap).status === status;
      if (!collapsed) {
        skip(
          "status",
          `no Notion status option maps to "${status}" — status not pushed`,
        );
      }
      // collapsed → intentionally silent: nothing to write, nothing wrong.
    } else if (meta) {
      const payload =
        meta.type === "status"
          ? { status: { name: optionName } }
          : { select: { name: optionName } };
      record("status", ctx.propertyNames.status, payload);
    } else {
      skip("status", "the configured status property is missing in Notion");
    }
  }

  // ── priority ───────────────────────────────────────────────────────────────
  if ("priority" in applyToRemote) {
    const priority = applyToRemote.priority ?? null;
    const meta = optionsFor(ctx.schema, ctx.propertyNames.priority);
    if (!meta) {
      skip("priority", "the configured priority property is missing in Notion");
    } else if (meta.type === "number") {
      record("priority", ctx.propertyNames.priority, { number: priority });
    } else if (priority === null) {
      // Cleared locally → clear the select.
      record("priority", ctx.propertyNames.priority, { select: null });
    } else {
      const match = meta.options.find((o) => mapPriority(o) === priority);
      if (match) {
        record("priority", ctx.propertyNames.priority, { select: { name: match } });
      } else {
        skip(
          "priority",
          `no Notion priority option maps to ${priority} — priority not pushed`,
        );
      }
    }
  }

  // ── type ───────────────────────────────────────────────────────────────────
  if ("type" in applyToRemote) {
    const type = applyToRemote.type!;
    const meta = optionsFor(ctx.schema, ctx.propertyNames.type);
    if (!meta) {
      skip("type", "the configured type property is missing in Notion");
    } else if (meta.type === "number") {
      skip("type", "the Notion type property is a number — type not pushed");
    } else {
      const match = meta.options.find((o) => mapType(o) === type);
      if (match) {
        record("type", ctx.propertyNames.type, { select: { name: match } });
      } else {
        skip("type", `no Notion type option maps to "${type}" — type not pushed`);
      }
    }
  }

  // ── points / effort ────────────────────────────────────────────────────────
  if ("points" in applyToRemote) {
    const points = applyToRemote.points ?? null;
    const meta = optionsFor(ctx.schema, ctx.propertyNames.effort);
    if (!meta) {
      skip("points", "the configured effort property is missing in Notion");
    } else if (meta.type === "number") {
      record("points", ctx.propertyNames.effort, { number: points });
    } else if (points === null) {
      record("points", ctx.propertyNames.effort, { select: null });
    } else {
      const match = meta.options.find((o) => mapPoints(o) === points);
      if (match) {
        record("points", ctx.propertyNames.effort, { select: { name: match } });
      } else {
        skip(
          "points",
          `no Notion effort option maps to ${points} pts — points not pushed`,
        );
      }
    }
  }

  // ── labels (multi_select) ──────────────────────────────────────────────────
  if ("labels" in applyToRemote) {
    const labels = applyToRemote.labels ?? [];
    const meta = optionsFor(ctx.schema, ctx.propertyNames.label);
    if (!meta) {
      skip("labels", "the configured label property is missing in Notion");
    } else if (meta.type === "multi_select") {
      // Notion creates unknown multi_select options on write — safe.
      record("labels", ctx.propertyNames.label, {
        multi_select: labels.map((name) => ({ name })),
      });
    } else {
      skip("labels", "the Notion label property is not multi_select — labels not pushed");
    }
  }

  return { properties, wrote, skipped, warnings };
}

/** Extract the title property name (type "title") from a Notion db schema. */
export function findTitleProperty(schema: NotionDbSchema): string | null {
  for (const [name, prop] of Object.entries(schema)) {
    if (prop.type === "title") return name;
  }
  return null;
}
