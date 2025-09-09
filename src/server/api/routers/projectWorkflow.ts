import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { notionSyncService } from "~/server/services/notion-sync";
import { mondaySyncService } from "~/server/services/monday-sync";
import { MondayService } from "~/server/services/MondayService";

// Define the workflow template structure (hardcoded templates)
const WORKFLOW_TEMPLATES = {
  "fireflies-meeting-transcription": {
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
      apiKey: {
        type: "text",
        required: true,
      },
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
  // "notion-todos": {
  //   id: "notion-todos",
  //   name: "Notion Tasks Sync",
  //   description:
  //     "Sync Notion database pages as project todos with status and priority mapping",
  //   category: "Productivity",
  //   type: "notion_todos",
  //   integrations: ["notion"],
  //   defaultConfiguration: {
  //     syncDirection: "pull",
  //     autoSync: false,
  //     statusFieldMapping: {
  //       "Not started": "ACTIVE",
  //       "In progress": "IN_PROGRESS",
  //       Done: "COMPLETED",
  //       Blocked: "BLOCKED",
  //     },
  //     priorityFieldMapping: {
  //       High: "Immediate",
  //       Medium: "Soon",
  //       Low: "Later",
  //     },
  //     filterCompleted: true,
  //     assigneeSync: false,
  //     syncFrequency: "manual",
  //   },
  //   configurationSchema: {
  //     databaseIds: {
  //       type: "multi-select",
  //       label: "Notion Databases",
  //       required: true,
  //     },
  //     syncDirection: {
  //       type: "select",
  //       label: "Sync Direction",
  //       options: ["pull", "push", "bidirectional"],
  //       required: true,
  //     },
  //     filterCompleted: {
  //       type: "boolean",
  //       label: "Exclude Completed Items",
  //       required: false,
  //     },
  //     assigneeSync: {
  //       type: "boolean",
  //       label: "Sync Assignees",
  //       required: false,
  //     },
  //     autoSync: {
  //       type: "boolean",
  //       label: "Enable Automatic Sync",
  //       required: false,
  //     },
  //   },
  // },
  // "monday-items": {
  //   id: "monday-items",
  //   name: "Monday.com Items Sync",
  //   description:
  //     "Sync Monday board items as project todos with column mapping and status synchronization",
  //   category: "Project Management",
  //   type: "monday_items",
  //   integrations: ["monday"],
  //   defaultConfiguration: {
  //     syncDirection: "pull",
  //     autoSync: false,
  //     columnMappings: {
  //       statusColumn: "",
  //       priorityColumn: "",
  //       assigneeColumn: "",
  //       dueDateColumn: "",
  //     },
  //     statusMapping: {
  //       "Working on it": "IN_PROGRESS",
  //       Done: "COMPLETED",
  //       Stuck: "BLOCKED",
  //     },
  //     filterGroups: [],
  //     syncFrequency: "manual",
  //   },
  //   configurationSchema: {
  //     boardIds: {
  //       type: "multi-select",
  //       label: "Monday Boards",
  //       required: true,
  //     },
  //     statusColumn: {
  //       type: "select",
  //       label: "Status Column",
  //       required: true,
  //     },
  //     priorityColumn: {
  //       type: "select",
  //       label: "Priority Column",
  //       required: false,
  //     },
  //     assigneeColumn: {
  //       type: "select",
  //       label: "Assignee Column",
  //       required: false,
  //     },
  //     dueDateColumn: {
  //       type: "select",
  //       label: "Due Date Column",
  //       required: false,
  //     },
  //     syncDirection: {
  //       type: "select",
  //       label: "Sync Direction",
  //       options: ["pull", "push", "bidirectional"],
  //       required: true,
  //     },
  //     autoSync: {
  //       type: "boolean",
  //       label: "Enable Automatic Sync",
  //       required: false,
  //     },
  //   },
  // },
} as const;

// Helper function to get integration setup instructions
function getIntegrationInstructions(provider: string) {
  switch (provider) {
    case "fireflies":
      return {
        oauth: false,
        authUrl: null,
        instructions:
          "To get your Fireflies API key:\n1. Log in to your Fireflies account\n2. Go to Settings > API Keys\n3. Generate a new API key\n4. Copy the key and paste it below",
      };
    case "notion":
      return {
        oauth: true,
        authUrl: "/api/auth/notion/authorize",
        instructions:
          "Connect with Notion using OAuth for secure authentication. Click the button below to authorize Exponential to access your Notion workspace.",
      };
    case "monday":
      return {
        oauth: false,
        authUrl: null,
        instructions:
          "To get your Monday.com API key:\n1. Go to your Monday workspace\n2. Navigate to Admin > Integrations > API\n3. Generate a personal API token\n4. Copy the token and paste it below",
      };
    case "github":
      return {
        oauth: true,
        authUrl: "/api/auth/github/authorize",
        instructions:
          "Connect with GitHub using OAuth for secure authentication. Click the button below to authorize Exponential to access your GitHub repositories.",
      };
    case "slack":
      return {
        oauth: true,
        authUrl: "/api/auth/slack/authorize",
        instructions:
          "Connect with Slack using OAuth for secure authentication. Click the button below to authorize Exponential to access your Slack workspace.",
      };
    default:
      return {
        oauth: false,
        authUrl: null,
        instructions: `Please connect your ${provider} integration first.`,
      };
  }
}

export const projectWorkflowRouter = createTRPCRouter({
  // Get all available workflow templates
  getTemplates: protectedProcedure.query(async ({ ctx: _ctx }) => {
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
    .query(async ({ ctx: _ctx, input }) => {
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

  // Create API key-based integration for workflow
  createIntegrationForWorkflow: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["fireflies", "monday"]),
        apiKey: z.string().min(1),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { provider, apiKey } = input;

      // Test connection before creating
      let testResult: { success: boolean; error?: string };

      if (provider === "fireflies") {
        // Import and test Fireflies connection from integration router
        const { testFirefliesConnection } = await import(
          "~/server/api/routers/integration"
        );
        testResult = await testFirefliesConnection(apiKey);
      } else if (provider === "monday") {
        // Test Monday connection
        const mondayService = new MondayService(apiKey);
        testResult = await mondayService.testConnection();
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported provider: ${provider as string}`,
        });
      }

      if (!testResult.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} connection failed: ${testResult.error}`,
        });
      }

      // // Check if integration already exists
      // const existingIntegration = await ctx.db.integration.findFirst({
      //   where: {
      //     userId: ctx.session.user.id,
      //     provider: provider,
      //     status: "ACTIVE",
      //   },
      // });

      // if (existingIntegration) {
      //   throw new TRPCError({
      //     code: "CONFLICT",
      //     message: `You already have an active ${provider} integration. Please delete the existing one first if you want to create a new one.`,
      //   });
      // }

      // Create the integration
      const integration = await ctx.db.integration.create({
        data: {
          name:
            input.name ||
            `${provider.charAt(0).toUpperCase() + provider.slice(1)} Integration`,
          type: "API_KEY",
          provider: provider,
          description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} integration created from workflow setup`,
          userId: ctx.session.user.id,
          status: "ACTIVE",
        },
      });

      // Create the credential
      await ctx.db.integrationCredential.create({
        data: {
          key: apiKey,
          keyType: "API_KEY",
          isEncrypted: false,
          integrationId: integration.id,
        },
      });

      return {
        success: true,
        integration: {
          id: integration.id,
          name: integration.name,
          provider: integration.provider,
          status: integration.status,
        },
      };
    }),

  // Create a new project workflow from template
  createFromTemplate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        templateId: z.string(),
        name: z.string().optional(),
        configuration: z.record(z.any()),
        integrationId: z.string(),
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

      // Check for required integrations - don't allow workflow creation without them
      if (!input.integrationId) {
        // Get the first integration provider from template
        const primaryProvider = template.integrations[0];

        const integrationInstructions =
          getIntegrationInstructions(primaryProvider);
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${primaryProvider.charAt(0).toUpperCase() + primaryProvider.slice(1)} integration required`,
          cause: {
            provider: primaryProvider,
            requiresOAuth: integrationInstructions.oauth,
            authUrl: integrationInstructions.authUrl,
            instructions: integrationInstructions.instructions,
          },
        });
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
          integrationId: input.integrationId,
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
      // const template = templateId
      //   ? WORKFLOW_TEMPLATES[templateId as keyof typeof WORKFLOW_TEMPLATES]
      //   : null; // Currently unused

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
        // Execute workflow based on type
        const startTime = Date.now();
        let syncResult: any;

        if (workflow.type === "notion_todos") {
          syncResult =
            await notionSyncService.syncNotionTodosToActions(workflow);
        } else if (workflow.type === "monday_items") {
          syncResult =
            await mondaySyncService.syncMondayItemsToActions(workflow);
        } else {
          // For other workflow types, simulate execution
          await new Promise((resolve) => setTimeout(resolve, 1000));
          syncResult = {
            itemsProcessed: 1,
            itemsCreated: 1,
            itemsUpdated: 0,
            itemsSkipped: 0,
            errors: [],
          };
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Update run with results
        await ctx.db.workflowRun.update({
          where: { id: run.id },
          data: {
            status:
              syncResult.errors.length > 0
                ? "completed_with_errors"
                : "completed",
            completedAt: new Date(),
            itemsProcessed: syncResult.itemsProcessed,
            itemsCreated: syncResult.itemsCreated,
            itemsUpdated: syncResult.itemsUpdated,
            itemsSkipped: syncResult.itemsSkipped,
            errorMessage:
              syncResult.errors.length > 0
                ? syncResult.errors.join(", ")
                : null,
            metadata: {
              ...(run.metadata as object),
              duration,
              result:
                syncResult.errors.length > 0 ? "partial_success" : "success",
              message: `Workflow '${workflow.name}' executed successfully`,
              errors: syncResult.errors,
              workflowType: workflow.type,
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
          itemsProcessed: syncResult.itemsProcessed,
          itemsCreated: syncResult.itemsCreated,
          itemsUpdated: syncResult.itemsUpdated,
          itemsSkipped: syncResult.itemsSkipped,
          errors: syncResult.errors,
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
