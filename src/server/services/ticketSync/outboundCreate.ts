import type { NotionDbSchema } from "./outboundMapping";
import { markdownToNotionBlocks } from "./markdownBlocks";

/**
 * ticketSync/outboundCreate — pure builders for the outbound full-mirror
 * creation payload (ADR-0046): the "Source: Exponential" marker property, the
 * back-link URL property, and the page body rendered as Notion blocks.
 *
 * All defensive: a marker whose property is absent (or an incompatible type)
 * is skipped with a warning rather than failing the create — the sync record,
 * not the marker, is what stops the next inbound poll re-importing the row, so
 * a missing marker never breaks correctness. No Prisma, no Notion client.
 */

export const SOURCE_MARKER_VALUE = "Exponential";

/**
 * Leading text of the callout every sync-created page opens with. Exported so
 * the body-repair pass can recognise its own handiwork before deleting
 * anything — keep the two in lockstep by referencing this constant, never a
 * duplicated string literal.
 */
export const SYNC_CALLOUT_PREFIX = "Synced from Exponential";

/** Property names for the two creation markers (overridable per sync config). */
export interface CreateMarkerNames {
  source: string;
  backlink: string;
}

export const DEFAULT_CREATE_MARKER_NAMES: CreateMarkerNames = {
  source: "Source",
  backlink: "Exponential URL",
};

/**
 * Build the "Source: Exponential" property payload, if the database has a
 * compatible property. Supports select / multi_select / status / rich_text.
 * Returns a warning (and no property) when the property is missing or an
 * unusable type — the acceptance criterion's "clear actionable error rather
 * than failing opaquely".
 */
export function buildSourceProperty(
  schema: NotionDbSchema,
  name: string,
): { property?: Record<string, unknown>; warning?: string } {
  const prop = schema[name];
  if (!prop) {
    return {
      warning: `Notion database has no "${name}" property — row created without a source marker (add a Select or Text property named "${name}" to tag Exponential-created rows)`,
    };
  }
  switch (prop.type) {
    case "select":
      return { property: { [name]: { select: { name: SOURCE_MARKER_VALUE } } } };
    case "status":
      return { property: { [name]: { status: { name: SOURCE_MARKER_VALUE } } } };
    case "multi_select":
      return {
        property: { [name]: { multi_select: [{ name: SOURCE_MARKER_VALUE }] } },
      };
    case "rich_text":
      return {
        property: {
          [name]: { rich_text: [{ text: { content: SOURCE_MARKER_VALUE } }] },
        },
      };
    default:
      return {
        warning: `"${name}" property is type ${prop.type} — cannot set a source marker`,
      };
  }
}

/** Build the back-link URL property payload, if a url-typed property exists. */
export function buildBacklinkProperty(
  schema: NotionDbSchema,
  name: string,
  url: string,
): Record<string, unknown> | null {
  const prop = schema[name];
  if (prop?.type === "url") return { [name]: { url } };
  return null;
}

/**
 * Render the ticket body (Markdown) as Notion blocks, led by a callout linking
 * back to the Exponential ticket. The body is copied ONCE at creation
 * (ADR-0046: each side then owns its copy); ongoing Markdown ↔ block
 * round-tripping is explicitly out of scope. Rendering itself is real —
 * headings, code fences, lists, inline annotations — via markdownBlocks.ts.
 */
export function buildBodyBlocks(
  body: string | null,
  backlinkUrl: string,
): unknown[] {
  const blocks: unknown[] = [
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { emoji: "🔗" },
        rich_text: [
          {
            type: "text",
            text: {
              content: `${SYNC_CALLOUT_PREFIX} — edits here may be overwritten. `,
            },
          },
          {
            type: "text",
            text: { content: "Open ticket", link: { url: backlinkUrl } },
          },
        ],
      },
    },
  ];

  if (body) {
    // Ticket bodies are Markdown (ADR-0017) — render real Notion blocks
    // (ivory.pike). markdownToNotionBlocks never throws; malformed input
    // degrades to plain paragraphs.
    blocks.push(...markdownToNotionBlocks(body));
  }

  return blocks;
}
