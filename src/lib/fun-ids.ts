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
 * The canonical, user-friendly identifier to put in a ticket URL.
 * Prefers the per-product sequential number (e.g. `/tickets/29`) and falls
 * back to the CUID for legacy tickets that never got a number (number === 0).
 * The ticket detail route resolves all three forms (number, CUID, Linear-style
 * `PLAT-29`), so existing links keep working — this just picks the clean one.
 */
export function ticketUrlId(ticket: { id: string; number: number }): string {
  return ticket.number > 0 ? String(ticket.number) : ticket.id;
}

/**
 * Parse a ticket URL segment into a sequential-number lookup key. Accepts a
 * bare number (`29`) or a Linear-style id (`PLAT-29`, case-insensitive).
 * Returns the number when the segment encodes one, otherwise null — in which
 * case the raw segment should be treated as a CUID / fun shortId.
 */
export function parseTicketUrlId(segment: string): number | null {
  const match = /^(?:[a-z][a-z0-9]*-)?(\d+)$/i.exec(segment.trim());
  return match ? parseInt(match[1]!, 10) : null;
}
