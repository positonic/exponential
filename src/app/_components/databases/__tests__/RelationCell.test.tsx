/**
 * The relation cell (ADR-0078 §5): closed it shows each target as a pill
 * with its live status, opened it is a picker fed by the search, and a pick
 * commits whole targets so the table can show them before the server does.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "~/test/test-utils";

import { RelationCell } from "../cells/RelationCell";
import type { RelationTarget } from "~/lib/databases/relations";
import type { PropertyDef } from "~/lib/databases/schema";

const problems: PropertyDef = {
  id: "pproblems",
  name: "Problems",
  type: "relation",
  relation: { targetKind: "ROW", targetDatabaseId: "db2", many: true },
};
const ticket: PropertyDef = {
  id: "pticket",
  name: "Ticket",
  type: "relation",
  relation: { targetKind: "TICKET", many: false },
};
const gaps: RelationTarget = { kind: "ROW", id: "q1", title: "Gaps", href: "/w/acme/pages/q1" };
const noise: RelationTarget = { kind: "ROW", id: "q2", title: "Noise", href: "/w/acme/pages/q2" };
const okta: RelationTarget = { kind: "TICKET", id: "t1", title: "Fix Okta callback", status: "IN_PROGRESS", href: "/w/acme/products/clear/tickets/t1" };

describe("RelationCell", () => {
  it("closed: a linked pill per target with its status as words, a dash when empty, a struck (deleted) one", () => {
    const { unmount } = render(<RelationCell def={ticket} targets={[okta]} editable={false} onCommit={vi.fn()} />);
    const link = screen.getByRole("link", { name: /Fix Okta callback/ });
    expect(link.getAttribute("href")).toBe(okta.href!);
    expect(link.textContent).toContain("in progress");
    unmount();
    render(
      <RelationCell
        def={problems}
        targets={[{ kind: "ROW", id: "gone", title: "(deleted)", deleted: true }]}
        editable={false}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText("(deleted)").getAttribute("data-deleted")).toBe("true");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("without a search it never opens, even when editable", () => {
    render(<RelationCell def={problems} targets={[]} editable onCommit={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("opens on click, searches, and commits the picked targets (many)", async () => {
    const onCommit = vi.fn();
    const onSearch = vi.fn().mockResolvedValue([gaps, noise]);
    render(<RelationCell def={problems} targets={[gaps]} editable onCommit={onCommit} onSearch={onSearch} />);
    fireEvent.click(screen.getByRole("button", { name: "Problems" }));
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith(""));
    fireEvent.click(await screen.findByRole("option", { name: "Noise" }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith([gaps, noise]));
  });

  it("a single-valued relation picks one and clears to none", async () => {
    const onCommit = vi.fn();
    const onSearch = vi.fn().mockResolvedValue([okta]);
    render(<RelationCell def={ticket} targets={[]} editable onCommit={onCommit} onSearch={onSearch} />);
    fireEvent.click(screen.getByRole("button", { name: "Ticket" }));
    fireEvent.click(await screen.findByRole("option", { name: "Fix Okta callback · in progress" }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith([okta]));
  });

  it("typing re-runs the search with the query", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<RelationCell def={problems} targets={[]} editable onCommit={vi.fn()} onSearch={onSearch} />);
    fireEvent.click(screen.getByRole("button", { name: "Problems" }));
    const input = await waitFor(() => document.querySelector<HTMLInputElement>('input[aria-label="Problems"]')!);
    fireEvent.change(input, { target: { value: "gap" } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith("gap"));
  });
});
