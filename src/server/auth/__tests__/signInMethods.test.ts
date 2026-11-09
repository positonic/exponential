/**
 * The resolver every sign-in surface reads: which ways in this install has
 * (OAuth providers, an email transport, opt-in log delivery) and, when there
 * are none, which variables an operator could set.
 */

import { describe, expect, it } from "vitest";
import {
  resolveEnvEmailTransport,
  resolveSignInMethods,
  signInMethodWarnings,
} from "../signInMethods";

const GOOGLE = { GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" };
const SMTP = { SMTP_HOST: "smtp.example.test", EMAIL_FROM: "auth@example.test" };

describe("resolveSignInMethods", () => {
  it("with nothing set, offers no way in and names what an operator could set", () => {
    const methods = resolveSignInMethods({});

    expect(methods).toMatchObject({
      google: false,
      discord: false,
      notion: false,
      microsoft: false,
      emailDelivery: null,
    });
    expect(methods.missing).toEqual(
      expect.arrayContaining([
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "AUTH_DISCORD_ID",
        "AUTH_DISCORD_SECRET",
        "SMTP_HOST",
        "EMAIL_FROM",
        "AUTH_POSTMARK_KEY",
        "AUTH_LOG_SIGN_IN_CODES",
      ]),
    );
  });

  it("a Google id and secret enable Google, and nothing is missing", () => {
    const methods = resolveSignInMethods(GOOGLE);
    expect(methods.google).toBe(true);
    expect(methods.missing).toEqual([]);
  });

  it("a Discord id without its secret does not enable Discord", () => {
    const methods = resolveSignInMethods({ AUTH_DISCORD_ID: "d-id" });
    expect(methods.discord).toBe(false);
    expect(methods.missing).not.toEqual([]);
  });

  it("treats empty strings as unset", () => {
    expect(resolveSignInMethods({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }).google).toBe(false);
  });

  it("Microsoft stays off while its kill switch is off, even with keys", () => {
    const methods = resolveSignInMethods({
      MICROSOFT_ENTRA_ID_CLIENT_ID: "m-id",
      MICROSOFT_ENTRA_ID_CLIENT_SECRET: "m-secret",
    });
    expect(methods.microsoft).toBe(false);
  });

  it("a Postmark key delivers email over Postmark", () => {
    expect(resolveSignInMethods({ AUTH_POSTMARK_KEY: "pm" }).emailDelivery).toBe("postmark");
    expect(resolveSignInMethods({ POSTMARK_SERVER_TOKEN: "pm" }).emailDelivery).toBe("postmark");
  });

  it("SMTP plus a sender delivers email over SMTP", () => {
    expect(resolveSignInMethods(SMTP).emailDelivery).toBe("smtp");
    expect(
      resolveSignInMethods({ SMTP_HOST: "smtp.example.test", AUTH_POSTMARK_FROM: "a@example.test" }).emailDelivery,
    ).toBe("smtp");
  });

  it("SMTP without a sender counts as not configured", () => {
    const methods = resolveSignInMethods({ SMTP_HOST: "smtp.example.test" });
    expect(methods.emailDelivery).toBeNull();
    expect(methods.missing).toContain("EMAIL_FROM");
  });

  it("Postmark wins when both Postmark and SMTP are configured", () => {
    expect(resolveSignInMethods({ ...SMTP, AUTH_POSTMARK_KEY: "pm" }).emailDelivery).toBe("postmark");
  });

  it.each(["true", "1"])("AUTH_LOG_SIGN_IN_CODES=%s with no transport turns on log delivery", (flag) => {
    const methods = resolveSignInMethods({ AUTH_LOG_SIGN_IN_CODES: flag });
    expect(methods.emailDelivery).toBe("log");
    expect(methods.missing).toEqual([]);
  });

  it("the log flag is ignored when a transport is configured", () => {
    expect(resolveSignInMethods({ ...SMTP, AUTH_LOG_SIGN_IN_CODES: "true" }).emailDelivery).toBe("smtp");
    expect(resolveSignInMethods({ AUTH_POSTMARK_KEY: "pm", AUTH_LOG_SIGN_IN_CODES: "1" }).emailDelivery).toBe(
      "postmark",
    );
  });

  it.each([["false"], ["0"], ["yes"], [undefined]])("AUTH_LOG_SIGN_IN_CODES=%s is not log delivery", (flag) => {
    expect(resolveSignInMethods({ AUTH_LOG_SIGN_IN_CODES: flag }).emailDelivery).toBeNull();
  });
});

describe("resolveEnvEmailTransport", () => {
  it("never returns log delivery", () => {
    expect(resolveEnvEmailTransport({ AUTH_LOG_SIGN_IN_CODES: "true" })).toBeNull();
  });
});

describe("signInMethodWarnings", () => {
  it("is quiet for an ordinary install", () => {
    expect(signInMethodWarnings({ AUTH_POSTMARK_KEY: "pm", ...GOOGLE })).toEqual([]);
  });

  it("warns loudly when log delivery is on", () => {
    const [warning] = signInMethodWarnings({ AUTH_LOG_SIGN_IN_CODES: "true" });
    expect(warning).toMatch(/AUTH_LOG_SIGN_IN_CODES/);
    expect(warning).toMatch(/anyone who can read/i);
  });

  it("warns that the log flag is ignored when a transport is configured", () => {
    const [warning] = signInMethodWarnings({ ...SMTP, AUTH_LOG_SIGN_IN_CODES: "true" });
    expect(warning).toMatch(/ignored/i);
  });
});
