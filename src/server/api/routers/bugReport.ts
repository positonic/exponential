import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { uploadToBlob } from "~/lib/blob";
import { slugify } from "~/utils/slugify";

export const bugReportRouter = createTRPCRouter({
  submit: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        screenshot: z.string().optional(),
        consoleLogs: z
          .array(
            z.object({
              level: z.enum(["error", "warn"]),
              message: z.string(),
              timestamp: z.string(),
            }),
          )
          .optional(),
        metadata: z.object({
          pathname: z.string(),
          userAgent: z.string(),
          screenSize: z.string(),
          timestamp: z.string(),
        }),
        workspaceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const userName =
        ctx.session.user.name ?? ctx.session.user.email ?? userId;

      // Find or create a "Bugs" project in the workspace
      let bugsProject = await ctx.db.project.findFirst({
        where: {
          slug: { startsWith: "bugs" },
          ...(input.workspaceId
            ? { workspaceId: input.workspaceId }
            : { createdById: userId }),
        },
        select: { id: true, workspaceId: true },
      });

      if (!bugsProject) {
        const baseSlug = slugify("Bugs");
        let slug = baseSlug;
        let counter = 1;
        while (await ctx.db.project.findFirst({ where: { slug } })) {
          slug = `${baseSlug}_${String(counter)}`;
          counter++;
        }

        bugsProject = await ctx.db.project.create({
          data: {
            name: "Bugs",
            description: "Bug reports from the application",
            slug,
            status: "active",
            createdById: userId,
            workspaceId: input.workspaceId ?? null,
          },
          select: { id: true, workspaceId: true },
        });
      }

      // Build description with metadata and console logs
      const descriptionParts: string[] = [];
      if (input.description) {
        descriptionParts.push(input.description);
      }
      descriptionParts.push("");
      descriptionParts.push("---");
      descriptionParts.push(`**Reported by**: ${userName}`);
      descriptionParts.push(`**Page**: ${input.metadata.pathname}`);
      descriptionParts.push(`**Screen**: ${input.metadata.screenSize}`);
      descriptionParts.push(`**Browser**: ${input.metadata.userAgent}`);
      descriptionParts.push(`**Time**: ${input.metadata.timestamp}`);

      if (input.consoleLogs && input.consoleLogs.length > 0) {
        descriptionParts.push("");
        descriptionParts.push(
          `**Console logs** (${String(input.consoleLogs.length)} entries):`,
        );
        descriptionParts.push("```");
        for (const entry of input.consoleLogs.slice(-20)) {
          descriptionParts.push(
            `[${entry.level}] ${entry.message.slice(0, 500)}`,
          );
        }
        descriptionParts.push("```");
      }

      // Create the action
      const action = await ctx.db.action.create({
        data: {
          name: `[Bug] ${input.title}`.slice(0, 255),
          description: descriptionParts.join("\n"),
          projectId: bugsProject.id,
          workspaceId: input.workspaceId ?? null,
          createdById: userId,
          status: "ACTIVE",
          priority: "2nd Priority",
        },
        select: { id: true },
      });

      // Save screenshot if provided
      if (input.screenshot) {
        try {
          const base64Data = input.screenshot.replace(
            /^data:image\/\w+;base64,/,
            "",
          );
          const filename = `screenshots/bugs/${action.id}/${input.metadata.timestamp.replace(/[/:]/g, "-")}.png`;
          const blob = await uploadToBlob(base64Data, filename);

          const screenshot = await ctx.db.screenshot.create({
            data: {
              url: blob.url,
              timestamp: input.metadata.timestamp,
            },
          });

          await ctx.db.actionScreenshot.create({
            data: {
              actionId: action.id,
              screenshotId: screenshot.id,
            },
          });
        } catch (error) {
          console.error("Error saving bug report screenshot:", error);
          // Don't fail the whole submission if screenshot upload fails
        }
      }

      // Build the action URL
      let actionUrl = `/actions/${action.id}`;
      if (input.workspaceId) {
        const workspace = await ctx.db.workspace.findUnique({
          where: { id: input.workspaceId },
          select: { slug: true },
        });
        if (workspace) {
          actionUrl = `/w/${workspace.slug}/actions/${action.id}`;
        }
      }

      console.log(
        `[BUG REPORT] User ${userName} submitted: ${input.title}`,
      );

      return {
        success: true as const,
        actionId: action.id,
        actionUrl,
      };
    }),
});
