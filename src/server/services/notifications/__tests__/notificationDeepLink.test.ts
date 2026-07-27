/**
 * Unit tests for `notificationDeepLink` — the single source of a notification's
 * click destination, used by the web-push payload and in-app navigation.
 */

import { describe, it, expect } from "vitest";
import { notificationDeepLink } from "../notificationDeepLink";

describe("notificationDeepLink", () => {
  it("deep-links a transcription_completed notification to its meeting", () => {
    expect(
      notificationDeepLink({
        type: "transcription_completed",
        metadata: { transcriptionId: "trx-123" },
      }),
    ).toBe("/recording/trx-123");
  });

  it("parses metadata stored as a JSON string (the webhook's shape)", () => {
    expect(
      notificationDeepLink({
        type: "transcription_completed",
        metadata: JSON.stringify({ transcriptionId: "trx-456", actionItemCount: 2 }),
      }),
    ).toBe("/recording/trx-456");
  });

  it("falls back to the inbox when the transcription id is missing", () => {
    expect(
      notificationDeepLink({ type: "transcription_completed", metadata: {} }),
    ).toBe("/meetings");
    expect(
      notificationDeepLink({ type: "transcription_completed", metadata: null }),
    ).toBe("/meetings");
    expect(
      notificationDeepLink({ type: "transcription_completed", metadata: "not json" }),
    ).toBe("/meetings");
  });

  it("returns the app root for notification types without a deep link", () => {
    expect(
      notificationDeepLink({ type: "daily_summary", metadata: null }),
    ).toBe("/");
  });
});
