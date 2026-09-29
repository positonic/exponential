import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pluginRegistry } from "~/plugins/registry";
import { initializePlugins } from "~/plugins/loader";
import { resolvePluginStates } from "~/server/services/plugins/resolvePluginStates";

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

  // Toggle plugin enabled state
  toggle: protectedProcedure
    .input(
      z.object({
        pluginId: z.string(),
        enabled: z.boolean(),
        workspaceId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find existing config
      const existing = await ctx.db.pluginConfig.findFirst({
        where: {
          pluginId: input.pluginId,
          workspaceId: input.workspaceId ?? null,
          userId: ctx.session.user.id,
        },
      });

      if (existing) {
        return ctx.db.pluginConfig.update({
          where: { id: existing.id },
          data: { enabled: input.enabled },
        });
      }

      return ctx.db.pluginConfig.create({
        data: {
          pluginId: input.pluginId,
          enabled: input.enabled,
          userId: ctx.session.user.id,
          workspaceId: input.workspaceId,
        },
      });
    }),

  // Update plugin settings
  updateSettings: protectedProcedure
    .input(
      z.object({
        pluginId: z.string(),
        settings: z.record(z.unknown()),
        workspaceId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = input.settings as Prisma.InputJsonValue;

      // Find existing config
      const existing = await ctx.db.pluginConfig.findFirst({
        where: {
          pluginId: input.pluginId,
          workspaceId: input.workspaceId ?? null,
          userId: ctx.session.user.id,
        },
      });

      if (existing) {
        return ctx.db.pluginConfig.update({
          where: { id: existing.id },
          data: { settings },
        });
      }

      return ctx.db.pluginConfig.create({
        data: {
          pluginId: input.pluginId,
          settings,
          userId: ctx.session.user.id,
          workspaceId: input.workspaceId,
          enabled: true,
        },
      });
    }),
});
