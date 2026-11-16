import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicyReportOnly,
  sentryCspReportUri,
} from "../contentSecurityPolicy.js";

function directive(policy: string, name: string): string {
  const found = policy.split("; ").find((d) => d.startsWith(`${name} `));
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

describe("contentSecurityPolicyReportOnly", () => {
  const prod = contentSecurityPolicyReportOnly({ isDev: false, vercelEnv: "production" });
  const preview = contentSecurityPolicyReportOnly({ isDev: false, vercelEnv: "preview" });

  it("allows GA4's www.google.com beacons", () => {
    expect(directive(prod, "connect-src")).toContain("https://www.google.com");
  });

  it("allows form posts to both the apex and www hosts", () => {
    const formAction = directive(prod, "form-action");
    expect(formAction).toContain("https://exponential.im");
    expect(formAction).toContain("https://www.exponential.im");
  });

  it("allows the Vercel toolbar on preview deploys only", () => {
    for (const name of ["script-src", "style-src", "font-src", "connect-src", "frame-src"]) {
      expect(directive(preview, name)).toContain("https://vercel.live");
      expect(directive(prod, name)).not.toContain("vercel.live");
    }
  });

  it("keeps Google Fonts out (fonts are self-hosted)", () => {
    expect(prod).not.toContain("fonts.googleapis.com");
    expect(prod).not.toContain("fonts.gstatic.com");
  });

  it("adds unsafe-eval only in dev", () => {
    expect(directive(prod, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicyReportOnly({ isDev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("appends report-uri when given", () => {
    const p = contentSecurityPolicyReportOnly({ isDev: false, reportUri: "https://o.ingest/api/1/security/?sentry_key=k" });
    expect(p.endsWith("report-uri https://o.ingest/api/1/security/?sentry_key=k")).toBe(true);
  });
});

describe("sentryCspReportUri", () => {
  it("derives the security endpoint from the DSN", () => {
    expect(sentryCspReportUri("https://abc@o1.ingest.sentry.io/42")).toBe(
      "https://o1.ingest.sentry.io/api/42/security/?sentry_key=abc",
    );
  });
  it("returns null for missing or malformed DSNs", () => {
    expect(sentryCspReportUri(undefined)).toBeNull();
    expect(sentryCspReportUri("not a url")).toBeNull();
    expect(sentryCspReportUri("https://o1.ingest.sentry.io/42")).toBeNull();
  });
});
