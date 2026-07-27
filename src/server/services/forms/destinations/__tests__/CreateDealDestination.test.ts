/**
 * Unit tests for the `create_deal` Form destination (ADR-0033). Pins the
 * behaviour the public intake relies on: it upserts the applicant via the
 * shared `createCrmContact` (so contact-type automations fire), drops a Deal on
 * the configured (pipeline, stage), and is idempotent on repeat submission —
 * an existing OPEN deal for the same (pipeline, contact) is not duplicated.
 *
 * `createCrmContact` is mocked so no real contact/automation logic runs; we
 * only assert the deal-side wiring and the guards.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const createCrmContactMock = vi.fn();

vi.mock("~/server/services/crm/createCrmContact", () => ({
  createCrmContact: (...args: unknown[]) => createCrmContactMock(...args),
}));

import { CreateDealDestination } from "../CreateDealDestination";

const db = mockDeep<PrismaClient>();

const context = {
  formId: "form-1",
  workspaceId: "ws-1",
  submissionId: "sub-1",
  ownerId: "owner-1",
};

const config = {
  pipelineId: "pipe-1",
  stageId: "stage-1",
  customerType: "Applicant",
  contactFieldMap: {
    email: "email",
    firstName: "first",
    lastName: "last",
  },
};

const data = {
  email: "jane@example.com",
  first: "Jane",
  last: "Doe",
};

function makeDestination(): {
  dest: CreateDealDestination;
  db: DeepMockProxy<PrismaClient>;
} {
  return { dest: new CreateDealDestination(db), db };
}

beforeEach(() => {
  mockReset(db);
  createCrmContactMock.mockReset();
  createCrmContactMock.mockResolvedValue({
    contactId: "contact-1",
    created: true,
    fired: true,
  });
  // Stage belongs to the pipeline in this workspace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pipelineStage.findFirst.mockResolvedValue({ id: "stage-1" } as any);
});

describe("CreateDealDestination", () => {
  it("upserts the contact via the shared path and creates a deal", async () => {
    const { dest } = makeDestination();
    db.deal.findFirst.mockResolvedValue(null); // no existing open deal
    db.deal.findFirst.mockResolvedValueOnce(null); // open-deal check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.deal.create.mockResolvedValue({ id: "deal-1" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.dealActivity.create.mockResolvedValue({} as any);

    const result = await dest.run(data, config, context);

    expect(createCrmContactMock).toHaveBeenCalledTimes(1);
    expect(createCrmContactMock.mock.calls[0]?.[1]).toMatchObject({
      workspaceId: "ws-1",
      email: "jane@example.com",
      profileType: "Applicant",
    });
    expect(db.deal.create).toHaveBeenCalledTimes(1);
    const createArgs = db.deal.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({
      projectId: "pipe-1",
      stageId: "stage-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      createdById: "owner-1",
      title: "Jane Doe",
    });
    expect(result).toMatchObject({
      contactId: "contact-1",
      dealId: "deal-1",
      dealCreated: true,
    });
  });

  it("is idempotent — skips a second open deal for the same applicant", async () => {
    const { dest } = makeDestination();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.deal.findFirst.mockResolvedValue({ id: "existing-deal" } as any);

    const result = await dest.run(data, config, context);

    expect(db.deal.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dealId: "existing-deal",
      dealCreated: false,
    });
    // The open-deal lookup is scoped to active stages only.
    const where = db.deal.findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      projectId: "pipe-1",
      contactId: "contact-1",
      stage: { type: "active" },
    });
  });

  it("uses the dealTitleTemplate with {token} substitution when provided", async () => {
    const { dest } = makeDestination();
    db.deal.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.deal.create.mockResolvedValue({ id: "deal-2" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.dealActivity.create.mockResolvedValue({} as any);

    await dest.run(
      data,
      { ...config, dealTitleTemplate: "{first} — Frontend" },
      context,
    );

    expect(db.deal.create.mock.calls[0]?.[0]?.data).toMatchObject({
      title: "Jane — Frontend",
    });
  });

  it("throws when pipelineId or stageId is missing", async () => {
    const { dest } = makeDestination();
    await expect(
      dest.run(data, { ...config, stageId: "" }, context),
    ).rejects.toThrow(/pipelineId and stageId are required/);
    expect(createCrmContactMock).not.toHaveBeenCalled();
  });

  it("throws when no email is mapped to dedupe on", async () => {
    const { dest } = makeDestination();
    await expect(
      dest.run(
        { first: "Jane" },
        { ...config, contactFieldMap: { firstName: "first" } },
        context,
      ),
    ).rejects.toThrow(/no email to dedupe on/);
  });

  it("throws when the stage does not belong to the pipeline/workspace", async () => {
    const { dest } = makeDestination();
    db.pipelineStage.findFirst.mockResolvedValue(null);

    await expect(dest.run(data, config, context)).rejects.toThrow(
      /stage not found in the configured pipeline/,
    );
    // No contact upsert or deal write when the target is invalid.
    expect(createCrmContactMock).not.toHaveBeenCalled();
    expect(db.deal.create).not.toHaveBeenCalled();
  });

  it("throws when the form has no owner to attribute the deal", async () => {
    const { dest } = makeDestination();
    await expect(
      dest.run(data, config, { ...context, ownerId: null }),
    ).rejects.toThrow(/no owner to attribute/);
  });
});
