/**
 * UI gating: with no Assistant the Ask-Zoe button is gone and opening the
 * drawer explains how to turn it on; with every key set (exponential.im) the
 * button renders as before.
 */

import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "~/test/test-utils";
import { AiCapabilitiesProvider } from "~/providers/AiCapabilitiesProvider";
import { AgentModalProvider } from "~/providers/AgentModalProvider";
import { AiNotConfiguredNote } from "../AiNotConfiguredNote";
import type { AiCapabilities } from "~/server/services/ai/capabilities";

// The provider only queries when it isn't seeded; every test here seeds it.
vi.mock("~/trpc/react", () => ({
  api: { ai: { getCapabilities: { useQuery: () => ({ data: undefined }) } } },
}));
// ZoeDrawer pulls in the chat surface's providers; only the off path and the
// FAB are rendered here.
vi.mock("~/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({ workspace: null, workspaceId: null }),
}));

import { ZoeDrawer, ZoeFab } from "~/app/_components/layout/ZoeDrawer";

const OFF: AiCapabilities = { openai: false, anthropic: false, assistant: false, summaries: false, voice: false };
const ON: AiCapabilities = { openai: true, anthropic: true, assistant: true, summaries: true, voice: true };

function withCapabilities(capabilities: AiCapabilities) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AiCapabilitiesProvider capabilities={capabilities}>
        <AgentModalProvider>{children}</AgentModalProvider>
      </AiCapabilitiesProvider>
    );
  };
}

describe("AI gating in the UI", () => {
  it("hides the Ask-Zoe button when the install has no Assistant", () => {
    const Wrapper = withCapabilities(OFF);
    render(
      <Wrapper>
        <ZoeFab />
      </Wrapper>,
    );
    expect(screen.queryByRole("button", { name: /open zoe/i })).toBeNull();
  });

  it("shows the Ask-Zoe button when the Assistant is configured (exponential.im)", () => {
    const Wrapper = withCapabilities(ON);
    render(
      <Wrapper>
        <ZoeFab />
      </Wrapper>,
    );
    expect(screen.getByRole("button", { name: /open zoe/i })).toBeTruthy();
  });

  it("the Assistant drawer explains how to turn the Assistant on when there is none", () => {
    const Wrapper = withCapabilities(OFF);
    render(
      <Wrapper>
        <ZoeDrawer />
      </Wrapper>,
    );
    // Closed, the drawer is aria-hidden; the note is what opening it reveals.
    expect(screen.getByRole("note", { hidden: true }).textContent).toContain("MASTRA_API_URL");
  });

  it("the note names the feature and the variable to set", () => {
    render(<AiNotConfiguredNote requirement="summaries" feature="Meeting summaries" />);
    expect(screen.getByRole("note").textContent).toBe(
      "Meeting summaries: this install has no OpenAI or Anthropic key. Add OPENAI_API_KEY or ANTHROPIC_API_KEY and restart to turn it on.",
    );
  });
});
