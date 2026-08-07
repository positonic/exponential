import type {
  RemoteTicketRow,
  TicketSyncRemoteAdapter,
} from "../../engine";
import type { TicketPushAdapter } from "../../push";
import type { NotionDbSchema } from "../../outboundMapping";
import type { TestClock } from "./testClock";

/**
 * FakeNotion — one in-memory Notion database implementing BOTH sync adapter
 * seams ({@link TicketSyncRemoteAdapter} for the inbound engine and
 * {@link TicketPushAdapter} for the outbound push), mirroring the production
 * NotionTicketSyncAdapter which also implements both on one class.
 *
 * The point of a SHARED fake: pull and push in a test operate on the same page
 * store, so round-trip properties (quiescence, echo suppression, no ping-pong)
 * are exercised for real instead of against per-direction stubs. Pages track
 * `lastEditedAt` and who edited them — writes through the push adapter are
 * "bot" edits (surfaced as `lastEditedByBot` on query, which the engine's echo
 * suppression keys on); `editAsHuman()` simulates a person editing in Notion.
 *
 * Every adapter write is appended to {@link FakeNotion.writes} so tests can
 * assert zero-write quiescence precisely.
 */

export interface FakePage {
  externalId: string;
  url: string | null;
  title: string;
  rawStatus: string | null;
  rawPriority: string | null;
  rawType: string | null;
  rawEffort: string | null;
  labels: string[];
  cycleName: string | null;
  assigneeEmail: string | null;
  lastEditedAt: Date;
  lastEditedBy: "bot" | "human";
  archived: boolean;
  /**
   * Simulates the Cycles database not being shared with the connection: the
   * page still HAS a cycle (cycleName stays stored as hidden truth), but rows
   * emitted to the sync report cycleName null + cycleUnreadable, exactly like
   * the real adapter when the related page 403s. Flip back to false to
   * simulate access being granted — deliberately WITHOUT bumping
   * lastEditedAt, since self-healing must not require a re-edit.
   */
  cycleUnreadable?: boolean;
  /** Properties written by the sync that the fake has no column for. */
  extra: Record<string, unknown>;
  /** Body blocks passed to createPage, kept for assertions. */
  children: unknown[];
}

export interface NotionWrite {
  method: "updatePage" | "createPage" | "archivePage";
  externalId: string | null;
  properties?: Record<string, unknown>;
}

/** Raw option names for each TicketStatus, matching DEFAULT_STATUS_MAP. */
export const STATUS_TO_RAW: Record<string, string> = {
  BACKLOG: "Backlog",
  NEEDS_REFINEMENT: "Needs Refinement",
  READY_TO_PLAN: "Ready to Plan",
  COMMITTED: "Committed",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  QA: "In Review",
  DONE: "Done",
  DEPLOYED: "Shipped",
  ARCHIVED: "Archived",
};

export const TYPE_TO_RAW: Record<string, string> = {
  BUG: "Bug",
  FEATURE: "Feature",
  CHORE: "Chore",
  IMPROVEMENT: "Improvement",
  SPIKE: "Spike",
  RESEARCH: "Research",
};

export const PRIORITY_TO_RAW: Record<number, string> = {
  0: "0 - Critical",
  1: "1 - High",
  2: "2 - Medium",
  3: "3 - Low",
  4: "4 - Trivial",
};

export const POINTS_TO_RAW: Record<number, string> = {
  1: "S (1pt)",
  3: "M (3pts)",
  5: "L (5pts)",
  8: "XL (8pts)",
};

/**
 * A schema whose options round-trip through mapping.ts for every value the
 * raw-value tables above can produce — so outbound writes always find a
 * matching option unless a test deliberately narrows the schema.
 */
export const DEFAULT_FAKE_SCHEMA: NotionDbSchema = {
  Name: { type: "title" },
  Status: { type: "status", options: Object.values(STATUS_TO_RAW) },
  Priority: { type: "select", options: Object.values(PRIORITY_TO_RAW) },
  Type: { type: "select", options: Object.values(TYPE_TO_RAW) },
  Effort: { type: "select", options: Object.values(POINTS_TO_RAW) },
  Label: { type: "multi_select", options: [] },
  Cycles: { type: "relation" },
  Assignee: { type: "people" },
};

/** Property-name → page-column roles, mirroring the default config names. */
const DEFAULT_PROPERTY_NAMES = {
  status: "Status",
  priority: "Priority",
  type: "Type",
  effort: "Effort",
  label: "Label",
  cycle: "Cycles",
  assignee: "Assignee",
};

/** The payload shapes mapFieldsToNotion / the engine hand to pages.update. */
interface PropertyPayload {
  title?: Array<{ text: { content: string } }>;
  status?: { name?: string } | null;
  select?: { name?: string } | null;
  number?: number | null;
  multi_select?: Array<{ name: string }>;
  relation?: Array<{ id: string }>;
  people?: Array<{ id: string }>;
}

export class FakeNotion implements TicketSyncRemoteAdapter, TicketPushAdapter {
  readonly pages = new Map<string, FakePage>();
  readonly writes: NotionWrite[] = [];
  /** Set to make the next updatePage call throw (failure injection). */
  updatePageError: Error | null = null;

  /** Cycle relation pages: page id → cycle title. */
  readonly cyclePagesById = new Map<string, string>();
  /** Notion workspace people: email → person id. */
  readonly peopleByEmail = new Map<string, string>();

  private schema: NotionDbSchema;
  private readonly propertyNames = { ...DEFAULT_PROPERTY_NAMES };
  private pageCounter = 0;

  constructor(
    private readonly clock: TestClock,
    opts: { schema?: NotionDbSchema } = {},
  ) {
    this.schema = opts.schema ?? DEFAULT_FAKE_SCHEMA;
  }

  setSchema(schema: NotionDbSchema): void {
    this.schema = schema;
  }

  // ── seeding & simulated human activity ────────────────────────────────────

  seedPage(overrides: Partial<FakePage> = {}): FakePage {
    const id = overrides.externalId ?? `page-${++this.pageCounter}`;
    const page: FakePage = {
      externalId: id,
      url: `https://notion.so/${id}`,
      title: "Seeded row",
      rawStatus: "In Progress",
      rawPriority: "1 - High",
      rawType: "Bug",
      rawEffort: "L (5pts)",
      labels: [],
      cycleName: null,
      assigneeEmail: null,
      lastEditedAt: this.clock.now(),
      lastEditedBy: "human",
      archived: false,
      extra: {},
      children: [],
      ...overrides,
    };
    this.pages.set(page.externalId, page);
    return page;
  }

  /** Simulate a person editing the page in Notion. */
  editAsHuman(
    externalId: string,
    patch: Partial<
      Pick<
        FakePage,
        | "title"
        | "rawStatus"
        | "rawPriority"
        | "rawType"
        | "rawEffort"
        | "labels"
        | "cycleName"
        | "assigneeEmail"
        | "archived"
        | "cycleUnreadable"
      >
    >,
  ): FakePage {
    const page = this.mustGet(externalId);
    Object.assign(page, patch);
    page.lastEditedAt = this.clock.advance();
    page.lastEditedBy = "human";
    return page;
  }

  /** Remove a page entirely, so getRow returns null (page 404s). */
  deletePage(externalId: string): void {
    this.pages.delete(externalId);
  }

  // ── TicketSyncRemoteAdapter (inbound / pull) ──────────────────────────────

  queryRows(params: {
    databaseId: string;
    editedAfter?: Date;
    relationScope?: { property: string; contains: string };
  }): Promise<RemoteTicketRow[]> {
    const rows = [...this.pages.values()]
      .filter(
        (p) =>
          params.editedAfter === undefined ||
          p.lastEditedAt.getTime() > params.editedAfter.getTime(),
      )
      .map((p) => this.toRow(p));
    return Promise.resolve(rows);
  }

  getPageBody(externalId: string): Promise<string | null> {
    const page = this.pages.get(externalId);
    return Promise.resolve(page ? `Body of ${page.title}` : null);
  }

  // ── TicketPushAdapter (outbound / push) ───────────────────────────────────

  getRow(externalId: string): Promise<RemoteTicketRow | null> {
    const page = this.pages.get(externalId);
    return Promise.resolve(page ? this.toRow(page) : null);
  }

  getWriteSchema(_databaseId: string): Promise<NotionDbSchema> {
    return Promise.resolve(this.schema);
  }

  updatePage(
    externalId: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    if (this.updatePageError) {
      const error = this.updatePageError;
      this.updatePageError = null;
      return Promise.reject(error);
    }
    const page = this.mustGet(externalId);
    this.writes.push({ method: "updatePage", externalId, properties });
    this.applyProperties(page, properties);
    page.lastEditedAt = this.clock.advance();
    page.lastEditedBy = "bot";
    return Promise.resolve();
  }

  findCyclePageIdByName(
    _databaseId: string,
    _cycleProperty: string,
    name: string,
  ): Promise<string | null> {
    for (const [id, title] of this.cyclePagesById) {
      if (title === name) return Promise.resolve(id);
    }
    return Promise.resolve(null);
  }

  findPersonIdByEmail(email: string): Promise<string | null> {
    return Promise.resolve(this.peopleByEmail.get(email) ?? null);
  }

  findPagesByTitle(
    _databaseId: string,
    title: string,
  ): Promise<Array<{ externalId: string; url: string | null }>> {
    const wanted = title.trim().toLowerCase();
    const matches = [...this.pages.values()]
      .filter((p) => !p.archived && p.title.trim().toLowerCase() === wanted)
      .map((p) => ({ externalId: p.externalId, url: p.url }));
    return Promise.resolve(matches);
  }

  createPage(params: {
    databaseId: string;
    titleProperty: string | null;
    properties: Record<string, unknown>;
    children: unknown[];
  }): Promise<{ externalId: string; url: string | null }> {
    const page = this.seedPage({ title: "", children: params.children });
    this.writes.push({
      method: "createPage",
      externalId: page.externalId,
      properties: params.properties,
    });
    this.applyProperties(page, params.properties);
    page.lastEditedAt = this.clock.advance();
    page.lastEditedBy = "bot";
    return Promise.resolve({ externalId: page.externalId, url: page.url });
  }

  archivePage(externalId: string): Promise<void> {
    const page = this.mustGet(externalId);
    this.writes.push({ method: "archivePage", externalId });
    page.archived = true;
    page.lastEditedAt = this.clock.advance();
    page.lastEditedBy = "bot";
    return Promise.resolve();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private mustGet(externalId: string): FakePage {
    const page = this.pages.get(externalId);
    if (!page) throw new Error(`FakeNotion: no page ${externalId}`);
    return page;
  }

  private toRow(page: FakePage): RemoteTicketRow {
    return {
      externalId: page.externalId,
      url: page.url,
      title: page.title,
      rawStatus: page.rawStatus,
      rawPriority: page.rawPriority,
      rawType: page.rawType,
      rawEffort: page.rawEffort,
      labels: [...page.labels],
      // Unreadable mode mirrors the real adapter: the relation exists but the
      // page can't be fetched, so the row reports null + the flag.
      cycleName: page.cycleUnreadable ? null : page.cycleName,
      ...(page.cycleUnreadable ? { cycleUnreadable: true } : {}),
      assigneeEmail: page.assigneeEmail,
      lastEditedAt: page.lastEditedAt,
      lastEditedByBot: page.lastEditedBy === "bot",
      archived: page.archived,
    };
  }

  /**
   * Apply a pages.update/pages.create `properties` payload onto the page's
   * columns — the reverse of what the real Notion API does — so subsequent
   * pulls read back exactly what the push wrote.
   */
  private applyProperties(
    page: FakePage,
    properties: Record<string, unknown>,
  ): void {
    for (const [name, raw] of Object.entries(properties)) {
      const payload = raw as PropertyPayload;
      if (this.schema[name]?.type === "title") {
        page.title = payload.title?.map((t) => t.text.content).join("") ?? "";
      } else if (name === this.propertyNames.status) {
        page.rawStatus =
          payload.status?.name ?? payload.select?.name ?? null;
      } else if (name === this.propertyNames.priority) {
        page.rawPriority = this.optionOrNumber(payload, (n) => `${n}`);
      } else if (name === this.propertyNames.type) {
        page.rawType = payload.select?.name ?? null;
      } else if (name === this.propertyNames.effort) {
        page.rawEffort = this.optionOrNumber(payload, (n) => `${n} pts`);
      } else if (name === this.propertyNames.label) {
        page.labels = (payload.multi_select ?? []).map((o) => o.name);
      } else if (name === this.propertyNames.cycle) {
        const id = payload.relation?.[0]?.id ?? null;
        page.cycleName = id ? (this.cyclePagesById.get(id) ?? null) : null;
      } else if (name === this.propertyNames.assignee) {
        const id = payload.people?.[0]?.id ?? null;
        page.assigneeEmail = id ? (this.emailForPersonId(id) ?? null) : null;
      } else {
        // Source marker / backlink / unknown — keep visible for assertions.
        page.extra[name] = raw;
      }
    }
  }

  private optionOrNumber(
    payload: PropertyPayload,
    format: (n: number) => string,
  ): string | null {
    if ("number" in payload) {
      return payload.number == null ? null : format(payload.number);
    }
    return payload.select?.name ?? null;
  }

  private emailForPersonId(id: string): string | null {
    for (const [email, personId] of this.peopleByEmail) {
      if (personId === id) return email;
    }
    return null;
  }
}
