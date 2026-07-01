import { type InsightType, type PrismaClient } from "@prisma/client";

import {
  type IFormDestination,
  type FormDestinationContext,
} from "./IFormDestination";

interface InsightFieldMap {
  title?: string;
  body?: string;
}

/**
 * `create_insight` — the product research-intake destination (ADR-0037). On a
 * public form submit it drops ONE product `Insight` in `INBOX` onto a chosen
 * Product's insights surface. The form stays product-ignorant: no CRM entity is
 * created and no automation fires.
 *
 * Config: `{ productId, insightType?, fieldMap: { title, body? }, status? }`
 * where field-map values are form field keys. `title` is required; `body` is
 * optional; `insightType` defaults to `FEEDBACK`; `status` defaults to `INBOX`.
 * The insight is stamped `source = "form:<slug>"` for provenance.
 *
 * Guards (ADR-0037):
 * - `type` is NEVER `PROBLEM` and NEVER pre-triaged — a form lands raw evidence
 *   in `INBOX`; "Problem" is a state reached only by human triage. A configured
 *   `PROBLEM` type is coerced to `FEEDBACK`, and any non-`INBOX` status is
 *   coerced to `INBOX`.
 * - The target `productId` must belong to the form's own workspace; if it does
 *   not, the destination throws (recorded as a failed per-destination result by
 *   `runFormDestinations`) — the `FormSubmission` is still stored by the caller.
 *
 * No dedup: an Insight has no natural unique key and a feedback form may carry
 * no email, so every submission creates exactly one Insight.
 */
export class CreateInsightDestination implements IFormDestination {
  type = "create_insight";
  label = "Create product insight (INBOX)";

  constructor(private db: PrismaClient) {}

  async run(
    data: Record<string, unknown>,
    config: Record<string, unknown>,
    context: FormDestinationContext,
  ): Promise<Record<string, unknown>> {
    const productId =
      typeof config.productId === "string" ? config.productId : null;
    if (!productId) {
      throw new Error("create_insight: productId is required");
    }

    // An Insight's createdById is required — the form owner authors the record.
    if (!context.ownerId) {
      throw new Error(
        "create_insight: form has no owner to attribute the insight to",
      );
    }

    const fieldMap =
      config.fieldMap && typeof config.fieldMap === "object"
        ? (config.fieldMap as InsightFieldMap)
        : {};

    const pick = (key?: string): string | null => {
      if (!key) return null;
      const value = data[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };

    // Title is the only required mapping — no email is required for an insight.
    const title = pick(fieldMap.title);
    if (!title) {
      throw new Error("create_insight: submission has no mapped title");
    }
    const body = pick(fieldMap.body);

    // Guard the target before any write: the product must live in the form's
    // own workspace. Stops a misconfigured form landing an insight on another
    // workspace's product.
    const product = await this.db.product.findFirst({
      where: { id: productId, workspaceId: context.workspaceId },
      select: { id: true },
    });
    if (!product) {
      throw new Error(
        "create_insight: product not found in this form's workspace",
      );
    }

    // Never PROBLEM, never pre-triaged: a form lands raw evidence in INBOX.
    // Human triage promotes it later. A configured PROBLEM (or an unknown type)
    // is coerced to the FEEDBACK default; the status is always INBOX.
    const type = this.resolveType(config.insightType);
    // Provenance stamp. Fall back to the formId if the slug is somehow empty,
    // so `source` is never a bare "form:" (which would still match the origin
    // filter but lose identity, and could collide with hand-typed sources).
    const slug =
      context.formSlug.length > 0 ? context.formSlug : context.formId;
    const source = `form:${slug}`;

    const insight = await this.db.insight.create({
      data: {
        productId,
        type,
        title,
        body,
        source,
        status: "INBOX",
        // Keep `description` in sync with `title` (same convention as
        // `insight.create`, where description mirrors the title).
        description: title,
        createdById: context.ownerId,
      },
      select: { id: true },
    });

    return {
      insightId: insight.id,
      type,
      status: "INBOX",
      source,
    };
  }

  /**
   * Resolve the configured insight type to a safe, non-PROBLEM value. Anything
   * that is not a recognised non-PROBLEM type (including `PROBLEM` itself and a
   * missing value) falls back to `FEEDBACK`.
   */
  private resolveType(raw: unknown): InsightType {
    const ALLOWED: InsightType[] = [
      "PAIN_POINT",
      "OPPORTUNITY",
      "FEEDBACK",
      "PERSONA",
      "JOURNEY",
      "OBSERVATION",
      "COMPETITIVE",
    ];
    if (typeof raw === "string" && ALLOWED.includes(raw as InsightType)) {
      return raw as InsightType;
    }
    return "FEEDBACK";
  }
}
