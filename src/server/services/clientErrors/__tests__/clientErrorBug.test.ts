import { describe, it, expect } from "vitest";

import {
  buildClientErrorBody,
  buildClientErrorBug,
  fingerprintClientError,
  shouldFileClientError,
} from "../clientErrorBug";

const report = (over: Partial<Parameters<typeof buildClientErrorBug>[0]> = {}) => ({
  area: "chat-stream",
  kind: "model",
  message: "Your credit balance is too low to access the Anthropic API.",
  ...over,
});

describe("shouldFileClientError", () => {
  it("files the kinds that mean something is broken", () => {
    expect(shouldFileClientError("model")).toBe(true);
    expect(shouldFileClientError("unknown")).toBe(true);
    // No classification at all: nobody decided it was benign.
    expect(shouldFileClientError(undefined)).toBe(true);
  });

  it("ignores the kinds that are the network or the user's session", () => {
    expect(shouldFileClientError("transport")).toBe(false);
    expect(shouldFileClientError("idle-timeout")).toBe(false);
    expect(shouldFileClientError("auth")).toBe(false);
  });
});

describe("fingerprintClientError", () => {
  it("collapses repeats of the same fault onto one id", () => {
    expect(fingerprintClientError(report())).toBe(fingerprintClientError(report()));
  });

  it("ignores the digits that differ between occurrences", () => {
    // A request id or a byte count must not split one fault into many tickets.
    expect(fingerprintClientError(report({ message: "Upload failed after 1423 bytes" }))).toBe(
      fingerprintClientError(report({ message: "Upload failed after 87 bytes" })),
    );
  });

  it("keeps genuinely different faults apart", () => {
    const credit = fingerprintClientError(report());
    const other = fingerprintClientError(report({ message: "Model overloaded" }));
    const elsewhere = fingerprintClientError(report({ area: "zoe-canvas-stream" }));
    expect(new Set([credit, other, elsewhere]).size).toBe(3);
  });

  it("names the origin in the id, so a client bug is recognisable as one", () => {
    expect(fingerprintClientError(report())).toMatch(/^client:chat-stream:[0-9a-f]{12}$/);
  });
});

describe("buildClientErrorBug", () => {
  it("titles the ticket with where it broke and what it said", () => {
    const bug = buildClientErrorBug(report());
    expect(bug.title).toBe(
      "chat-stream: Your credit balance is too low to access the Anthropic API.",
    );
    expect(bug.culprit).toBe("chat-stream");
    expect(bug.level).toBe("error");
  });

  it("leaves projectSlug null so the AI fixer is not pointed at a stackless report", () => {
    expect(buildClientErrorBug(report()).projectSlug).toBeNull();
  });

  it("masks a credential the error echoed back", () => {
    const secret = "sk_live_" + "b".repeat(40);
    const bug = buildClientErrorBug(report({ message: `Invalid key ${secret}` }));
    expect(bug.title).not.toContain(secret);
  });

  it("caps a runaway message so the title stays a title", () => {
    const bug = buildClientErrorBug(report({ message: "no ".repeat(200) }));
    expect(bug.title.length).toBeLessThan(200);
  });
});

describe("buildClientErrorBody", () => {
  it("says where the report came from, rather than claiming Sentry saw it", () => {
    const body = buildClientErrorBody(report());
    expect(body).toContain("never reached Sentry");
    expect(body).not.toContain("Reported automatically from Sentry");
  });

  it("renders the context a triager needs", () => {
    const body = buildClientErrorBody(report({ context: { agentId: "localWikiAgent" } }));
    expect(body).toContain("**Failure kind:** model");
    expect(body).toContain("**agentId:** localWikiAgent");
  });

  it("masks credentials in context values too", () => {
    const secret = "tok_" + "c".repeat(40);
    const body = buildClientErrorBody(report({ context: { url: `https://x.test/${secret}` } }));
    expect(body).not.toContain(secret);
  });
});
