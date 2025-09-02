import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Define the workflow template structure (hardcoded templates)
const WORKFLOW_TEMPLATES = {
  "Fireflies Meeting Transcription": {
    id: "fireflies-meeting-transcription",
    name: "Fireflies Meeting Transcription",
    description:
      "Automatically capture meeting transcripts and extract action items from Fireflies recordings.",
    category: "Automation",
    type: "fireflies_sync",
    integrations: ["fireflies"],
    defaultConfiguration: {
      // notificationChannels: ["slack"],
      // actionPriority: "Medium",
      // assignToMeetingParticipants: true,
    },
    configurationSchema: {
      // notificationChannels: {
      //   type: "multi-select",
      //   options: ["slack", "email", "whatsapp"],
      //   required: true,
      // },
      // actionPriority: {
      //   type: "select",
      //   options: ["Critical", "High", "Medium", "Low", "Quick"],
      //   required: false,
      // },
      // assignToMeetingParticipants: {
      //   type: "boolean",
      //   required: false,
      // },
    },
  },
  "Notion Tasks Database": {
    id: "notion-tasks-database",
    name: "Notion Tasks Database",
    description:
      "Sync your tasks with Notion databases. Keep everything in sync across platforms.",
    category: "Integration",
    type: "notion_sync",
    integrations: ["notion"],
    defaultConfiguration: {
      // syncDirection: "bidirectional",
      // conflictResolution: "local_wins",
      // notifyOnSync: true,
    },
    configurationSchema: {
      // syncDirection: {
      //   type: "select",
      //   options: ["push", "pull", "bidirectional"],
      //   required: true,
      // },
      // conflictResolution: {
      //   type: "select",
      //   options: ["local_wins", "remote_wins", "manual_review"],
      //   required: true,
      // },
      // notifyOnSync: {
      //   type: "boolean",
      //   required: false,
      // },
    },
  },
  "Monday.com Boards": {
    id: "monday-boards",
    name: "Monday.com Boards",
    description:
      "Push your action items to Monday.com boards for team collaboration.",
    category: "Communication",
    integrations: ["monday"],
    type: "monday_sync",
    defaultConfiguration: {
      // frequency: "weekly",
      // channels: ["slack"],
      // includeMetrics: true,
      // stakeholderGroups: [],
    },
    configurationSchema: {
      // frequency: {
      //   type: "select",
      //   options: ["daily", "weekly", "monthly"],
      //   required: true,
      // },
      // channels: {
      //   type: "multi-select",
      //   options: ["slack", "whatsapp", "email"],
      //   required: true,
      // },
      // includeMetrics: {
      //   type: "boolean",
      //   required: false,
      // },
    },
  },
  "github-pipeline": {
    id: "github-pipeline",
    name: "GitHub Issue Pipeline",
    description:
      "Automatically sync GitHub issues with project action items using OAuth and webhooks",
    category: "Development",
    type: "github_issues",
    integrations: ["github"],
    defaultConfiguration: {
      syncDirection: "pull",
      autoSync: true,
      labelMapping: {},
      priorityMapping: {
        bug: "High",
        enhancement: "Medium",
        documentation: "Low",
      },
      includeClosedIssues: false,
      createActionsFromIssues: true,
      syncAssignees: true,
    },
    configurationSchema: {
      syncDirection: {
        type: "select",
        label: "Sync Direction",
        options: ["pull", "push", "bidirectional"],
        required: true,
      },
      autoSync: {
        type: "boolean",
        label: "Enable Real-time Sync",
        required: false,
      },
      includeClosedIssues: {
        type: "boolean",
        label: "Include Closed Issues",
        required: false,
      },
      createActionsFromIssues: {
        type: "boolean",
        label: "Create Actions from Issues",
        required: false,
      },
      syncAssignees: {
        type: "boolean",
        label: "Sync Issue Assignees",
        required: false,
      },
      repositoryFilter: {
        type: "multi-select",
        label:
          "Select repositories to sync from, if the repository is not present select 'Add New' option",
        // placeholder: "Leave empty to sync all authorized repositories",
        required: false,
      },
      labelFilter: {
        type: "multi-text",
        label: "Label Filter",
        placeholder: "Only sync issues with these labels",
        required: false,
      },
    },
  },
  // "standup-reporter": {
  //   id: "standup-reporter",
  //   name: "Daily Standup Reporter",
  //   description: "Generates and distributes daily progress summaries based on completed actions",
  //   category: "Communication",
  //   integrations: ["slack", "whatsapp"],
  //   defaultConfiguration: {
  //     schedule: "09:00",
  //     timezone: "UTC",
  //     includeBlockers: true,
  //     channels: ["slack"],
  //   },
  //   configurationSchema: {
  //     schedule: {
  //       type: "time",
  //       required: true,
  //     },
  //     timezone: {
  //       type: "select",
  //       options: ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London"],
  //       required: true,
  //     },
  //     includeBlockers: {
  //       type: "boolean",
  //       required: false,
  //     },
  //     channels: {
  //       type: "multi-select",
  //       options: ["slack", "whatsapp", "email"],
  //       required: true,
  //     },
  //   },
  // },
} as const;

export const projectWorkflowRouter = createTRPCRouter({
  // Get all available workflow templates
  getTemplates: protectedProcedure.query(async ({ ctx }) => {
    // Return hardcoded templates - no need to fetch from database
    return Object.values(WORKFLOW_TEMPLATES);
  }),

  // Get a specific workflow template
  getTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const template =
        WORKFLOW_TEMPLATES[input.templateId as keyof typeof WORKFLOW_TEMPLATES];

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow template not found",
        });
      }

      return template;
    }),

  // Get project workflows (user-configured instances)
  getProjectWorkflows: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify project access
      const project = await ctx.db.project.findUnique({
        where: {
          id: input.projectId,
          createdById: ctx.session.user.id,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found or access denied",
        });
      }

      const workflows = await ctx.db.workflow.findMany({
        where: {
          projectId: input.projectId,
          userId: ctx.session.user.id,
        },
        include: {
          runs: {
            take: 5,
            orderBy: {
              startedAt: "desc",
            },
            select: {
              id: true,
              status: true,
              startedAt: true,
              completedAt: true,
              itemsProcessed: true,
              itemsCreated: true,
              itemsUpdated: true,
              itemsSkipped: true,
              errorMessage: true,
              metadata: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      // Enrich with template information for template-based workflows
      const enrichedWorkflows = workflows.map((workflow) => {
        const templateId = (workflow.config as any)?.templateId as string;
        const template = templateId
          ? WORKFLOW_TEMPLATES[templateId as keyof typeof WORKFLOW_TEMPLATES]
          : null;

        return {
          ...workflow,
          template,
          // Add compatibility fields for UI
          isActive: workflow.status === "ACTIVE",
          configuration: workflow.config,
          runs: workflow.runs.map((run) => ({
            ...run,
            duration: (run.metadata as any)?.duration as number | undefined,
          })),
        };
      });

      return enrichedWorkflows;
    }),

  // Create a new project workflow from template
  createFromTemplate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        templateId: z.string(),
        name: z.string().optional(),
        configuration: z.record(z.any()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify project access
      const project = await ctx.db.project.findUnique({
        where: {
          id: input.projectId,
          createdById: ctx.session.user.id,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found or access denied",
        });
      }

      // Verify template exists
      const template =
        WORKFLOW_TEMPLATES[input.templateId as keyof typeof WORKFLOW_TEMPLATES];
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow template not found",
        });
      }

      // Find integration ID from database if template specifies integrations
      let integrationId = ""; // Default empty string for template workflows

      if (template.integrations && template.integrations.length > 0) {
        // Get the first integration provider from template
        const primaryProvider = template.integrations[0];

        // Find existing integration for this user and provider
        const integration = await ctx.db.integration.findFirst({
          where: {
            userId: ctx.session.user.id,
            provider: primaryProvider,
            status: "ACTIVE",
          },
        });

        if (integration) {
          integrationId = integration.id;
        }
        // Note: We don't throw an error if no integration is found
        // This allows creating template workflows even without active integrations
        // The user can connect integrations later
      }

      // Create the workflow using existing Workflow table
      const workflow = await ctx.db.workflow.create({
        data: {
          name: input.name || template.name,
          type: template.type.toLowerCase(),
          provider: template.integrations[0] || "template",
          status: "ACTIVE",
          syncDirection: "bidirectional", // Default for template-based workflows
          syncFrequency: "manual", // Default for template-based workflows
          config: {
            // Store template information in config
            templateId: input.templateId,
            templateName: template.name,
            templateDescription: template.description,
            templateCategory: template.category,
            templateIntegrations: template.integrations,
            // Store user configuration
            ...input.configuration,
          },
          projectId: input.projectId,
          userId: ctx.session.user.id,
          integrationId: integrationId, // Use the found integration ID or empty string
        },
      });

      return {
        ...workflow,
        template,
        // Add compatibility fields for UI
        isActive: true,
        configuration: input.configuration,
      };
    }),

  // Update project workflow configuration
  updateConfiguration: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        configuration: z.record(z.any()),
        name: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, configuration, name, isActive } = input;

      // Verify workflow exists and belongs to user
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id,
          userId: ctx.session.user.id,
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found or access denied",
        });
      }

      // Update the workflow
      const updatedWorkflow = await ctx.db.workflow.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(isActive !== undefined && {
            status: isActive ? "ACTIVE" : "INACTIVE",
          }),
          ...(configuration && {
            config: {
              ...((workflow.config as object) || {}),
              ...configuration,
            },
          }),
        },
      });

      const templateId = (workflow.config as any)?.templateId as string;
      const template = templateId
        ? WORKFLOW_TEMPLATES[templateId as keyof typeof WORKFLOW_TEMPLATES]
        : null;

      return {
        ...updatedWorkflow,
        template,
        isActive: updatedWorkflow.status === "ACTIVE",
        configuration: updatedWorkflow.config,
      };
    }),

  // Delete project workflow
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found or access denied",
        });
      }

      await ctx.db.workflow.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Execute workflow manually (for testing)
  execute: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        triggerType: z.enum(["manual", "test"]).default("manual"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found or access denied",
        });
      }

      if (workflow.status !== "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workflow is not active",
        });
      }

      const templateId = (workflow.config as any)?.templateId as string;
      const template = templateId
        ? WORKFLOW_TEMPLATES[templateId as keyof typeof WORKFLOW_TEMPLATES]
        : null;

      // Create workflow run record using existing WorkflowRun table
      const run = await ctx.db.workflowRun.create({
        data: {
          workflowId: workflow.id,
          status: "running",
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          itemsSkipped: 0,
          metadata: {
            triggerType: input.triggerType,
            triggeredBy: ctx.session.user.id,
            templateId: templateId,
          },
        },
      });

      try {
        // TODO: Implement actual workflow execution logic based on template
        // For now, simulate successful execution

        const startTime = Date.now();

        // Simulate execution delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Update run with success
        await ctx.db.workflowRun.update({
          where: { id: run.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            itemsProcessed: 1,
            itemsCreated: 1,
            itemsUpdated: 0,
            itemsSkipped: 0,
            metadata: {
              ...(run.metadata as object),
              duration,
              result: "success",
              message: `Workflow '${workflow.name}' executed successfully`,
              actions: [
                {
                  action: "test_execution",
                  result: "success",
                  message: `Workflow '${workflow.name}' executed successfully`,
                },
              ],
            },
          },
        });

        // Update workflow last run time
        await ctx.db.workflow.update({
          where: { id: workflow.id },
          data: { lastRunAt: new Date() },
        });

        return {
          success: true,
          runId: run.id,
          message: `Workflow '${workflow.name}' executed successfully`,
          duration,
        };
      } catch (error) {
        // Update run with failure
        await ctx.db.workflowRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            itemsProcessed: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            itemsSkipped: 0,
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
            metadata: {
              ...(run.metadata as object),
              duration: Date.now() - run.startedAt.getTime(),
              error: error instanceof Error ? error.stack : "Unknown error",
            },
          },
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Workflow execution failed",
        });
      }
    }),

  // Get workflow execution history
  getExecutionHistory: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
        limit: z.number().default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id: input.workflowId,
          userId: ctx.session.user.id,
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found or access denied",
        });
      }

      const runs = await ctx.db.workflowRun.findMany({
        where: {
          workflowId: input.workflowId,
        },
        orderBy: {
          startedAt: "desc",
        },
        take: input.limit,
      });

      // Add compatibility fields for UI
      return runs.map((run) => ({
        ...run,
        duration: (run.metadata as any)?.duration as number | undefined,
        triggerType: ((run.metadata as any)?.triggerType as string) || "manual",
        triggeredBy: ((run.metadata as any)?.triggeredBy as string) || null,
      }));
    }),
});
