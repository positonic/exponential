import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { assertWorkspaceRole } from "~/server/services/access";
import { resolveBillingMode } from "~/server/services/billing/config";
import { decideAssistantAccess, getEntitlements, usedPercent } from "~/server/services/billing/entitlements";
import { usagePeriodEnd } from "~/server/services/billing/usage";

export const billingRouter = createTRPCRouter({
  /**
   * What the Billing tab shows for a workspace: owners and admins only.
   *
   * On an install that does not meter (`BILLING_MODE` unset or `off`) it
   * answers `{ mode: "off" }` without touching the database, and the settings
   * page shows no Billing tab.
   *
   * Usage is a share of the month's allowance with no unit: never a cost, a
   * token count or the allowance itself.
   */
  getStatus: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const mode = resolveBillingMode(process.env);
      if (mode === "off") return { mode } as const;

      await assertWorkspaceRole(ctx.db, ctx.session.user.id, input.workspaceId, ["owner", "admin"]);
      const now = new Date();
      const entitlements = await getEntitlements(ctx.db, input.workspaceId, { now });
      return {
        mode,
        /** Whole percent of the month's allowance used; above 100 once it is passed. */
        usedPercent: usedPercent(entitlements),
        /** The highest warning threshold reached (80 or 100), or null below 80%. */
        warnLevel: decideAssistantAccess(entitlements, "chat").warnLevel ?? null,
        /** When the month's count starts again. */
        resetsAt: usagePeriodEnd(now),
      } as const;
    }),
});
