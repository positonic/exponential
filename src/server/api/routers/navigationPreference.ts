import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

// Valid section and item keys
const VALID_SECTIONS = ["projects", "alignment", "teams", "tools"] as const;
const VALID_ITEMS = [
  // Projects section
  "projects/my-projects",
  "projects/project-list",
  "projects/add-project",
  // Alignment section
  "alignment/goals",
  "alignment/wheel-of-life",
  // Teams section
  "teams/my-teams",
  "teams/weekly-review",
  // Tools section
  "tools/days",
  "tools/media",
  "tools/journal",
  "tools/meetings",
  "tools/workflows",
  "tools/ai-sales-demo",
  "tools/ai-automation",
  "tools/connect-services",
  "tools/ai-history",
  "tools/api-access",
] as const;

export const navigationPreferenceRouter = createTRPCRouter({
  // Get user navigation preferences
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const preferences = await ctx.db.navigationPreference.findUnique({
      where: { userId: ctx.session.user.id },
    });

    // Return defaults if not exists (all visible)
    if (!preferences) {
      return {
        hiddenSections: [] as string[],
        hiddenItems: [] as string[],
        showInspiringQuote: true,
        showSuggestedFocus: true,
      };
    }

    return {
      hiddenSections: preferences.hiddenSections,
      hiddenItems: preferences.hiddenItems,
      showInspiringQuote: preferences.showInspiringQuote,
      showSuggestedFocus: preferences.showSuggestedFocus,
    };
  }),

  // Update preferences (batch update)
  updatePreferences: protectedProcedure
    .input(
      z.object({
        hiddenSections: z.array(z.string()).optional(),
        hiddenItems: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const preferences = await ctx.db.navigationPreference.upsert({
        where: { userId: ctx.session.user.id },
        update: {
          ...(input.hiddenSections !== undefined && {
            hiddenSections: input.hiddenSections,
          }),
          ...(input.hiddenItems !== undefined && {
            hiddenItems: input.hiddenItems,
          }),
        },
        create: {
          userId: ctx.session.user.id,
          hiddenSections: input.hiddenSections ?? [],
          hiddenItems: input.hiddenItems ?? [],
        },
      });

      return preferences;
    }),

  // Toggle a single section visibility
  toggleSection: protectedProcedure
    .input(
      z.object({
        section: z.enum(VALID_SECTIONS),
        visible: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.navigationPreference.findUnique({
        where: { userId: ctx.session.user.id },
      });

      const currentHidden = current?.hiddenSections ?? [];
      let newHidden: string[];

      if (input.visible) {
        // Remove from hidden list
        newHidden = currentHidden.filter((s: string) => s !== input.section);
      } else {
        // Add to hidden list (if not already there)
        newHidden = currentHidden.includes(input.section)
          ? currentHidden
          : [...currentHidden, input.section];
      }

      return ctx.db.navigationPreference.upsert({
        where: { userId: ctx.session.user.id },
        update: { hiddenSections: newHidden },
        create: {
          userId: ctx.session.user.id,
          hiddenSections: newHidden,
          hiddenItems: [],
        },
      });
    }),

  // Toggle a single item visibility
  toggleItem: protectedProcedure
    .input(
      z.object({
        item: z.enum(VALID_ITEMS),
        visible: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.navigationPreference.findUnique({
        where: { userId: ctx.session.user.id },
      });

      const currentHidden = current?.hiddenItems ?? [];
      let newHidden: string[];

      if (input.visible) {
        newHidden = currentHidden.filter((i: string) => i !== input.item);
      } else {
        newHidden = currentHidden.includes(input.item)
          ? currentHidden
          : [...currentHidden, input.item];
      }

      return ctx.db.navigationPreference.upsert({
        where: { userId: ctx.session.user.id },
        update: { hiddenItems: newHidden },
        create: {
          userId: ctx.session.user.id,
          hiddenSections: [],
          hiddenItems: newHidden,
        },
      });
    }),

  // Reset to defaults (show everything)
  resetToDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.db.navigationPreference.upsert({
      where: { userId: ctx.session.user.id },
      update: { hiddenSections: [], hiddenItems: [] },
      create: {
        userId: ctx.session.user.id,
        hiddenSections: [],
        hiddenItems: [],
      },
    });
  }),

  // Toggle inspiring quote visibility
  toggleInspiringQuote: protectedProcedure
    .input(z.object({ visible: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.navigationPreference.upsert({
        where: { userId: ctx.session.user.id },
        update: { showInspiringQuote: input.visible },
        create: {
          userId: ctx.session.user.id,
          hiddenSections: [],
          hiddenItems: [],
          showInspiringQuote: input.visible,
        },
      });
    }),

  // Toggle suggested focus visibility
  toggleSuggestedFocus: protectedProcedure
    .input(z.object({ visible: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.navigationPreference.upsert({
        where: { userId: ctx.session.user.id },
        update: { showSuggestedFocus: input.visible },
        create: {
          userId: ctx.session.user.id,
          hiddenSections: [],
          hiddenItems: [],
          showSuggestedFocus: input.visible,
        },
      });
    }),
});
