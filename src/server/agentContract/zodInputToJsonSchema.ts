/**
 * Turns a procedure's zod input into JSON Schema for the agent procedure
 * contract (`contracts/agent-procedures.json`).
 *
 * The schema describes what a JSON client can send. Agent tools post
 * `{ json: input, meta: {} }`, so superjson revives nothing: a value arrives as
 * the plain JSON it was sent as. Three rules follow from that.
 *
 * 1. A type that only exists after superjson revives it can never be sent.
 *    `z.date()`, `z.bigint()`, `z.map()`, `z.set()` and `z.nan()` become a
 *    schema that nothing satisfies, so a tool that sends the field fails the
 *    contract. Use `z.coerce.date()` for a date an agent sends.
 * 2. A type that accepts more than its zod type says is left open, so the
 *    contract never rejects a payload the app accepts: `z.coerce.*()`,
 *    `z.preprocess()` and `.catch()` become "anything".
 * 3. Extra keys pass unless the object is `.strict()`, because zod strips them.
 *
 * `.refine()` and `.transform()` are not checked: the schema is the shape only.
 */
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema, ignoreOverride } from "zod-to-json-schema";

export type JsonSchema = Record<string, unknown>;

/** JSON Schema `format` for `z.coerce.date()`: a string `new Date()` can parse. */
export const COERCE_DATE_FORMAT = "coerce-date";

const NEEDS_SUPERJSON: Record<string, string> = {
  ZodDate: "z.date()",
  ZodBigInt: "z.bigint()",
  ZodMap: "z.map()",
  ZodSet: "z.set()",
  ZodNaN: "z.nan()",
};

const COERCIBLE = new Set(["ZodString", "ZodNumber", "ZodBoolean"]);

interface ZodDefLike {
  typeName?: string;
  coerce?: boolean;
  effect?: { type?: string };
}

function unsendable(zodType: string): JsonSchema {
  const fix = zodType === "z.date()" ? " Use z.coerce.date()." : "";
  return {
    not: {},
    $comment: `${zodType} needs superjson meta, and agent tools post meta: {}.${fix}`,
  };
}

function override(def: ZodDefLike): JsonSchema | typeof ignoreOverride {
  const typeName = def.typeName ?? "";

  if (typeName === "ZodDate" && def.coerce) {
    return { type: ["string", "number"], format: COERCE_DATE_FORMAT };
  }
  if (typeName === "ZodBigInt" && def.coerce) return {};
  if (typeName in NEEDS_SUPERJSON) return unsendable(NEEDS_SUPERJSON[typeName]!);

  if (COERCIBLE.has(typeName) && def.coerce) return {};
  if (typeName === "ZodEffects" && def.effect?.type === "preprocess") return {};
  if (typeName === "ZodCatch") return {};

  return ignoreOverride;
}

const DATA_KEYWORDS = new Set(["default", "const", "enum", "examples"]);

/** Drops `description`: prose is not part of the contract, and it churns. */
function stripDescriptions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripDescriptions);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "description" && typeof value === "string") continue;
    // These hold data, not schemas: copy them as they are.
    if (DATA_KEYWORDS.has(key)) {
      out[key] = value;
      continue;
    }
    // Under `properties` every key is a property name, not a keyword.
    if (key === "properties" && value !== null && typeof value === "object") {
      const properties: Record<string, unknown> = {};
      for (const [name, schema] of Object.entries(value)) {
        properties[name] = stripDescriptions(schema);
      }
      out[key] = properties;
      continue;
    }
    out[key] = stripDescriptions(value);
  }
  return out;
}

export function zodInputToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const converted = zodToJsonSchema(schema, {
    target: "jsonSchema7",
    // Every schema stands alone: no $ref into another part of the file.
    $refStrategy: "none",
    effectStrategy: "input",
    pipeStrategy: "input",
    // zod strips unknown keys by default. Only `.strict()` rejects them.
    removeAdditionalStrategy: "strict",
    allowedAdditionalProperties: undefined,
    override: (def) => override(def as ZodDefLike),
  }) as JsonSchema;
  delete converted.$schema;
  return stripDescriptions(converted) as JsonSchema;
}
