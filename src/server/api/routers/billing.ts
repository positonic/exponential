import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, humanOnlyProcedure, protectedProcedure } from "~/server/api/trpc";
import { assertWorkspaceRole } from "~/server/services/access";
import { resolveBillingMode } from "~/server/services/billing/config";
import { decideAssistantAccess, getEntitlements, usedPercent } from "~/server/services/billing/entitlements";
import {
  getModelKeyStatus,
  removeModelKey,
  saveModelKey,
  validateAnthropicKey,
} from "~/server/services/billing/modelKey";
import { usagePeriodEnd } from "~/server/services/billing/usage";

/** Workspace keys exist only on an install that meters Assistant use. */
function assertBillingOn(): void {
  if (resolveBillingMode(process.env) === "off") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This install does not meter Assistant use, so workspaces have no key of their own to set.",
    });
  }
}

export const billingRouter = createTRPCRouter({
  /**
   * What the Billing tab shows for a workspace: owners and admins only.
   *
   * On an install that does not meter (`BILLING_MODE` unset or `off`) it
   * answers `{ mode: "off" }` without touching the database, and the settings
   * page shows no Billing tab.
   *
   * Usage is a share of the month's allowance with no unit: never a cost, a
   * token count or the allowance itself. The workspace's own Anthropic key is
   * reported by its last four characters and whether it works, never whole.
   */
  getStatus: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const mode = resolveBillingMode(process.env);
      if (mode === "off") return { mode } as const;

      await assertWorkspaceRole(ctx.db, ctx.session.user.id, input.workspaceId, ["owner", "admin"]);
      const now = new Date();
      const modelKey = await getModelKeyStatus(ctx.db, input.workspaceId);
      const entitlements = await getEntitlements(ctx.db, input.workspaceId, { now, modelKey });
      return {
        mode,
        /** Whole percent of the month's allowance used; above 100 once it is passed. */
        usedPercent: usedPercent(entitlements),
        /** The highest warning threshold reached (80 or 100), or null below 80%. */
        warnLevel: decideAssistantAccess(entitlements, "chat").warnLevel ?? null,
        /** When the month's count starts again. */
        resetsAt: usagePeriodEnd(now),
        /** The workspace's own Anthropic key, or null when it has none. */
        modelKey: modelKey ? { last4: modelKey.last4, status: modelKey.status } : null,
      } as const;
    }),

  /**
   * Save the workspace's own Anthropic API key: owners and admins, signed in
   * as themselves (never an agent). The key is checked with Anthropic first
   * and refused with what failed; a good key is stored encrypted and never
   * returned, apart from its last four characters.
   */
  saveModelKey: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        apiKey: z.string().trim().min(20, "That does not look like an API key").max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertBillingOn();
      await assertWorkspaceRole(ctx.db, ctx.session.user.id, input.workspaceId, ["owner", "admin"]);

      const validation = await validateAnthropicKey(input.apiKey);
      if (!validation.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: validation.message });
      }

      const saved = await saveModelKey(ctx.db, { workspaceId: input.workspaceId, apiKey: input.apiKey });
      return { last4: saved.last4, status: saved.status };
    }),

  /**
   * Remove the workspace's own Anthropic key: owners and admins, signed in as
   * themselves. The Assistant goes back to the hosted key and the monthly
   * allowance. Removing a key that is not there is not an error.
   */
  removeModelKey: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertBillingOn();
      await assertWorkspaceRole(ctx.db, ctx.session.user.id, input.workspaceId, ["owner", "admin"]);
      return { removed: await removeModelKey(ctx.db, input.workspaceId) };
    }),
});
