import { describe, expect, it } from "vitest";
import { colorTokens } from "~/styles/colors";
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
    lines: [
      [{ text: "Next: " }, { text: "Write the post", href: "/w/acme/actions/a1" }, { text: " (overdue, 26 Sept)" }],
      [{ text: "3 open, 2 overdue" }, { text: " · " }, { text: "ended 29 Sept", warn: true }],
    ],
    href: "/w/acme/projects/launch-p1",
    detail: "DRI James Farrell · next: Write the post (overdue, 26 Sept) · 0% · 3 open, 2 overdue · ended 29 Sept",
    ...over,
  });

const red = colorTokens.dark.brand.error;

const render = (sections: AgendaSection[], url = "https://app.test/w/acme/ceremonies/c/o") =>
  renderAgendaMessage({ ceremonyName: "Leadership Weekly", when: "Fri 2 Oct, 15:30", agenda: snapshot(sections), url, baseUrl: "https://app.test" });

describe("renderAgendaMessage", () => {
  it("opens with the title and the date, and no item counts", () => {
    const { html, text } = render([section({ key: "p", type: "linked_projects", title: "Projects", items: [project({})] })]);
    expect(html.startsWith("<h4>🗓️ Leadership Weekly</h4><p>Agenda for Fri 2 Oct, 15:30<br/><br/><strong>📁 Projects</strong><br/><br/>")).toBe(true);
    expect(text.startsWith("🗓️ Leadership Weekly\n\nAgenda for Fri 2 Oct, 15:30\n\n📁 Projects\n\n")).toBe(true);
    expect(html).not.toMatch(/\d+ items?/);
    expect(html).not.toContain("need attention");
  });

  it("renders a project as a card: linked name and owner, a linked next action, flagged past dates", () => {
    const { html, text } = render([section({ key: "p", type: "linked_projects", title: "Projects", items: [project({})] })]);
    expect(html).toContain(
      '<strong><a href="https://app.test/w/acme/projects/launch-p1">⚠️ Launch</a></strong> — James Farrell<br/>' +
        'Next: <a href="https://app.test/w/acme/actions/a1">Write the post</a> (overdue, 26 Sept)<br/>' +
        `<em>3 open, 2 overdue · <font color="${red}" data-mx-color="${red}">⚠️ ended 29 Sept</font></em>`,
    );
    expect(text).toContain("⚠️ Launch — James Farrell\n   Next: Write the post (overdue, 26 Sept)\n   3 open, 2 overdue · ⚠️ ended 29 Sept");
    // The one-line `detail` is the app's; the card does not repeat it, percentage and all.
    expect(text).not.toContain("0%");
  });

  it("puts a blank line between cards", () => {
    const { html, text } = render([
      section({ key: "p", type: "linked_projects", title: "Projects", items: [project({ id: "a" }), project({ id: "b", title: "Calm" })] }),
    ]);
    expect(html).toContain('ended 29 Sept</font></em><br/><br/><strong><a href="https://app.test/w/acme/projects/launch-p1">Calm</a>');
    expect(text).toContain("⚠️ ended 29 Sept\n\nCalm — James Farrell");
  });

  it("still renders a card whose lines are plain strings, from a snapshot written before spans", () => {
    const { html } = render([section({ type: "linked_projects", items: [project({ lines: ["Next: Old line", "0% · 1 open"] })] })]);
    expect(html).toContain("<br/>Next: Old line<br/><em>0% · 1 open</em>");
  });

  it("folds empty sections into one line after the content instead of a heading each", () => {
    const { html, text } = render([
      section({ key: "a", title: "Discussion points", minutes: 40 }),
      section({ key: "b", title: "What's next?" }),
      section({ key: "c", type: "decisions_pending", title: "Decisions pending", items: [item({ title: "Pick a vendor" })] }),
    ]);
    expect(html).not.toContain("Nothing to raise");
    expect(html).toContain("<strong>⚖️ Decisions pending</strong><br/><br/>• Pick a vendor<br/><br/>");
    expect(html.indexOf("Pick a vendor")).toBeLessThan(html.indexOf("💤"));
    expect(text).toContain("💤 Nothing raised yet for Discussion points and What's next?.");
    expect(render([section({})]).text).toContain("💤 Nothing on the agenda yet.");
  });

  it("shows minutes, carried-over and resolved items on plain bullets, a line each", () => {
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
    expect(html).toContain("<strong>🚧 Blockers · 10 min</strong>");
    expect(html).toContain("• Fix login <em>— due 2 Oct · ↩️ carried over</em><br/>• <del>Ship it</del>");
    expect(text).toContain("• Fix login — due 2 Oct · ↩️ carried over\n• Ship it (done)");
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
    expect(html).toContain('• Review our <a href="https://app.test/w/x/projects">projects</a>');
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
    expect(relative.html).toContain("🔗 /w/acme/ceremonies/c/o</p>");
  });
});
