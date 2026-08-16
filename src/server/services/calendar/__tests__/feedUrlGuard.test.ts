/**
 * Unit tests for the ICS feed URL SSRF guard. DNS is injected so no test
 * touches the network. NODE_ENV is "test" here, so localhost is allowed —
 * the production-only refusal is covered by the shared address checks.
 */

import { describe, it, expect } from "vitest";

import { assertSafeFeedUrl, UnsafeFeedUrlError } from "../feedUrlGuard";

const resolvePublic = async () => ["93.184.216.34"];
const resolvePrivate = async () => ["10.0.0.5"];
const resolveMixed = async () => ["93.184.216.34", "192.168.1.1"];

describe("assertSafeFeedUrl", () => {
  it("accepts an https URL resolving to a public address", async () => {
    await expect(
      assertSafeFeedUrl("https://outlook.office365.com/owa/calendar/x/calendar.ics", resolvePublic),
    ).resolves.toBeUndefined();
  });

  it("rejects invalid URLs", async () => {
    await expect(assertSafeFeedUrl("not a url", resolvePublic)).rejects.toThrow(
      UnsafeFeedUrlError,
    );
  });

  it("rejects non-https schemes", async () => {
    await expect(
      assertSafeFeedUrl("http://example.com/calendar.ics", resolvePublic),
    ).rejects.toThrow(/https/);
    await expect(
      assertSafeFeedUrl("ftp://example.com/calendar.ics", resolvePublic),
    ).rejects.toThrow(UnsafeFeedUrlError);
  });

  it("allows localhost outside production (testability escape hatch)", async () => {
    await expect(
      assertSafeFeedUrl("http://localhost:3100/fixture.ics", resolvePublic),
    ).resolves.toBeUndefined();
  });

  // "[::1]"/127.0.0.1 are covered by the localhost escape hatch above — in
  // production they are refused by the https+localhost check, not this one.
  it("rejects literal private, loopback, and link-local addresses", async () => {
    for (const host of ["10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "[fd00::1]"]) {
      await expect(
        assertSafeFeedUrl(`https://${host}/calendar.ics`, resolvePublic),
      ).rejects.toThrow(UnsafeFeedUrlError);
    }
  });

  it("rejects hostnames that resolve to a private address", async () => {
    await expect(
      assertSafeFeedUrl("https://internal.example.com/calendar.ics", resolvePrivate),
    ).rejects.toThrow(/private or loopback/);
  });

  it("rejects hostnames where ANY resolved address is private", async () => {
    await expect(
      assertSafeFeedUrl("https://mixed.example.com/calendar.ics", resolveMixed),
    ).rejects.toThrow(UnsafeFeedUrlError);
  });

  it("rejects hostnames that fail to resolve", async () => {
    const resolveFail = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(
      assertSafeFeedUrl("https://nope.example.com/calendar.ics", resolveFail),
    ).rejects.toThrow(/Could not resolve/);
  });
});
