import { test, expect, describe } from "vitest";
import { getCalendarErrorMessage } from "./calendarConnectionMessages";

describe("getCalendarErrorMessage", () => {
  // These are the codes the OAuth callbacks actually redirect with. If a
  // callback grows a new one, this list should grow with it — an unmapped code
  // silently degrades to the provider fallback, which is what let
  // `account_linked_elsewhere` go unhandled on every surface.
  const EMITTED_CODES = [
    "access_denied",
    "invalid_request",
    "no_refresh_token",
    "token_exchange_failed",
    "account_linked_elsewhere",
  ];

  test.each(EMITTED_CODES)("maps %s to a specific message", (code) => {
    const fallback = "Failed to connect calendar.";
    expect(getCalendarErrorMessage(code, fallback)).not.toBe(fallback);
  });

  test("account_linked_elsewhere explains the conflict", () => {
    expect(getCalendarErrorMessage("account_linked_elsewhere")).toContain(
      "already connected to a different user",
    );
  });

  test("falls back to the provider-specific message for unknown codes", () => {
    expect(
      getCalendarErrorMessage("something_new", "Failed to connect Outlook Calendar."),
    ).toBe("Failed to connect Outlook Calendar.");
  });

  test("falls back to a generic message when no fallback is given", () => {
    expect(getCalendarErrorMessage("something_new")).toBe(
      "Failed to connect calendar.",
    );
  });
});
