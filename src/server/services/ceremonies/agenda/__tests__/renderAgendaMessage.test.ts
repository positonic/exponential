import { describe, expect, it } from "vitest";
import { renderAgendaMessage } from "../renderAgendaMessage";
import type { AgendaItem, AgendaSection, AgendaSnapshot } from "../types";

const item = (over: Partial<AgendaItem>): AgendaItem => ({ id: "i", sectionKey: "s", title: "Item", refType: "text", refId: "i", order: 0, ...over });
const section = (over: Partial<AgendaSection>): AgendaSection => ({ key: "s", type: "free_text", title: "Section", items: [], ...over });
const snapshot = (sections: AgendaSection[]): AgendaSnapshot => ({ version: 1, generatedAt: "x", sections });

const project = (over: Partial<AgendaItem>) =>
  item({
    refType: "project",
    title: "⚠️ Launch",
    owner: "James Farrell",
    lines: ["Next: Write the post (overdue, 26 Sept)", "0% · 3 open, 2 overdue · ended 29 Sept"],
    needsAttention: true,
    href: "/w/acme/projects/launch-p1",
    detail: "DRI James Farrell · next: Write the post (overdue, 26 Sept) · 0% · 3 open, 2 overdue · ended 29 Sept",
    ...over,
  });

const render = (sections: AgendaSection[], url = "https://app.test/w/acme/ceremonies/c/o") =>
  renderAgendaMessage({ ceremonyName: "Leadership Weekly", when: "Fri 2 Oct, 15:30", agenda: snapshot(sections), url, baseUrl: "https://app.test" });

describe("renderAgendaMessage", () => {
  it("opens with a title and a summary that counts the items needing attention", () => {
    const { html, text } = render([
      section({ key: "p", type: "linked_projects", title: "Projects", items: [project({ id: "a" }), project({ id: "b", title: "Calm", needsAttention: false })] }),
    ]);
    expect(html).toContain("<h4>🗓️ Leadership Weekly</h4>");
    expect(html).toContain("<p>Agenda for Fri 2 Oct, 15:30 · 2 items · ⚠️ 1 needs attention</p>");
    expect(text.split("\n").slice(0, 2)).toEqual(["🗓️ Leadership Weekly", "Agenda for Fri 2 Oct, 15:30 · 2 items · ⚠️ 1 needs attention"]);
  });

  it("renders a project as a card: linked name and owner, then each line on its own", () => {
    const { html, text } = render([section({ key: "p", type: "linked_projects", title: "Projects", items: [project({})] })]);
    expect(html).toContain("<h5>📁 Projects</h5>");
    expect(html).toContain(
      '<p><strong><a href="https://app.test/w/acme/projects/launch-p1">⚠️ Launch</a></strong> — James Farrell<br/>Next: Write the post (overdue, 26 Sept)<br/><em>0% · 3 open, 2 overdue · ended 29 Sept</em></p>',
    );
    expect(text).toContain("⚠️ Launch — James Farrell\n   Next: Write the post (overdue, 26 Sept)\n   0% · 3 open, 2 overdue · ended 29 Sept");
    // The one-line `detail` is the app's; the card does not repeat it.
    expect(text).not.toContain("DRI James Farrell ·");
  });

  it("folds empty sections into one line after the content instead of a heading each", () => {
    const { html, text } = render([
      section({ key: "a", title: "Discussion points", minutes: 40 }),
      section({ key: "b", title: "What's next?" }),
      section({ key: "c", type: "decisions_pending", title: "Decisions pending", items: [item({ title: "Pick a vendor" })] }),
    ]);
    expect(html).not.toContain("Nothing to raise");
    expect(html).toContain("<h5>⚖️ Decisions pending</h5><ul><li>Pick a vendor</li></ul>");
    expect(html.indexOf("Pick a vendor")).toBeLessThan(html.indexOf("💤"));
    expect(text).toContain("💤 Nothing raised yet for Discussion points and What's next?.");
    expect(render([section({})]).text).toContain("💤 Nothing on the agenda yet.");
  });

  it("shows minutes, carried-over and resolved items on plain bullets", () => {
    const { html, text } = render([
      section({
        type: "blockers",
        title: "Blockers",
        minutes: 10,
        items: [
          item({ id: "1", title: "Fix login", detail: "due 2 Oct", carriedFromOccurrenceId: "o-0" }),
          item({ id: "2", title: "Ship it", resolvedAt: "2026-10-01T00:00:00Z" }),
        ],
      }),
    ]);
    expect(html).toContain("<h5>🚧 Blockers · 10 min</h5>");
    expect(html).toContain("<li>Fix login <em>— due 2 Oct · ↩️ carried over</em></li>");
    expect(html).toContain("<li><del>Ship it</del></li>");
    expect(text).toContain("• Ship it (done)");
    // A resolved item is not one to get through.
    expect(html).toContain("<p>Agenda for Fri 2 Oct, 15:30 · 1 item</p>");
  });

  it("escapes record text so a record title cannot post a live link or markup", () => {
    const { html, text } = render([
      section({ items: [item({ title: "[Approve](https://evil.example) <b>now</b>", detail: "**urgent**" })] }),
    ]);
    expect(html).not.toContain('href="https://evil.example"');
    expect(html).not.toContain("<b>now</b>");
    expect(html).toContain("[Approve](https://evil.example) &lt;b&gt;now&lt;/b&gt;");
    expect(html).toContain("**urgent**");
    expect(text).toContain("[Approve](https://evil.example)");
  });

  it("keeps the Markdown of a hand-added item, which a person wrote for this agenda", () => {
    const { html, text } = render([
      section({ items: [item({ title: "Review our [projects](https://app.test/w/x/projects)", addedByUserId: "u-1" })] }),
    ]);
    expect(html).toContain('<li>Review our <a href="https://app.test/w/x/projects">projects</a></li>');
    expect(text).toContain("• Review our projects (https://app.test/w/x/projects)");
  });

  it("links the occurrence only when the URL is absolute, and leaves items unlinked without a base", () => {
    const relative = renderAgendaMessage({
      ceremonyName: "Retro",
      when: "Fri",
      agenda: snapshot([section({ type: "linked_projects", items: [project({})] })]),
      url: "/w/acme/ceremonies/c/o",
    });
    expect(relative.html).not.toContain("<a ");
    expect(relative.html).toContain("<p>🔗 /w/acme/ceremonies/c/o</p>");
  });
});
