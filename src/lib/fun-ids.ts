/**
 * Word lists for generating memorable two-word ticket IDs.
 * Format: adjective.noun (e.g. "swift.falcon", "coral.otter")
 *
 * ~180 adjectives x ~260 nouns = ~46,800 unique combinations per product.
 */

export const ADJECTIVES = [
  // Colors
  "red", "blue", "gold", "teal", "amber", "coral", "jade", "ruby",
  "onyx", "sage", "plum", "pink", "lime", "mint", "rose", "aqua",
  "ivory", "peach", "opal", "bronze", "copper", "silver", "cobalt",
  "scarlet", "violet", "indigo", "rusty", "sandy", "ashen", "smoky",
  // Physical
  "bold", "tiny", "slim", "crisp", "sleek", "swift", "sharp", "round",
  "bright", "shiny", "soft", "tall", "flat", "thick", "thin", "dense",
  "lean", "wide", "deep", "light", "dark", "pale", "vivid", "clear",
  "smooth", "rough", "fuzzy", "silky", "glossy",
  // Mood / Personality
  "calm", "brave", "wise", "wild", "keen", "cozy", "lucky", "witty",
  "gentle", "proud", "noble", "merry", "jolly", "daring", "humble",
  "quiet", "loud", "happy", "snappy", "zesty", "peppy", "perky",
  "quirky", "giddy", "lively", "steady", "eager", "fiery", "chill",
  "sly", "shy", "odd", "wry", "raw",
  // Nature / Weather
  "sunny", "foggy", "misty", "frosty", "stormy", "lunar", "dewy",
  "windy", "snowy", "rainy", "dusty", "mossy", "leafy", "woody",
  "polar", "solar", "cosmic", "astral",
  // Speed / Energy
  "rapid", "brisk", "fleet", "hasty", "zippy", "turbo", "hyper",
  "lazy", "slow", "still",
  // Temperature / Texture
  "warm", "cool", "icy", "hot", "cold", "dry", "wet", "damp",
  // Abstract
  "epic", "prime", "fresh", "grand", "chief", "royal", "magic",
  "pixel", "retro", "ultra", "mega", "super", "extra", "proto",
  "micro", "macro", "inner", "outer", "upper", "sonic", "neon",
  "cyber", "delta", "sigma", "alpha", "omega", "zen",
] as const;

export const NOUNS = [
  // Animals
  "falcon", "otter", "panda", "koala", "gecko", "llama", "ferret",
  "badger", "mantis", "osprey", "bison", "crane", "raven", "heron",
  "viper", "cobra", "eagle", "shark", "whale", "squid", "robin",
  "finch", "wren", "dove", "lark", "swan", "stork", "quail",
  "parrot", "toucan", "puffin", "owl", "fox", "wolf", "bear",
  "deer", "moose", "elk", "lynx", "bobcat", "coyote", "jaguar",
  "tiger", "lion", "panther", "seal", "walrus", "penguin", "pelican",
  "salmon", "trout", "bass", "pike", "carp", "tuna", "ray",
  "beetle", "cricket", "hornet", "moth", "wasp", "ant", "bee",
  "spider", "snail", "slug", "frog", "toad", "newt", "eel",
  "duck", "goose", "hen", "ram", "yak", "ox",
  // Trees / Plants
  "oak", "elm", "pine", "maple", "cedar", "birch", "fern", "moss",
  "ivy", "willow", "poplar", "spruce", "palm", "lotus", "orchid",
  "dahlia", "tulip", "daisy", "lily", "iris", "clover", "reed",
  "bamboo", "acorn", "thorn",
  // Terrain / Water
  "cliff", "creek", "ridge", "dune", "cove", "reef", "lake",
  "mesa", "vale", "brook", "delta", "fjord", "grove", "marsh",
  "peak", "pond", "shore", "trail", "canyon", "basin", "ledge",
  "river", "ocean", "stone", "bluff",
  // Weather / Elements
  "storm", "frost", "cloud", "ember", "spark", "flame", "breeze",
  "thunder", "bolt", "flare", "gust", "haze", "mist", "sleet",
  "aurora", "blaze", "drift", "surge", "vapor", "tide",
  // Food
  "mango", "peach", "lemon", "olive", "berry", "ginger", "cocoa",
  "honey", "maple", "walnut", "almond", "fig", "plum", "cherry",
  "melon", "grape", "basil", "sage", "thyme", "clove",
  // Objects
  "arrow", "crown", "drum", "gem", "kite", "prism", "torch",
  "bell", "coin", "lens", "compass", "anchor", "anvil", "blade",
  "flask", "forge", "glyph", "ingot", "quill", "rune", "scroll",
  "shield", "spire", "vault", "beacon", "crest", "helm", "shard",
  // Space / Cosmic
  "comet", "nova", "orbit", "nebula", "titan", "pulsar", "quasar",
  "star", "moon", "sun", "mars", "atlas", "cosmos", "zenith",
  "vertex", "apex",
] as const;

/**
 * Generate a random fun ID like "swift.falcon".
 * Optionally pass a Set of existing IDs to avoid collisions.
 */
export function generateFunId(existingIds?: Set<string>): string {
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
    const id = `${adj}.${noun}`;
    if (!existingIds || !existingIds.has(id)) return id;
  }
  // Fallback: append a random digit
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  const digit = Math.floor(Math.random() * 100);
  return `${adj}.${noun}.${digit}`;
}

/**
 * Generate a Linear-style short ID from product name + number.
 * e.g. "A Test Product" + 14 -> "ATP-14"
 */
export function generateLinearId(productName: string, number: number): string {
  const prefix = productName
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4) || "T";
  return `${prefix}-${number}`;
}

/**
 * "CLR-241"-style display id for a ticket, honouring the product's fun-id
 * setting: the `adjective.noun` shortId when the product uses fun ids, else
 * the Linear-style `PREFIX-number`. Shared by the product overview and the
 * Daily summary so a ticket reads the same everywhere.
 */
export function ticketDisplayId(
  product: { name: string; funTicketIds: boolean },
  ticket: { shortId: string | null; number: number },
): string {
  if (product.funTicketIds && ticket.shortId) return ticket.shortId;
  return ticket.number > 0
    ? generateLinearId(product.name, ticket.number)
    : "—";
}

/**
 * The canonical, user-friendly identifier to put in a ticket URL.
 * Prefers the per-product sequential number (e.g. `/tickets/29`) and falls
 * back to the CUID for legacy tickets that never got a number (number === 0).
 * The ticket detail route resolves all three forms (number, CUID, Linear-style
 * `PLAT-29`), so existing links keep working — this just picks the clean one.
 */
export function ticketUrlId(ticket: { id: string; number: number }): string {
  return ticket.number > 0 ? String(ticket.number) : ticket.id;
}

/** One `shortId` condition in the shape Prisma's `TicketWhereInput` accepts. */
interface ShortIdContains {
  shortId: { contains: string; mode: "insensitive" };
}

/**
 * Where-clauses matching a ticket's `shortId` against a free-text query, for
 * spreading into a Prisma `OR`. Beyond the plain substring match, a multi-word
 * query matches shortIds containing every word in any order: fun IDs are
 * `adjective.noun`, and people reliably recall the two words but not which
 * came first — a search for "toucan.prime" (or "toucan prime") must find
 * `prime.toucan`.
 */
export function shortIdSearchWhere(
  query: string,
): (ShortIdContains | { AND: ShortIdContains[] })[] {
  const contains = (value: string): ShortIdContains => ({
    shortId: { contains: value, mode: "insensitive" },
  });
  const words = query.split(/[.\s]+/).filter(Boolean);
  // Nothing but separators: no clause at all, rather than a match-everything
  // `contains("")` or a match-nothing `contains(".")`.
  if (words.length === 0) return [];
  // Matching the word instead of the raw query lets stray separators along
  // for the ride ("toucan." still finds prime.toucan).
  if (words.length === 1) return [contains(words[0]!)];
  // Fun IDs are exactly adjective.noun, so only a two-word query can be one
  // typed from memory — and both words must be real words, or "a b" floods
  // the results with every shortId containing those two letters. The AND of
  // per-word substrings subsumes the exact match, so it stands alone. Longer
  // queries are title-style text: plain substring match, as before.
  return words.length === 2 && words.every((w) => w.length >= 2)
    ? [{ AND: words.map(contains) }]
    : [contains(query.trim())];
}

/**
 * In-memory twin of `shortIdSearchWhere`, for lists already loaded on the
 * client: true when `shortId` matches `query` under the same rules (one word
 * is a substring; two real words match in either order; anything longer is a
 * plain substring of the whole query). Case-insensitive.
 */
export function shortIdMatchesQuery(shortId: string | null, query: string): boolean {
  if (!shortId) return false;
  const id = shortId.toLowerCase();
  const q = query.trim().toLowerCase();
  const words = q.split(/[.\s]+/).filter(Boolean);
  if (words.length === 0) return false;
  if (words.length === 1) return id.includes(words[0]!);
  return words.length === 2 && words.every((w) => w.length >= 2)
    ? words.every((w) => id.includes(w))
    : id.includes(q);
}

/**
 * What a search query names when it is a ticket *identifier* rather than
 * title text: a fun shortId (`snappy.thunder`), a sequential number (`42`,
 * `#42`) or a Linear-style id (`EXP-42`). Searches use it to put the ticket the
 * query names exactly ahead of tickets that merely contain the words.
 */
export interface TicketIdQuery {
  /** Lower-case shortIds the query names exactly, in both word orders. */
  shortIds: string[];
  /** The sequential number the query names, or null. */
  number: number | null;
  /**
   * The upper-case prefix of a Linear-style query (`EXP` for `exp-42`), or
   * null. When set, the number only names a ticket in a product whose
   * `generateLinearId` prefix is the same.
   */
  linearPrefix: string | null;
}

/**
 * Parse a search query into the ticket identifiers it could name exactly.
 * Case, surrounding whitespace, a leading `#`, and a space in place of the dot
 * are all tolerated; word order is too, because people remember the two words
 * of a fun id but not which came first.
 */
/** The largest value `Ticket.number` (a Postgres `integer`) can hold. */
export const MAX_TICKET_NUMBER = 2_147_483_647;

export function parseTicketIdQuery(query: string): TicketIdQuery {
  const q = query.trim().toLowerCase().replace(/^#/, "").trim();
  const result: TicketIdQuery = { shortIds: [], number: null, linearPrefix: null };
  if (!q) return result;

  const numberMatch = /^(?:([a-z][a-z0-9]*)-)?(\d+)$/.exec(q);
  if (numberMatch) {
    const parsed = parseInt(numberMatch[2]!, 10);
    // `Ticket.number` is a 32-bit Int: a larger number can't name a ticket,
    // and passing it to Prisma would throw and fail the whole search. Leave it
    // as plain text.
    if (parsed > 0 && parsed <= MAX_TICKET_NUMBER) {
      result.number = parsed;
      result.linearPrefix = numberMatch[1]?.toUpperCase() ?? null;
    }
    return result;
  }

  // adjective.noun, or the collision fallback adjective.noun.NN.
  const parts = q.split(/[.\s]+/).filter(Boolean);
  const [a, b, suffix] = parts;
  const isWord = (w: string | undefined): w is string => !!w && /^[a-z]{2,}$/.test(w);
  if (isWord(a) && isWord(b) && (parts.length === 2 || (parts.length === 3 && /^\d+$/.test(suffix!)))) {
    const tail = parts.length === 3 ? `.${suffix}` : "";
    result.shortIds = Array.from(new Set([`${a}.${b}${tail}`, `${b}.${a}${tail}`]));
  }
  return result;
}

/** One exact-identifier condition in the shape Prisma's `TicketWhereInput` accepts. */
type TicketIdClause =
  | { shortId: { in: string[] } }
  | { number: number };

/**
 * Where-clauses (for a Prisma `OR`) finding the tickets a `TicketIdQuery`
 * names exactly. Both hit the `(productId, shortId)` / `(productId, number)`
 * unique indexes. Empty when the query names no identifier. A Linear-style
 * prefix is not expressible here (it is derived from the product name), so
 * callers filter those rows with `isTicketIdMatch`.
 */
export function ticketIdWhere(idQuery: TicketIdQuery): TicketIdClause[] {
  const clauses: TicketIdClause[] = [];
  // Generated shortIds are always lower-case, so an exact `in` is enough.
  if (idQuery.shortIds.length > 0) clauses.push({ shortId: { in: idQuery.shortIds } });
  if (idQuery.number !== null) clauses.push({ number: idQuery.number });
  return clauses;
}

/**
 * True when `ticket` is one the query names exactly. `productName` is needed
 * only to check a Linear-style prefix; without it such a query never matches.
 */
export function isTicketIdMatch(
  ticket: { shortId: string | null; number: number },
  idQuery: TicketIdQuery,
  productName?: string,
): boolean {
  if (ticket.shortId && idQuery.shortIds.includes(ticket.shortId.toLowerCase())) return true;
  if (idQuery.number === null || ticket.number !== idQuery.number) return false;
  if (idQuery.linearPrefix === null) return true;
  return (
    productName !== undefined &&
    generateLinearId(productName, ticket.number) === `${idQuery.linearPrefix}-${ticket.number}`
  );
}

/**
 * Parse a ticket URL segment into a sequential-number lookup key. Accepts a
 * bare number (`29`) or a Linear-style id (`PLAT-29`, case-insensitive).
 * Returns the number when the segment encodes a *positive* one, otherwise null
 * — in which case the raw segment should be treated as a CUID / fun shortId.
 *
 * `0` is rejected on purpose: `Ticket.number` defaults to 0 for legacy tickets
 * that never got a sequential number, and those are addressed only by their
 * CUID (see `ticketUrlId`). Treating `/tickets/0` as a number lookup would let
 * an unintended legacy ticket resolve, so we fall through to the CUID branch.
 */
export function parseTicketUrlId(segment: string): number | null {
  const match = /^(?:[a-z][a-z0-9]*-)?(\d+)$/i.exec(segment.trim());
  if (!match) return null;
  const parsed = parseInt(match[1]!, 10);
  return parsed > 0 ? parsed : null;
}
