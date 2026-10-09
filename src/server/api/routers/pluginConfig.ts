import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pluginRegistry } from "~/plugins/registry";
import { initializePlugins } from "~/plugins/loader";
import { resolvePluginStates } from "~/server/services/plugins/resolvePluginStates";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";

export const pluginConfigRouter = createTRPCRouter({
  // Get all available plugins with their enabled status
  getAvailable: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      initializePlugins();

      const allPlugins = pluginRegistry.getAllPlugins();

      // User's own configs, with workspace owner/admin choices as the fallback
      const { ownConfigs, enabledById } = await resolvePluginStates(
        ctx.db,
        ctx.session.user.id,
        input?.workspaceId ?? null,
      );

      const configMap = new Map(ownConfigs.map((c) => [c.pluginId, c]));

      return allPlugins.map((plugin) => {
        const config = configMap.get(plugin.manifest.id);
        return {
          id: plugin.manifest.id,
          name: plugin.manifest.name,
          description: plugin.manifest.description,
          version: plugin.manifest.version,
          capabilities: plugin.manifest.capabilities,
          enabled: enabledById.get(plugin.manifest.id) ?? plugin.manifest.defaultEnabled,
          settings: (config?.settings as Record<string, unknown>) ?? {},
        };
      });
    }),

  // Get enabled plugins for current workspace
  getEnabled: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      initializePlugins();

      // User's own configs, with workspace owner/admin choices as the fallback
      const { enabledById } = await resolvePluginStates(
        ctx.db,
        ctx.session.user.id,
        input?.workspaceId ?? null,
      );

      const enabledIds = new Set<string>();
      const disabledIds = new Set<string>();

      // Track explicitly enabled/disabled plugins
      for (const [pluginId, enabled] of enabledById) {
        if (enabled) {
          enabledIds.add(pluginId);
        } else {
          disabledIds.add(pluginId);
        }
      }

      // Include plugins that are enabled by default and not explicitly disabled
      const allPlugins = pluginRegistry.getAllPlugins();
      for (const plugin of allPlugins) {
        if (plugin.manifest.defaultEnabled && !disabledIds.has(plugin.manifest.id)) {
          enabledIds.add(plugin.manifest.id);
        }
      }

      return Array.from(enabledIds);
    }),

  // Toggle plugin enabled state. Only `enabled` is written: the row's
  // settings (e.g. the product plugin's saved view prefs) are left as stored.
  toggle: protectedProcedure
    .input(
      z.object({
        pluginId: z.string(),
        enabled: z.boolean(),
        // Required: the unique key is (pluginId, workspaceId, userId), and
        // NULLs never conflict in it, so a workspace-less row could not be
        // created without racing into duplicates.
        workspaceId: z.string(),
      })
    )
    .use(requireWorkspaceMembership("view"))
    .mutation(async ({ ctx, input }) => {
      const key = {
        pluginId: input.pluginId,
        workspaceId: input.workspaceId,
        userId: ctx.session.user.id,
      };

      // Create the row if there is none yet (a no-op when there is). Unlike a
      // find-then-create, two first toggles racing here both succeed.
      await ctx.db.pluginConfig.createMany({
        data: [{ ...key, enabled: input.enabled }],
        skipDuplicates: true,
      });

      return ctx.db.pluginConfig.update({
        where: { pluginId_workspaceId_userId: key },
        data: { enabled: input.enabled },
      });
    }),
});
