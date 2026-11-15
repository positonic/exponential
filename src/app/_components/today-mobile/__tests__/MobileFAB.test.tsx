/**
 * The add button and the assistant launcher share the bottom-right corner of
 * phone-width Today. The add button stacks above the launcher exactly when the
 * launcher is on screen, and keeps the corner to itself when it is not.
 */

import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "~/test/test-utils";
import { AiCapabilitiesProvider } from "~/providers/AiCapabilitiesProvider";
import type { AiCapabilities } from "~/server/services/ai/capabilities";

// The provider only queries when it isn't seeded; every test here seeds it.
vi.mock("~/trpc/react", () => ({
  api: { ai: { getCapabilities: { useQuery: () => ({ data: undefined }) } } },
}));
// Only the trigger button is under test, not the modal it opens.
vi.mock("../../CreateActionModal", () => ({
  CreateActionModal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { MobileFAB } from "../MobileFAB";

const OFF: AiCapabilities = { openai: false, anthropic: false, assistant: false, summaries: false, voice: false };
const ON: AiCapabilities = { ...OFF, assistant: true };

function renderWith(capabilities: AiCapabilities) {
  render(
    <AiCapabilitiesProvider capabilities={capabilities}>
      <MobileFAB />
    </AiCapabilitiesProvider>,
  );
  return screen.getByRole("button", { name: "Create action" });
}

describe("MobileFAB", () => {
  it("stacks above the assistant launcher when the launcher is shown", () => {
    expect(renderWith(ON).hasAttribute("data-above-launcher")).toBe(true);
  });

  it("keeps the corner when the install has no Assistant", () => {
    expect(renderWith(OFF).hasAttribute("data-above-launcher")).toBe(false);
  });
});
