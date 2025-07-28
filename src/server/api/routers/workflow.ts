import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Test Notion connection and sync data
async function syncNotionTasks(accessToken: string, databaseId: string) {
  try {
    // Fetch database content from Notion
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Transform Notion pages to task format
    const tasks = data.results.map((page: any) => {
      const title = page.properties.Name?.title?.[0]?.plain_text || 
                   page.properties.Title?.title?.[0]?.plain_text ||
                   'Untitled Task';
      
      const status = page.properties.Status?.select?.name || 
                    page.properties.Done?.checkbox ? 'COMPLETED' : 'ACTIVE';
      
      const dueDate = page.properties['Due Date']?.date?.start ||
                     page.properties.Date?.date?.start;
      
      const description = page.properties.Description?.rich_text?.[0]?.plain_text ||
                         page.properties.Notes?.rich_text?.[0]?.plain_text;

      const priority = page.properties.Priority?.select?.name || 'Medium';

      return {
        notionId: page.id,
        name: title,
        description,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate) : null,
        notionUrl: page.url,
        lastModified: new Date(page.last_edited_time),
      };
    });

    return {
      success: true,
      tasks,
      totalFetched: data.results.length,
    };
  } catch (error) {
    console.error('Notion sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync with Notion',
      tasks: [],
      totalFetched: 0,
    };
  }
}

export const workflowRouter = createTRPCRouter({
  // Create a new workflow
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.string(),
      provider: z.string(),
      syncDirection: z.enum(['push', 'pull', 'bidirectional']),
      syncFrequency: z.enum(['manual', 'hourly', 'daily', 'weekly']),
      integrationId: z.string(),
      projectId: z.string().optional(),
      config: z.object({
        databaseId: z.string(),
        fieldMappings: z.record(z.string()).optional(),
      }),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the integration belongs to the user
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      // Create the workflow
      const workflow = await ctx.db.workflow.create({
        data: {
          name: input.name,
          type: input.type,
          provider: input.provider,
          syncDirection: input.syncDirection,
          syncFrequency: input.syncFrequency,
          config: input.config,
          integrationId: input.integrationId,
          userId: ctx.session.user.id,
          projectId: input.projectId,
        },
        include: {
          integration: true,
          project: true,
        },
      });

      return workflow;
    }),

  // List user's workflows
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const workflows = await ctx.db.workflow.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        include: {
          integration: {
            select: {
              id: true,
              name: true,
              provider: true,
              status: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          runs: {
            take: 1,
            orderBy: {
              startedAt: 'desc',
            },
            select: {
              id: true,
              status: true,
              startedAt: true,
              completedAt: true,
              itemsProcessed: true,
              itemsCreated: true,
              errorMessage: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      return workflows;
    }),

  // Get workflow by ID
  get: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
        include: {
          integration: {
            include: {
              credentials: true,
            },
          },
          project: true,
          runs: {
            take: 10,
            orderBy: {
              startedAt: 'desc',
            },
          },
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow not found or access denied',
        });
      }

      return workflow;
    }),

  // Run a workflow manually
  run: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the workflow with integration details
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
        include: {
          integration: {
            include: {
              credentials: true,
            },
          },
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow not found or access denied',
        });
      }

      if (workflow.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Workflow is not active',
        });
      }

      // Create a workflow run record
      const run = await ctx.db.workflowRun.create({
        data: {
          workflowId: workflow.id,
          status: 'RUNNING',
        },
      });

      try {
        // Execute the workflow based on type
        if (workflow.provider === 'notion' && workflow.syncDirection === 'pull') {
          const config = workflow.config as { databaseId: string };
          const accessToken = workflow.integration.credentials.find(
            c => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY'
          )?.key;

          if (!accessToken) {
            throw new Error('No access token found for Notion integration');
          }

          if (!config.databaseId) {
            throw new Error('No database ID configured for workflow');
          }

          // Sync tasks from Notion
          const syncResult = await syncNotionTasks(accessToken, config.databaseId);

          if (!syncResult.success) {
            throw new Error(syncResult.error || 'Sync failed');
          }

          // Create actions for each task
          let itemsCreated = 0;
          let itemsUpdated = 0;
          let itemsSkipped = 0;

          for (const task of syncResult.tasks) {
            try {
              // Check if action already exists (by Notion ID)
              const existingAction = await ctx.db.action.findFirst({
                where: {
                  userId: ctx.session.user.id,
                  sourceIntegrationId: workflow.integrationId,
                  // Store Notion ID in description or create a separate field
                  description: {
                    contains: `notion:${task.notionId}`,
                  },
                },
              });

              if (existingAction) {
                // Update existing action if it's different
                const needsUpdate = 
                  existingAction.name !== task.name ||
                  existingAction.status !== task.status ||
                  (existingAction.dueDate?.getTime() !== task.dueDate?.getTime());

                if (needsUpdate) {
                  await ctx.db.action.update({
                    where: { id: existingAction.id },
                    data: {
                      name: task.name,
                      description: task.description ? 
                        `${task.description}\n\nnotion:${task.notionId}` : 
                        `notion:${task.notionId}`,
                      status: task.status,
                      priority: task.priority,
                      dueDate: task.dueDate,
                      updatedAt: new Date(),
                    },
                  });
                  itemsUpdated++;
                } else {
                  itemsSkipped++;
                }
              } else {
                // Create new action
                await ctx.db.action.create({
                  data: {
                    name: task.name,
                    description: task.description ? 
                      `${task.description}\n\nnotion:${task.notionId}` : 
                      `notion:${task.notionId}`,
                    status: task.status,
                    priority: task.priority,
                    dueDate: task.dueDate,
                    userId: ctx.session.user.id,
                    sourceIntegrationId: workflow.integrationId,
                    projectId: workflow.projectId,
                  },
                });
                itemsCreated++;
              }
            } catch (taskError) {
              console.error(`Error processing task ${task.notionId}:`, taskError);
              itemsSkipped++;
            }
          }

          // Update the run with success
          await ctx.db.workflowRun.update({
            where: { id: run.id },
            data: {
              status: 'SUCCESS',
              completedAt: new Date(),
              itemsProcessed: syncResult.totalFetched,
              itemsCreated,
              itemsUpdated,
              itemsSkipped,
              metadata: {
                notionTasks: syncResult.tasks.length,
                databaseId: config.databaseId,
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
            itemsProcessed: syncResult.totalFetched,
            itemsCreated,
            itemsUpdated,
            itemsSkipped,
          };
        } else {
          throw new Error(`Workflow type not implemented: ${workflow.provider}/${workflow.syncDirection}`);
        }
      } catch (error) {
        // Update the run with failure
        await ctx.db.workflowRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Workflow execution failed',
        });
      }
    }),

  // Delete a workflow
  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow not found or access denied',
        });
      }

      await ctx.db.workflow.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Update workflow status
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['ACTIVE', 'DISABLED', 'ERROR']),
    }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow not found or access denied',
        });
      }

      const updatedWorkflow = await ctx.db.workflow.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      return updatedWorkflow;
    }),
});