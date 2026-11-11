import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { resolveAiCapabilities } from "~/server/services/ai/capabilities";

export const aiRouter = createTRPCRouter({
  /**
   * Which AI this install has, for the UI to hide or explain AI surfaces
   * (`useAiCapabilities`). Reads the same resolver as every server-side gate
   * (`requireAi`) and the self-host preflight, so a surface shows exactly when
   * its procedure would run.
   *
   * Public, like `auth.getConfiguredProviders`: booleans only, never a key or
   * URL. Keep the shape additive.
   */
  getCapabilities: publicProcedure.query(() => resolveAiCapabilities(process.env)),
});
