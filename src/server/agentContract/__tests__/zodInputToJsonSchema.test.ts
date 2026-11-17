import { describe, it, expect } from "vitest";
import { z } from "zod";

import { COERCE_DATE_FORMAT, zodInputToJsonSchema } from "../zodInputToJsonSchema";

/** A schema nothing satisfies: how the contract marks a field a JSON client cannot send. */
const UNSENDABLE = { not: {} };

function property(schema: z.ZodTypeAny, name: string): Record<string, unknown> {
  const converted = zodInputToJsonSchema(schema) as { properties: Record<string, Record<string, unknown>> };
  return converted.properties[name]!;
}

describe("zodInputToJsonSchema", () => {
  it("z.date() can never be satisfied: agent tools post meta: {}, so no string is revived to a Date", () => {
    const dueDate = property(z.object({ dueDate: z.date() }), "dueDate");
    expect(dueDate).toMatchObject(UNSENDABLE);
    expect(dueDate.$comment).toContain("z.coerce.date()");
  });

  it("z.coerce.date() accepts the ISO string a tool sends", () => {
    expect(property(z.object({ dueDate: z.coerce.date() }), "dueDate")).toEqual({
      type: ["string", "number"],
      format: COERCE_DATE_FORMAT,
    });
  });

  it("an optional z.date() stays optional, so only a tool that sends it fails", () => {
    const converted = zodInputToJsonSchema(z.object({ id: z.string(), dueDate: z.date().optional() }));
    expect(converted.required).toEqual(["id"]);
    expect((converted.properties as Record<string, unknown>).dueDate).toMatchObject(UNSENDABLE);
  });

  it.each([
    ["z.bigint()", z.bigint()],
    ["z.map()", z.map(z.string(), z.string())],
    ["z.set()", z.set(z.string())],
    ["z.nan()", z.nan()],
  ])("%s needs superjson meta too, so it is unsendable", (_name, schema) => {
    expect(property(z.object({ value: schema }), "value")).toMatchObject(UNSENDABLE);
  });

  it.each([
    ["z.coerce.number()", z.coerce.number()],
    ["z.coerce.string()", z.coerce.string()],
    ["z.preprocess()", z.preprocess((value) => Number(value), z.number())],
    [".catch()", z.number().catch(0)],
  ])("%s accepts more than its type says, so the contract leaves it open", (_name, schema) => {
    expect(property(z.object({ value: schema }), "value")).toEqual({});
  });

  it("a coerced field with no default is still required", () => {
    const converted = zodInputToJsonSchema(z.object({ goalId: z.coerce.number() }));
    expect(converted.required).toEqual(["goalId"]);
  });

  it("extra keys pass, because zod strips them", () => {
    const converted = zodInputToJsonSchema(z.object({ id: z.string() }));
    expect(converted).not.toHaveProperty("additionalProperties");
  });

  it("extra keys fail on a .strict() object", () => {
    const converted = zodInputToJsonSchema(z.object({ id: z.string() }).strict());
    expect(converted.additionalProperties).toBe(false);
  });

  it("drops descriptions but keeps a property that is named description", () => {
    const converted = zodInputToJsonSchema(
      z.object({ description: z.string().describe("Free text") }).describe("An input"),
    );
    expect(converted).toEqual({
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
    });
  });

  it("keeps a default value as it is, even when it has a description key", () => {
    const converted = zodInputToJsonSchema(
      z.object({ meta: z.object({ description: z.string() }).default({ description: "none" }) }),
    );
    expect((converted.properties as Record<string, { default: unknown }>).meta!.default).toEqual({
      description: "none",
    });
  });

  it("reads the input side of a transform", () => {
    expect(property(z.object({ n: z.string().transform((value) => value.length) }), "n")).toEqual({
      type: "string",
    });
  });
});
