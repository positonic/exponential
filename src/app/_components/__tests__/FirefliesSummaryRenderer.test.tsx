/**
 * The structured (Fireflies-shaped) summary's prose fields may be plain text
 * or markdown — the summarizer emits **bold** and lists in the overview — and
 * both must render as formatted prose, never as raw markup.
 */

import { describe, expect, test } from "vitest";
import { render, screen } from "~/test/test-utils";

import { FirefliesSummaryDisplay } from "~/app/_components/FirefliesSummaryRenderer";

describe("FirefliesSummaryDisplay", () => {
  test("renders markdown in the overview", () => {
    render(
      <FirefliesSummaryDisplay
        summary={{ overview: "We **decided** to ship.\n\n- first\n- second" }}
      />,
    );

    expect(screen.getByText("decided").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/\*\*decided\*\*/)).toBeNull();
  });

  test("keeps typed line breaks in a plain-text overview", () => {
    const { container } = render(
      <FirefliesSummaryDisplay summary={{ overview: "Line one\nLine two" }} />,
    );

    // A single newline stays a visible break rather than collapsing into a space.
    expect(container.querySelector("br")).not.toBeNull();
    expect(screen.getByText(/Line one/)).not.toBeNull();
    expect(screen.getByText(/Line two/)).not.toBeNull();
  });
});
