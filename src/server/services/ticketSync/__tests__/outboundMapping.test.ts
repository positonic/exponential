import { describe, expect, it } from "vitest";
import {
  findTitleProperty,
  mapFieldsToNotion,
  type NotionDbSchema,
  type OutboundPropertyNames,
} from "../outboundMapping";

const PROPERTY_NAMES: OutboundPropertyNames = {
  status: "Status",
  priority: "Priority",
  type: "Type",
  effort: "Effort",
  label: "Label",
  cycle: "Cycles",
  assignee: "Assignee",
};

const SCHEMA: NotionDbSchema = {
  Name: { type: "title", options: [] },
  Status: { type: "status", options: ["Backlog", "In Progress", "Done", "QA"] },
  Priority: { type: "select", options: ["0 - Critical", "1 - High", "2 - Medium"] },
  Type: { type: "select", options: ["Bug", "Feature", "Chore"] },
  Effort: { type: "number", options: [] },
  Label: { type: "multi_select", options: [] },
};

function ctx(overrides: Partial<Parameters<typeof mapFieldsToNotion>[1]> = {}) {
  return {
    schema: SCHEMA,
    propertyNames: PROPERTY_NAMES,
    statusMap: null,
    titleProperty: "Name",
    currentRemoteStatusRaw: "Backlog",
    ...overrides,
  };
}

describe("mapFieldsToNotion", () => {
  it("writes the title into the title property", () => {
    const r = mapFieldsToNotion({ title: "New title" }, ctx());
    expect(r.properties.Name).toEqual({
      title: [{ text: { content: "New title" } }],
    });
    expect(r.wrote).toEqual(["title"]);
  });

  it("writes a status option using the status-typed payload", () => {
    const r = mapFieldsToNotion({ status: "IN_PROGRESS" }, ctx());
    expect(r.properties.Status).toEqual({ status: { name: "In Progress" } });
    expect(r.wrote).toContain("status");
  });

  it("skips status with a warning when no option maps to it", () => {
    const r = mapFieldsToNotion(
      { status: "NEEDS_REFINEMENT" },
      ctx({ schema: { ...SCHEMA, Status: { type: "status", options: ["Backlog", "Done"] } } }),
    );
    expect(r.properties.Status).toBeUndefined();
    expect(r.skipped).toContain("status");
    expect(r.warnings.join(" ")).toContain("no Notion status option");
  });

  it("does not write status when the page already collapses to it (sticky)", () => {
    const r = mapFieldsToNotion(
      { status: "IN_PROGRESS" },
      ctx({ currentRemoteStatusRaw: "In Progress" }),
    );
    expect(r.properties.Status).toBeUndefined();
    expect(r.skipped).not.toContain("status");
    expect(r.warnings).toHaveLength(0);
  });

  it("maps priority to the matching select option", () => {
    const r = mapFieldsToNotion({ priority: 1 }, ctx());
    expect(r.properties.Priority).toEqual({ select: { name: "1 - High" } });
  });

  it("skips priority with a warning when no option matches", () => {
    const r = mapFieldsToNotion({ priority: 4 }, ctx());
    expect(r.properties.Priority).toBeUndefined();
    expect(r.skipped).toContain("priority");
  });

  it("writes priority as a number when the property is numeric", () => {
    const r = mapFieldsToNotion(
      { priority: 3 },
      ctx({ schema: { ...SCHEMA, Priority: { type: "number", options: [] } } }),
    );
    expect(r.properties.Priority).toEqual({ number: 3 });
  });

  it("clears a select when the value is null", () => {
    const r = mapFieldsToNotion({ priority: null }, ctx());
    expect(r.properties.Priority).toEqual({ select: null });
  });

  it("maps type to the matching select option", () => {
    const r = mapFieldsToNotion({ type: "BUG" }, ctx());
    expect(r.properties.Type).toEqual({ select: { name: "Bug" } });
  });

  it("writes points into a numeric effort property", () => {
    const r = mapFieldsToNotion({ points: 5 }, ctx());
    expect(r.properties.Effort).toEqual({ number: 5 });
  });

  it("writes labels as multi_select options", () => {
    const r = mapFieldsToNotion({ labels: ["urgent", "backend"] }, ctx());
    expect(r.properties.Label).toEqual({
      multi_select: [{ name: "urgent" }, { name: "backend" }],
    });
  });

  it("skips a field whose property is missing from the schema", () => {
    const r = mapFieldsToNotion(
      { type: "BUG" },
      ctx({ schema: { Name: { type: "title", options: [] } } }),
    );
    expect(r.properties.Type).toBeUndefined();
    expect(r.skipped).toContain("type");
  });

  it("ignores relational fields (engine resolves those)", () => {
    const r = mapFieldsToNotion(
      { cycleName: "Cycle 12", assigneeEmail: "a@b.com" },
      ctx(),
    );
    expect(r.properties).toEqual({});
    expect(r.wrote).toHaveLength(0);
  });
});

describe("findTitleProperty", () => {
  it("returns the title-typed property name", () => {
    expect(findTitleProperty(SCHEMA)).toBe("Name");
  });
  it("returns null when there is no title property", () => {
    expect(findTitleProperty({ X: { type: "rich_text" } })).toBeNull();
  });
});
