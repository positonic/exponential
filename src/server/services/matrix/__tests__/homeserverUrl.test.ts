/**
 * SSRF guard for the one URL a user hands the server to fetch.
 *
 * DNS is stubbed so these are hermetic — the point is which addresses are refused, not
 * what any real name resolves to today.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const lookupMock = vi.fn<(hostname: string) => Promise<string[]>>();

import {
  assertSafeHomeserverUrl,
  UnsafeHomeserverUrlError,
} from "~/server/services/matrix/homeserverUrl";

const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue(["203.0.113.10"]);
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

async function reject(url: string): Promise<string> {
  const error = await assertSafeHomeserverUrl(url, lookupMock).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(UnsafeHomeserverUrlError);
  return (error as Error).message;
}

describe("assertSafeHomeserverUrl", () => {
  it("allows a public https homeserver", async () => {
    await expect(
      assertSafeHomeserverUrl("https://matrix.example.org", lookupMock),
    ).resolves.toBeUndefined();
  });

  it("refuses plain http, so the bot token is never sent in the clear", async () => {
    expect(await reject("http://matrix.example.org")).toMatch(/must use https/i);
  });

  it.each([
    ["the cloud metadata endpoint", "https://169.254.169.254"],
    ["an RFC 1918 address", "https://10.1.2.3"],
    ["a 172.16/12 address", "https://172.20.0.5"],
    ["a 192.168 address", "https://192.168.1.10"],
    ["an IPv6 unique-local address", "https://[fd00::1]"],
  ])("refuses %s written directly into the URL", async (_label, url) => {
    expect(await reject(url)).toMatch(/private or loopback/i);
    // Refused without even resolving — the address is right there.
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("refuses a public name that resolves to a private address", async () => {
    // The case a scheme/literal check alone would miss.
    lookupMock.mockResolvedValue(["169.254.169.254"]);
    expect(await reject("https://metadata.attacker.example")).toMatch(
      /resolves to a private or loopback address/i,
    );
  });

  it("refuses a name where only one of several records is private", async () => {
    lookupMock.mockResolvedValue(["203.0.113.10", "10.0.0.7"]);
    expect(await reject("https://split.attacker.example")).toMatch(
      /resolves to a private or loopback address/i,
    );
  });

  it("refuses an IPv4-mapped IPv6 metadata address", async () => {
    lookupMock.mockResolvedValue(["::ffff:169.254.169.254"]);
    expect(await reject("https://mapped.attacker.example")).toMatch(
      /resolves to a private or loopback address/i,
    );
  });

  it("reports an unresolvable name as a URL problem", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await reject("https://nope.example")).toMatch(/Could not resolve/i);
  });

  it("rejects a value that is not a URL at all", async () => {
    expect(await reject("not a url")).toMatch(/not a valid URL/i);
  });

  it.each([
    "http://localhost:8448",
    "https://127.0.0.1:8448",
    "https://[::1]:8448",
  ])(
    "allows %s outside production, so the feature stays testable against a local homeserver",
    async (url) => {
      process.env.NODE_ENV = "development";
      await expect(assertSafeHomeserverUrl(url, lookupMock)).resolves.toBeUndefined();
    },
  );

  it("refuses localhost in production, where loopback can only be this server", async () => {
    process.env.NODE_ENV = "production";
    expect(await reject("http://localhost:8448")).toMatch(/must use https/i);
    expect(await reject("https://127.0.0.1:8448")).toMatch(/private or loopback/i);
    expect(await reject("https://[::1]:8448")).toMatch(/private or loopback/i);
  });
});
