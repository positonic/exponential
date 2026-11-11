import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPublicBaseUrlFromEnv } from "../urls";

// urls.ts also exports the request-scoped resolver, which imports next/headers;
// the env-only helper under test never calls it.
vi.mock("next/headers", () => ({ headers: () => new Headers() }));

const URL_ENV = [
  "NEXT_PUBLIC_APP_URL",
  "VERCEL",
  "NEXTAUTH_URL",
  "RAILWAY_PUBLIC_DOMAIN",
  "PORT",
] as const;

describe("getPublicBaseUrlFromEnv", () => {
  beforeEach(() => {
    // Start every case from a blank slate so a developer's shell env can't leak in.
    for (const name of URL_ENV) vi.stubEnv(name, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves to exponential.im on Vercel with nothing else set (production unchanged)", () => {
    vi.stubEnv("VERCEL", "1");

    expect(getPublicBaseUrlFromEnv()).toBe("https://www.exponential.im");
  });

  it("never resolves to exponential.im off Vercel", () => {
    expect(getPublicBaseUrlFromEnv()).not.toContain("exponential.im");
    expect(getPublicBaseUrlFromEnv()).toBe("http://localhost:3000");
  });

  it("keeps NEXT_PUBLIC_APP_URL ahead of everything, trailing slash stripped", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NEXTAUTH_URL", "https://auth.example.com");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "exp.up.railway.app");

    expect(getPublicBaseUrlFromEnv()).toBe("https://app.example.com");
  });

  it("prefers the Vercel production URL over NEXTAUTH_URL on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NEXTAUTH_URL", "https://auth.example.com");

    expect(getPublicBaseUrlFromEnv()).toBe("https://www.exponential.im");
  });

  it("uses NEXTAUTH_URL off Vercel, ahead of the Railway domain", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://exp.example.org/");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "exp.up.railway.app");
    vi.stubEnv("PORT", "8080");

    expect(getPublicBaseUrlFromEnv()).toBe("https://exp.example.org");
  });

  it("uses the Railway public domain over HTTPS when NEXTAUTH_URL is unset", () => {
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "exp.up.railway.app");
    vi.stubEnv("PORT", "8080");

    expect(getPublicBaseUrlFromEnv()).toBe("https://exp.up.railway.app");
  });

  it("falls back to localhost on PORT", () => {
    vi.stubEnv("PORT", "8080");

    expect(getPublicBaseUrlFromEnv()).toBe("http://localhost:8080");
  });

  it("treats empty strings as unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "");
    vi.stubEnv("PORT", "");

    expect(getPublicBaseUrlFromEnv()).toBe("http://localhost:3000");
  });
});
