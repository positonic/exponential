/**
 * Unit tests for the `create_insight` Form destination (ADR-0037). Pins the
 * behaviour the public intake relies on: a submission lands ONE raw product
 * `Insight` in `INBOX`, stamped `source = "form:<slug>"`, with the configured
 * (non-PROBLEM) type or the `FEEDBACK` default — never pre-triaged, never a
 * `PROBLEM`, and never on a product outside the form's own workspace. No CRM
 * entity is created.
 *
 * Prisma is mocked via `mockDeep<PrismaClient>()`, so no real DB is touched and
 * the tests run in milliseconds.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { CreateInsightDestination } from "../CreateInsightDestination";

const db = mockDeep<PrismaClient>();

const context = {
  formId: "form-1",
  formSlug: "beta-feedback",
  workspaceId: "ws-1",
  submissionId: "sub-1",
  ownerId: "owner-1",
};

const config = {
  productId: "prod-1",
  insightType: "FEEDBACK",
  fieldMap: { title: "headline", body: "detail" },
};

const data = {
  headline: "Checkout is confusing",
  detail: "I couldn't find the pay button.",
};

function makeDestination(): {
  dest: CreateInsightDestination;
  db: DeepMockProxy<PrismaClient>;
} {
  return { dest: new CreateInsightDestination(db), db };
}

beforeEach(() => {
  mockReset(db);
  // Product belongs to the form's workspace by default.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.product.findFirst.mockResolvedValue({ id: "prod-1" } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.insight.create.mockResolvedValue({ id: "insight-1" } as any);
});

describe("CreateInsightDestination", () => {
  it("creates ONE INBOX insight with the mapped title/body, type, and source stamp", async () => {
    const { dest } = makeDestination();

    const result = await dest.run(data, config, context);

    expect(db.insight.create).toHaveBeenCalledTimes(1);
    const createArgs = db.insight.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({
      productId: "prod-1",
      type: "FEEDBACK",
      title: "Checkout is confusing",
      body: "I couldn't find the pay button.",
      source: "form:beta-feedback",
      status: "INBOX",
      description: "Checkout is confusing",
      createdById: "owner-1",
    });
    expect(result).toMatchObject({
      insightId: "insight-1",
      type: "FEEDBACK",
      status: "INBOX",
      source: "form:beta-feedback",
    });
  });

  it("defaults the type to FEEDBACK when none is configured", async () => {
    const { dest } = makeDestination();

    await dest.run(data, { ...config, insightType: undefined }, context);

    expect(db.insight.create.mock.calls[0]?.[0]?.data).toMatchObject({
      type: "FEEDBACK",
    });
  });

  it("coerces a configured PROBLEM type to FEEDBACK — a form never lands a PROBLEM", async () => {
    const { dest } = makeDestination();

    await dest.run(data, { ...config, insightType: "PROBLEM" }, context);

    const created = db.insight.create.mock.calls[0]?.[0]?.data;
    expect(created?.type).toBe("FEEDBACK");
    expect(created?.type).not.toBe("PROBLEM");
  });

  it("coerces an unknown type to FEEDBACK", async () => {
    const { dest } = makeDestination();

    await dest.run(data, { ...config, insightType: "NONSENSE" }, context);

    expect(db.insight.create.mock.calls[0]?.[0]?.data).toMatchObject({
      type: "FEEDBACK",
    });
  });

  it("keeps a valid non-PROBLEM configured type", async () => {
    const { dest } = makeDestination();

    await dest.run(data, { ...config, insightType: "PAIN_POINT" }, context);

    expect(db.insight.create.mock.calls[0]?.[0]?.data).toMatchObject({
      type: "PAIN_POINT",
    });
  });

  it("always lands the insight in INBOX, never pre-triaged", async () => {
    const { dest } = makeDestination();

    // Even if a status somehow appears in config, the destination hardcodes INBOX.
    await dest.run(
      data,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ...config, status: "TRIAGED" } as any,
      context,
    );

    expect(db.insight.create.mock.calls[0]?.[0]?.data).toMatchObject({
      status: "INBOX",
    });
  });

  it("does not require a body — a title alone is enough", async () => {
    const { dest } = makeDestination();

    await dest.run(
      { headline: "Just a title" },
      { ...config, fieldMap: { title: "headline" } },
      context,
    );

    expect(db.insight.create.mock.calls[0]?.[0]?.data).toMatchObject({
      title: "Just a title",
      body: null,
    });
  });

  it("throws when productId is missing", async () => {
    const { dest } = makeDestination();
    await expect(
      dest.run(data, { ...config, productId: "" }, context),
    ).rejects.toThrow(/productId is required/);
    expect(db.insight.create).not.toHaveBeenCalled();
  });

  it("throws when no title is mapped", async () => {
    const { dest } = makeDestination();
    await expect(
      dest.run(data, { ...config, fieldMap: { body: "detail" } }, context),
    ).rejects.toThrow(/no mapped title/);
    expect(db.insight.create).not.toHaveBeenCalled();
  });

  it("throws (cross-workspace guard) when the product is not in the form's workspace", async () => {
    const { dest } = makeDestination();
    db.product.findFirst.mockResolvedValue(null);

    await expect(dest.run(data, config, context)).rejects.toThrow(
      /product not found in this form's workspace/,
    );
    // No insight write when the target is invalid.
    expect(db.insight.create).not.toHaveBeenCalled();
    // The guard is scoped to the form's own workspace.
    expect(db.product.findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      id: "prod-1",
      workspaceId: "ws-1",
    });
  });

  it("throws when the form has no owner to attribute the insight", async () => {
    const { dest } = makeDestination();
    await expect(
      dest.run(data, config, { ...context, ownerId: null }),
    ).rejects.toThrow(/no owner/);
    expect(db.insight.create).not.toHaveBeenCalled();
  });

  it("creates NO CRM entity — only an Insight", async () => {
    const { dest } = makeDestination();

    await dest.run(data, config, context);

    // The create_insight destination is CRM-free by design (ADR-0037).
    expect(db.crmContact.create).not.toHaveBeenCalled();
    expect(db.crmContact.upsert).not.toHaveBeenCalled();
    expect(db.deal.create).not.toHaveBeenCalled();
  });
});
