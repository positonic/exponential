import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { ActionProcessorFactory } from "~/server/services/processors/ActionProcessorFactory";
import { MondayService } from "~/server/services/MondayService";
import { NotionService } from "~/server/services/NotionService";

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
      config: z.record(z.any()),
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
          status: 'ACTIVE',
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
              itemsUpdated: true,
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
                  createdById: ctx.session.user.id,
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
                    createdById: ctx.session.user.id,
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
        } else if (workflow.provider === 'monday' && workflow.syncDirection === 'push') {
          // Monday.com workflow - push actions to Monday.com board
          const config = workflow.config as { 
            boardId: string; 
            columnMappings?: Record<string, string>;
            source?: 'fireflies' | 'internal' | 'all';
          };
          
          const apiKey = workflow.integration.credentials.find(
            c => c.keyType === 'API_KEY'
          )?.key;

          if (!apiKey) {
            throw new Error('No API key found for Monday.com integration');
          }

          if (!config.boardId) {
            throw new Error('No board ID configured for workflow');
          }

          // Initialize Monday.com service
          const mondayService = new MondayService(apiKey);

          // Test connection first
          const connectionTest = await mondayService.testConnection();
          if (!connectionTest.success) {
            throw new Error(`Monday.com connection failed: ${connectionTest.error}`);
          }

          // Get recent actions to process (depending on configuration)
          const actionsQuery: any = {
            createdById: ctx.session.user.id,
            status: 'ACTIVE',
          };

          // If source is specified, filter accordingly
          if (config.source === 'fireflies') {
            actionsQuery.transcriptionSessionId = { not: null };
          } else if (config.source === 'internal') {
            actionsQuery.transcriptionSessionId = null;
          }
          // If source is 'all' or not specified, include all actions
          
          console.log('🔍 DEBUG: Config source:', config.source, 'Will find actions with transcriptionSessionId constraint:', !!actionsQuery.transcriptionSessionId);

          // First, find projects that are configured to use Monday.com
          const mondayProjects = await ctx.db.project.findMany({
            where: {
              createdById: ctx.session.user.id,
              taskManagementTool: 'monday',
            },
            select: { id: true }
          });

          const mondayProjectIds = mondayProjects.map(p => p.id);
          console.log('🔍 DEBUG: Monday-configured project IDs:', mondayProjectIds);

          // Only search for actions from projects that are configured for Monday.com
          if (mondayProjectIds.length > 0) {
            actionsQuery.projectId = { in: mondayProjectIds };
          } else {
            // No projects configured for Monday.com, so no actions to sync
            actionsQuery.projectId = 'no-monday-projects';
          }

          console.log('🔍 DEBUG: Workflow config:', config);
          console.log('🔍 DEBUG: Actions query:', actionsQuery);
          console.log('🔍 DEBUG: User ID:', ctx.session.user.id);

          // Debug: Check all actions for this project regardless of source
          const allProjectActions = await ctx.db.action.findMany({
            where: {
              createdById: ctx.session.user.id,
              status: 'ACTIVE',
              projectId: { in: mondayProjectIds }
            },
            include: {
              project: true,
              transcriptionSession: true,
            },
          });
          console.log('🔍 DEBUG: ALL project actions (regardless of source):', allProjectActions.length);
          console.log('🔍 DEBUG: ALL project actions:', allProjectActions.map(a => ({
            id: a.id,
            name: a.name,
            projectId: a.projectId,
            hasTranscriptionSession: !!a.transcriptionSessionId,
            source: a.transcriptionSessionId ? 'fireflies' : 'manual'
          })));

          // Note: Actions don't have createdAt field, so we'll get recent actions by ID
          // In practice, you might want to add a createdAt field to the Action model

          const actions = await ctx.db.action.findMany({
            where: actionsQuery,
            include: {
              project: true,
              transcriptionSession: true,
            },
            orderBy: { id: 'desc' }, // Actions don't have createdAt, use id instead
            take: 50, // Limit to avoid processing too many at once
          });

          console.log('🔍 DEBUG: Total actions found:', actions.length);
          console.log('🔍 DEBUG: Actions:', actions.map(a => ({
            id: a.id,
            name: a.name,
            projectId: a.projectId,
            projectName: a.project?.name,
            taskManagementTool: a.project?.taskManagementTool,
            hasTranscriptionSession: !!a.transcriptionSessionId
          })));

          // Since we already filtered by Monday-configured projects in the query, 
          // all returned actions should be Monday-compatible
          const mondayCompatibleActions = actions;
          console.log('🔍 DEBUG: Monday-compatible actions:', mondayCompatibleActions.length);

          let itemsCreated = 0;
          let itemsSkipped = 0;

          for (const action of mondayCompatibleActions) {
            try {
              // Check if this action was already processed to Monday.com
              // We can use a naming convention or metadata to track this
              const existingItems = await mondayService.getBoards();
              // This is a simplified check - in practice, you'd want to store 
              // Monday.com item IDs in your database or use a consistent naming pattern

              // Transform action to monday.com item format
              const columnValues: Record<string, any> = {};
              
              // Map fields based on configuration
              if (config.columnMappings?.priority && action.priority) {
                const priorityMapping: Record<string, string> = {
                  'Quick': 'High',
                  '1st Priority': 'High',
                  '2nd Priority': 'Medium', 
                  '3rd Priority': 'Low',
                  'Someday Maybe': 'Low',
                };
                const mondayPriority = priorityMapping[action.priority] || action.priority;
                columnValues[config.columnMappings.priority] = MondayService.formatColumnValue('status', mondayPriority);
              }

              if (config.columnMappings?.dueDate && action.dueDate) {
                columnValues[config.columnMappings.dueDate] = MondayService.formatColumnValue('date', action.dueDate);
              }

              if (config.columnMappings?.description) {
                let description = action.description || '';
                if (action.transcriptionSession) {
                  description += `\n\nFrom meeting: ${action.transcriptionSession.title || 'Untitled'}`;
                }
                if (action.project) {
                  description += `\n\nProject: ${action.project.name}`;
                }
                columnValues[config.columnMappings.description] = MondayService.formatColumnValue('long-text', description);
              }

              // Create item on Monday.com - truncate name if too long
              const truncatedName = action.name.length > 255 
                ? action.name.substring(0, 252) + '...' 
                : action.name;
                
              const createdItem = await mondayService.createItem({
                boardId: config.boardId,
                itemName: truncatedName,
                columnValues,
              });

              itemsCreated++;

              console.log(`Created Monday.com item: ${createdItem.name} (ID: ${createdItem.id})`);

            } catch (error) {
              console.error(`Failed to create Monday.com item for action ${action.id}:`, error);
              itemsSkipped++;
              // Continue processing other actions
            }
          }

          // Update run with success
          await ctx.db.workflowRun.update({
            where: { id: run.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              metadata: {
                itemsProcessed: mondayCompatibleActions.length,
                itemsCreated: itemsCreated,
                itemsSkipped: itemsSkipped,
                boardId: config.boardId,
                source: config.source || 'all',
                totalActionsFound: actions.length,
                mondayCompatibleActions: mondayCompatibleActions.length,
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
            itemsProcessed: mondayCompatibleActions.length,
            itemsCreated,
            itemsUpdated: 0,
            itemsSkipped,
          };
        } else if (workflow.provider === 'notion' && workflow.syncDirection === 'push') {
          // Notion workflow - push actions to Notion database
          const config = workflow.config as { 
            databaseId: string; 
            propertyMappings?: Record<string, string>;
            source?: 'fireflies' | 'internal' | 'all';
          };
          
          const accessToken = workflow.integration.credentials.find(
            c => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY'
          )?.key;

          if (!accessToken) {
            throw new Error('No access token found for Notion integration');
          }

          if (!config.databaseId) {
            throw new Error('No database ID configured for workflow');
          }

          // Initialize Notion service
          const notionService = new NotionService(accessToken);

          // Get actions to sync based on configuration
          let actionsQuery: any = {
            createdById: ctx.session.user.id,
            status: {
              not: 'COMPLETED',
            },
          };

          // Apply source filtering
          if (config.source === 'fireflies') {
            actionsQuery.transcriptionSessionId = {
              not: null,
            };
          } else if (config.source === 'internal') {
            actionsQuery.transcriptionSessionId = null;
          }
          // 'all' means no additional filtering

          // Only get actions from projects configured for Notion
          const notionProjects = await ctx.db.project.findMany({
            where: {
              createdById: ctx.session.user.id,
              taskManagementTool: 'notion',
            },
            select: { id: true }
          });

          const projectIds = notionProjects.map(p => p.id);
          if (projectIds.length > 0) {
            actionsQuery.projectId = {
              in: projectIds,
            };
          } else {
            // No projects configured for Notion, but allow project-less actions
            actionsQuery.OR = [
              { projectId: null },
              { projectId: { in: [] } } // Empty array means no projects match
            ];
          }

          const actions = await ctx.db.action.findMany({
            where: actionsQuery,
            include: {
              project: true,
              transcriptionSession: true,
            },
            orderBy: {
              dueDate: 'asc',
            },
          });

          console.log(`Found ${actions.length} actions to sync to Notion`);
          console.log('Project filtering:', {
            notionProjectIds: projectIds,
            totalActions: actions.length,
            source: config.source
          });

          let itemsCreated = 0;
          let itemsSkipped = 0;

          for (const action of actions) {
            try {
              // Check if action was already synced to Notion (simple check by name)
              // In a production system, you'd want to store Notion page IDs
              
              // Transform action to Notion page format
              const properties: Record<string, any> = {};
              
              // Map fields based on configuration
              if (config.propertyMappings?.priority && action.priority) {
                const priorityMapping: Record<string, string> = {
                  'Quick': 'High',
                  '1st Priority': 'High',
                  '2nd Priority': 'Medium', 
                  '3rd Priority': 'Low',
                  'Someday Maybe': 'Low',
                };
                const notionPriority = priorityMapping[action.priority] || action.priority;
                properties[config.propertyMappings.priority] = NotionService.formatPropertyValue('select', notionPriority);
              }

              if (config.propertyMappings?.dueDate && action.dueDate) {
                properties[config.propertyMappings.dueDate] = NotionService.formatPropertyValue('date', action.dueDate);
              }

              if (config.propertyMappings?.description) {
                let description = action.description || '';
                if (action.transcriptionSession) {
                  description += `\n\nFrom meeting: ${action.transcriptionSession.title || 'Untitled'}`;
                }
                if (action.project) {
                  description += `\n\nProject: ${action.project.name}`;
                }
                properties[config.propertyMappings.description] = NotionService.formatPropertyValue('rich_text', description);
              }

              // Create page in Notion database
              const createdPage = await notionService.createPage({
                databaseId: config.databaseId,
                title: action.name,
                properties,
                titleProperty: config.propertyMappings?.title,
              });

              itemsCreated++;

              console.log(`Created Notion page: ${createdPage.title} (ID: ${createdPage.id})`);

            } catch (error) {
              console.error(`Failed to create Notion page for action ${action.id}:`, error);
              itemsSkipped++;
              // Continue processing other actions
            }
          }

          // Update run with success
          await ctx.db.workflowRun.update({
            where: { id: run.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              metadata: {
                itemsProcessed: actions.length,
                itemsCreated: itemsCreated,
                itemsSkipped: itemsSkipped,
                databaseId: config.databaseId,
                source: config.source || 'all',
                totalActionsFound: actions.length,
                notionCompatibleActions: actions.length,
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
            itemsProcessed: actions.length,
            itemsCreated,
            itemsUpdated: 0,
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

  // Update workflow
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      type: z.string().optional(),
      provider: z.string().optional(),
      syncDirection: z.enum(['push', 'pull', 'bidirectional']).optional(),
      syncFrequency: z.enum(['manual', 'hourly', 'daily', 'weekly']).optional(),
      integrationId: z.string().optional(),
      projectId: z.string().optional(),
      config: z.record(z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      
      // Verify workflow exists and belongs to user
      const workflow = await ctx.db.workflow.findUnique({
        where: {
          id,
          userId: ctx.session.user.id,
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow not found or access denied',
        });
      }

      // If integrationId is being updated, verify it belongs to the user
      if (updateData.integrationId) {
        const integration = await ctx.db.integration.findUnique({
          where: {
            id: updateData.integrationId,
            userId: ctx.session.user.id,
          },
        });

        if (!integration) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Integration not found or access denied',
          });
        }
      }

      // Update the workflow
      const updatedWorkflow = await ctx.db.workflow.update({
        where: { id },
        data: updateData,
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
        },
      });

      return updatedWorkflow;
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

  // Get all differentiators
  getAllDifferentiators: protectedProcedure
    .query(async ({ ctx }) => {
      const differentiators = await ctx.db.differentiator.findMany({
        orderBy: {
          label: 'asc',
        },
      });
      return differentiators;
    }),

  // Create a new differentiator
  createDifferentiator: protectedProcedure
    .input(z.object({
      value: z.string(),
      label: z.string(),
      description: z.string().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const differentiator = await ctx.db.differentiator.create({
        data: {
          value: input.value,
          label: input.label,
          description: input.description || '',
          isDefault: input.isDefault || false,
        },
      });
      return differentiator;
    }),

  // Get all audiences
  getAllAudiences: protectedProcedure
    .query(async ({ ctx }) => {
      const audiences = await ctx.db.audience.findMany({
        orderBy: {
          label: 'asc',
        },
      });
      return audiences;
    }),

  // Create a new audience
  createAudience: protectedProcedure
    .input(z.object({
      value: z.string(),
      label: z.string(),
      description: z.string().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const audience = await ctx.db.audience.create({
        data: {
          value: input.value,
          label: input.label,
          description: input.description || '',
          isDefault: input.isDefault || false,
        },
      });
      return audience;
    }),
});