/**
 * The resolver every AI surface reads: which model providers this install has
 * keys for, whether the Assistant (Mastra) is reachable, and what each missing
 * variable would turn on. A self-host install with no keys must resolve to
 * "everything off"; exponential.im (every key set) to "everything on".
 */

import { describe, expect, it } from "vitest";
import {
  AI_SETUP_OPTIONS,
  aiCapabilityLines,
  resolveAiCapabilities,
  resolveMastraUrl,
} from "../capabilities";

const PRODUCTION = { NODE_ENV: "production" };
const ALL_KEYS = {
  ...PRODUCTION,
  OPENAI_API_KEY: "sk-test",
  ANTHROPIC_API_KEY: "sk-ant-test",
  MASTRA_API_URL: "https://mastra.example.test",
};

describe("resolveAiCapabilities", () => {
  it("a production install with no keys has every AI capability off", () => {
    expect(resolveAiCapabilities(PRODUCTION)).toEqual({
      openai: false,
      anthropic: false,
      assistant: false,
      summaries: false,
      voice: false,
    });
  });

  it("with every key set (exponential.im) has every AI capability on", () => {
    expect(resolveAiCapabilities(ALL_KEYS)).toEqual({
      openai: true,
      anthropic: true,
      assistant: true,
      summaries: true,
      voice: true,
    });
  });

  it("an OpenAI key alone turns on summaries but not the Assistant or voice", () => {
    expect(resolveAiCapabilities({ ...PRODUCTION, OPENAI_API_KEY: "sk-test" })).toEqual({
      openai: true,
      anthropic: false,
      assistant: false,
      summaries: true,
      voice: false,
    });
  });

  it("an Anthropic key alone turns on summaries only", () => {
    expect(resolveAiCapabilities({ ...PRODUCTION, ANTHROPIC_API_KEY: "sk-ant-test" })).toMatchObject({
      openai: false,
      anthropic: true,
      summaries: true,
      voice: false,
    });
  });

  it("voice needs both OpenAI (Realtime) and the Assistant (its brain)", () => {
    expect(resolveAiCapabilities({ ...PRODUCTION, MASTRA_API_URL: "https://m.test" }).voice).toBe(false);
    expect(
      resolveAiCapabilities({ ...PRODUCTION, MASTRA_API_URL: "https://m.test", OPENAI_API_KEY: "sk" }).voice,
    ).toBe(true);
  });

  it("treats an empty string as unset, like t3-env's emptyStringAsUndefined", () => {
    expect(
      resolveAiCapabilities({ ...PRODUCTION, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", MASTRA_API_URL: "" }),
    ).toMatchObject({ openai: false, anthropic: false, assistant: false });
  });
});

describe("resolveMastraUrl", () => {
  it("uses MASTRA_API_URL when set", () => {
    expect(resolveMastraUrl({ ...PRODUCTION, MASTRA_API_URL: "https://mastra.example.test" })).toBe(
      "https://mastra.example.test",
    );
  });

  it("in production, unset means no Assistant rather than localhost", () => {
    expect(resolveMastraUrl(PRODUCTION)).toBeNull();
  });

  it("in development, unset still means the local Mastra dev server", () => {
    expect(resolveMastraUrl({ NODE_ENV: "development" })).toBe("http://localhost:4111");
    expect(resolveMastraUrl({})).toBe("http://localhost:4111");
  });
});

describe("aiCapabilityLines", () => {
  it("with no keys, says AI is off and names each variable with what it turns on", () => {
    const text = aiCapabilityLines(PRODUCTION).join("\n");

    expect(text).toMatch(/AI features: off/);
    for (const option of AI_SETUP_OPTIONS) {
      expect(text).toContain(option.variable);
    }
  });

  it("with every key set, lists what is on and nothing to add", () => {
    const lines = aiCapabilityLines(ALL_KEYS);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/AI features: OpenAI, Anthropic, Assistant \(Mastra\)/);
  });

  it("tells a plain install to set MASTRA_API_URL for the Assistant", () => {
    const text = aiCapabilityLines(PRODUCTION).join("\n");

    expect(text).toMatch(/set MASTRA_API_URL and restart/);
    expect(text).not.toMatch(/--profile assistant/);
  });

  it("under Docker Compose, points at the assistant profile instead of MASTRA_API_URL", () => {
    const text = aiCapabilityLines({ ...PRODUCTION, SELFHOST_MASTRA_HOST: "mastra" }).join("\n");

    expect(text).toMatch(/start Compose with `--profile assistant` \(it needs ANTHROPIC_API_KEY\)/);
    expect(text).not.toMatch(/set MASTRA_API_URL/);
    expect(text).toMatch(/set OPENAI_API_KEY and restart/);
  });

  it("under Docker Compose with the profile on, the Assistant shows as on", () => {
    const lines = aiCapabilityLines({
      ...PRODUCTION,
      SELFHOST_MASTRA_HOST: "mastra",
      MASTRA_API_URL: "http://mastra:4111",
    });

    expect(lines[0]).toMatch(/AI features: Assistant \(Mastra\)/);
    expect(lines.join("\n")).not.toMatch(/--profile assistant/);
  });

  it("never prints a key's value", () => {
    const text = aiCapabilityLines(ALL_KEYS).join("\n");

    expect(text).not.toContain("sk-test");
    expect(text).not.toContain("sk-ant-test");
  });
});
