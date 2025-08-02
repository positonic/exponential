import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { ActionProcessorFactory } from "~/server/services/processors/ActionProcessorFactory";
import { MondayService } from "~/server/services/MondayService";
import { NotionService } from "~/server/services/NotionService";

// Helper function for Notion pull sync
async function runNotionPullSync(ctx: any, workflow: any, runId: string, deletionBehavior?: string) {
  const config = workflow.config as { databaseId: string; propertyMappings?: Record<string, string> };
  const accessToken = workflow.integration.credentials.find(
    (c: any) => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY'
  )?.key;

  if (!accessToken) {
    throw new Error('No access token found for Notion integration');
  }

  if (!config.databaseId) {
    throw new Error('No database ID configured for workflow');
  }

  // Get the project's notionProjectId for filtering
  const project = await ctx.db.project.findUnique({
    where: { id: workflow.projectId },
    select: { notionProjectId: true },
  });

  // Initialize Notion service
  const notionService = new NotionService(accessToken);

  // Get pages from the Notion database, filtered by project if available
  const notionPages = await notionService.getAllPagesFromDatabase(
    config.databaseId, 
    project?.notionProjectId || undefined
  );
  
  console.log(`Found ${notionPages.length} pages in Notion database`);

  // Create actions for each task
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let itemsSkipped = 0;

  for (const page of notionPages) {
    try {
      // Parse Notion page to action format
      const task = notionService.parseNotionPageToAction(page, config.propertyMappings);
      
      // Check if we already have an ActionSync record for this Notion page
      const existingSync = await ctx.db.actionSync.findFirst({
        where: {
          provider: 'notion',
          externalId: task.notionId,
        },
        include: {
          action: true,
        },
      });

      if (existingSync && existingSync.action) {
        // Update existing action if it's different
        const existingAction = existingSync.action;
        const needsUpdate = 
          existingAction.name !== task.name ||
          existingAction.status !== task.status ||
          existingAction.description !== task.description ||
          existingAction.priority !== task.priority ||
          (existingAction.dueDate?.getTime() !== task.dueDate?.getTime());

        if (needsUpdate) {
          await ctx.db.action.update({
            where: { id: existingAction.id },
            data: {
              name: task.name,
              description: task.description,
              status: task.status,
              priority: task.priority,
              dueDate: task.dueDate,
            },
          });
          
          // Update the sync record
          await ctx.db.actionSync.update({
            where: { id: existingSync.id },
            data: {
              status: 'synced',
              updatedAt: new Date(),
            },
          });
          
          itemsUpdated++;
          console.log(`Updated action ${existingAction.id} from Notion page ${task.notionId}`);
        } else {
          itemsSkipped++;
        }
      } else {
        // Create new action and ActionSync record
        const newAction = await ctx.db.action.create({
          data: {
            name: task.name,
            description: task.description,
            status: task.status,
            priority: task.priority || 'Quick',
            dueDate: task.dueDate,
            createdById: ctx.session.user.id,
            projectId: workflow.projectId,
          },
        });

        // Create ActionSync record
        await ctx.db.actionSync.create({
          data: {
            actionId: newAction.id,
            provider: 'notion',
            externalId: task.notionId,
            status: 'synced',
          },
        });

        itemsCreated++;
        console.log(`Created new action ${newAction.id} from Notion page ${task.notionId}`);
      }
    } catch (taskError) {
      console.error(`Error processing Notion page ${page.id}:`, taskError);
      itemsSkipped++;
    }
  }

  // Handle deletions - find actions that exist locally but not in Notion
  if (deletionBehavior === 'mark_deleted') {
    const localActionSyncs = await ctx.db.actionSync.findMany({
      where: {
        provider: 'notion',
        action: {
          createdById: ctx.session.user.id,
          projectId: workflow.projectId,
          status: {
            not: 'DELETED',
          },
        },
      },
      include: {
        action: true,
      },
    });

    const notionPageIds = notionPages.map((page: any) => page.id);
    
    for (const syncRecord of localActionSyncs) {
      if (!notionPageIds.includes(syncRecord.externalId)) {
        // This action was deleted in Notion, mark it as deleted locally
        await ctx.db.action.update({
          where: { id: syncRecord.actionId },
          data: { status: 'DELETED' },
        });
        
        await ctx.db.actionSync.update({
          where: { id: syncRecord.id },
          data: { status: 'deleted_remotely' },
        });
        
        console.log(`Marked action ${syncRecord.actionId} as DELETED (removed from Notion)`);
        itemsUpdated++;
      }
    }
  }

  // Update the run with success
  await ctx.db.workflowRun.update({
    where: { id: runId },
    data: {
      status: 'SUCCESS',
      completedAt: new Date(),
      itemsProcessed: notionPages.length,
      itemsCreated,
      itemsUpdated,
      itemsSkipped,
      metadata: {
        notionPages: notionPages.length,
        databaseId: config.databaseId,
        syncDirection: 'pull',
        deletionBehavior,
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
    runId,
    itemsProcessed: notionPages.length,
    itemsCreated,
    itemsUpdated,
    itemsSkipped,
  };
}

// Helper function for Notion push sync
async function runNotionPushSync(ctx: any, workflow: any, runId: string) {
  const config = workflow.config as { 
    databaseId: string; 
    propertyMappings?: Record<string, string>;
    source?: 'fireflies' | 'internal' | 'all';
  };
  
  const accessToken = workflow.integration.credentials.find(
    (c: any) => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY'
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

  const projectIds = notionProjects.map((p: any) => p.id);
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

  let itemsCreated = 0;
  let itemsSkipped = 0;
  let itemsAlreadySynced = 0;
  let itemsFailedToSync = 0;
  const skippedReasons: string[] = [];

  for (const action of actions) {
    try {
      // Check if this action has already been synced to Notion
      const existingSync = await ctx.db.actionSync.findFirst({
        where: {
          actionId: action.id,
          provider: 'notion',
        },
      });

      if (existingSync) {
        console.log(`Skipping action ${action.id} - already synced to Notion (page: ${existingSync.externalId})`);
        itemsAlreadySynced++;
        itemsSkipped++;
        skippedReasons.push(`"${action.name}" - Already synced to Notion`);
        continue;
      }
      
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

      // Get the project's notionProjectId for linking
      const project = action.project ? await ctx.db.project.findUnique({
        where: { id: action.project.id },
        select: { notionProjectId: true },
      }) : null;

      // Create page in Notion database
      const createdPage = await notionService.createPage({
        databaseId: config.databaseId,
        title: action.name,
        properties,
        titleProperty: config.propertyMappings?.title,
        projectId: project?.notionProjectId || undefined,
      });

      // Create ActionSync record to track this sync
      await ctx.db.actionSync.create({
        data: {
          actionId: action.id,
          provider: 'notion',
          externalId: createdPage.id,
          status: 'synced',
        },
      });

      itemsCreated++;

      console.log(`Created Notion page: ${createdPage.title} (ID: ${createdPage.id}) and ActionSync record`);

    } catch (error) {
      console.error(`Failed to create Notion page for action ${action.id}:`, error);
      
      itemsFailedToSync++;
      itemsSkipped++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      skippedReasons.push(`"${action.name}" - Failed: ${errorMessage}`);
      
      // Create ActionSync record with failed status
      try {
        await ctx.db.actionSync.create({
          data: {
            actionId: action.id,
            provider: 'notion',
            externalId: `failed-${Date.now()}`, // Temporary ID for failed syncs
            status: 'failed',
          },
        });
      } catch (syncError) {
        console.error(`Failed to create ActionSync failure record for action ${action.id}:`, syncError);
      }
      
      // Continue processing other actions
    }
  }

  // Update run with success
  await ctx.db.workflowRun.update({
    where: { id: runId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      itemsProcessed: actions.length,
      itemsCreated,
      itemsUpdated: 0,
      itemsSkipped,
      metadata: {
        itemsProcessed: actions.length,
        itemsCreated: itemsCreated,
        itemsSkipped: itemsSkipped,
        itemsAlreadySynced,
        itemsFailedToSync,
        skippedReasons,
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
    runId,
    itemsProcessed: actions.length,
    itemsCreated,
    itemsUpdated: 0,
    itemsSkipped,
    itemsAlreadySynced,
    itemsFailedToSync,
    skippedReasons,
  };
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

          // Initialize Notion service
          const notionService = new NotionService(accessToken);

          // Get all pages from the Notion database
          const notionPages = await notionService.getAllPagesFromDatabase(config.databaseId);
          
          console.log(`Found ${notionPages.length} pages in Notion database`);

          // Create actions for each task
          let itemsCreated = 0;
          let itemsUpdated = 0;
          let itemsSkipped = 0;

          for (const page of notionPages) {
            try {
              // Parse Notion page to action format
              const task = notionService.parseNotionPageToAction(page, config.propertyMappings);
              
              // Check if we already have an ActionSync record for this Notion page
              const existingSync = await ctx.db.actionSync.findFirst({
                where: {
                  provider: 'notion',
                  externalId: task.notionId,
                },
                include: {
                  action: true,
                },
              });

              if (existingSync && existingSync.action) {
                // Update existing action if it's different
                const existingAction = existingSync.action;
                const needsUpdate = 
                  existingAction.name !== task.name ||
                  existingAction.status !== task.status ||
                  existingAction.description !== task.description ||
                  existingAction.priority !== task.priority ||
                  (existingAction.dueDate?.getTime() !== task.dueDate?.getTime());

                if (needsUpdate) {
                  await ctx.db.action.update({
                    where: { id: existingAction.id },
                    data: {
                      name: task.name,
                      description: task.description,
                      status: task.status,
                      priority: task.priority,
                      dueDate: task.dueDate,
                    },
                  });
                  
                  // Update the sync record
                  await ctx.db.actionSync.update({
                    where: { id: existingSync.id },
                    data: {
                      status: 'synced',
                      updatedAt: new Date(),
                    },
                  });
                  
                  itemsUpdated++;
                  console.log(`Updated action ${existingAction.id} from Notion page ${task.notionId}`);
                } else {
                  itemsSkipped++;
                }
              } else {
                // Create new action and ActionSync record
                const newAction = await ctx.db.action.create({
                  data: {
                    name: task.name,
                    description: task.description,
                    status: task.status,
                    priority: task.priority || 'Quick',
                    dueDate: task.dueDate,
                    createdById: ctx.session.user.id,
                    projectId: workflow.projectId,
                  },
                });

                // Create ActionSync record
                await ctx.db.actionSync.create({
                  data: {
                    actionId: newAction.id,
                    provider: 'notion',
                    externalId: task.notionId,
                    status: 'synced',
                  },
                });

                itemsCreated++;
                console.log(`Created new action ${newAction.id} from Notion page ${task.notionId}`);
              }
            } catch (taskError) {
              console.error(`Error processing Notion page ${page.id}:`, taskError);
              itemsSkipped++;
            }
          }

          // Update the run with success
          await ctx.db.workflowRun.update({
            where: { id: run.id },
            data: {
              status: 'SUCCESS',
              completedAt: new Date(),
              itemsProcessed: notionPages.length,
              itemsCreated,
              itemsUpdated,
              itemsSkipped,
              metadata: {
                notionPages: notionPages.length,
                databaseId: config.databaseId,
                syncDirection: 'pull',
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
            itemsProcessed: notionPages.length,
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
              // Check if this action has already been synced to Notion
              const existingSync = await ctx.db.actionSync.findFirst({
                where: {
                  actionId: action.id,
                  provider: 'notion',
                },
              });

              if (existingSync) {
                console.log(`Skipping action ${action.id} - already synced to Notion (page: ${existingSync.externalId})`);
                itemsSkipped++;
                continue;
              }
              
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

              // Create ActionSync record to track this sync
              await ctx.db.actionSync.create({
                data: {
                  actionId: action.id,
                  provider: 'notion',
                  externalId: createdPage.id,
                  status: 'synced',
                },
              });

              itemsCreated++;

              console.log(`Created Notion page: ${createdPage.title} (ID: ${createdPage.id}) and ActionSync record`);

            } catch (error) {
              console.error(`Failed to create Notion page for action ${action.id}:`, error);
              
              // Create ActionSync record with failed status
              try {
                await ctx.db.actionSync.create({
                  data: {
                    actionId: action.id,
                    provider: 'notion',
                    externalId: `failed-${Date.now()}`, // Temporary ID for failed syncs
                    status: 'failed',
                  },
                });
              } catch (syncError) {
                console.error(`Failed to create ActionSync failure record for action ${action.id}:`, syncError);
              }
              
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

  // Smart sync for projects with canonical source configuration
  smartSync: protectedProcedure
    .input(z.object({
      projectId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the project with its task management configuration
      const project = await ctx.db.project.findUnique({
        where: {
          id: input.projectId,
          createdById: ctx.session.user.id,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found or access denied',
        });
      }

      if (!project.taskManagementTool || project.taskManagementTool === 'internal') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Project is not configured for external task management',
        });
      }

      const config = project.taskManagementConfig as {
        workflowId?: string;
        databaseId?: string;
        syncStrategy?: 'manual' | 'auto_pull_then_push' | 'notion_canonical';
        conflictResolution?: 'local_wins' | 'remote_wins';
        deletionBehavior?: 'mark_deleted' | 'archive';
      } || {};

      const syncStrategy = config.syncStrategy || 'manual';

      // Get available workflows
      const workflows = await ctx.db.workflow.findMany({
        where: {
          userId: ctx.session.user.id,
          provider: project.taskManagementTool,
          status: 'ACTIVE',
        },
      });

      let pullResults = null;
      let pushResults = null;

      // Step 1: Pull sync (if strategy requires it)
      if (syncStrategy === 'notion_canonical' || syncStrategy === 'auto_pull_then_push') {
        const pullWorkflow = workflows.find(w => 
          w.syncDirection === 'pull' || w.syncDirection === 'bidirectional'
        );

        if (pullWorkflow) {
          console.log(`🔄 Smart sync: Running pull sync first (strategy: ${syncStrategy})`);
          
          // Run the existing pull sync logic
          const pullRunResult = await ctx.db.workflowRun.create({
            data: {
              workflowId: pullWorkflow.id,
              status: 'RUNNING',
            },
          });

          try {
            // Call the existing pull sync logic from the run method
            if (project.taskManagementTool === 'notion') {
              pullResults = await runNotionPullSync(ctx, pullWorkflow, pullRunResult.id, config.deletionBehavior);
            }
          } catch (error) {
            console.error('Pull sync failed:', error);
            // Mark pull run as failed but continue to push
            await ctx.db.workflowRun.update({
              where: { id: pullRunResult.id },
              data: {
                status: 'FAILED',
                completedAt: new Date(),
                errorMessage: error instanceof Error ? error.message : 'Pull sync failed',
              },
            });
          }
        }
      }

      // Step 2: Push sync
      const pushWorkflow = workflows.find(w => 
        (config.workflowId && w.id === config.workflowId) ||
        (w.syncDirection === 'push' || w.syncDirection === 'bidirectional')
      );

      if (pushWorkflow) {
        console.log(`🔄 Smart sync: Running push sync`);
        
        const pushRunResult = await ctx.db.workflowRun.create({
          data: {
            workflowId: pushWorkflow.id,
            status: 'RUNNING',
          },
        });

        try {
          // Call the existing push sync logic from the run method
          if (project.taskManagementTool === 'notion') {
            pushResults = await runNotionPushSync(ctx, pushWorkflow, pushRunResult.id);
          }
        } catch (error) {
          console.error('Push sync failed:', error);
          await ctx.db.workflowRun.update({
            where: { id: pushRunResult.id },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              errorMessage: error instanceof Error ? error.message : 'Push sync failed',
            },
          });
          throw error;
        }
      }

      // Return combined results
      return {
        success: true,
        syncStrategy,
        pullResults,
        pushResults,
        itemsCreated: (pullResults?.itemsCreated || 0) + (pushResults?.itemsCreated || 0),
        itemsUpdated: (pullResults?.itemsUpdated || 0) + (pushResults?.itemsUpdated || 0),
        itemsSkipped: (pullResults?.itemsSkipped || 0) + (pushResults?.itemsSkipped || 0),
        itemsProcessed: (pullResults?.itemsProcessed || 0) + (pushResults?.itemsProcessed || 0),
        itemsAlreadySynced: pushResults?.itemsAlreadySynced || 0,
        itemsFailedToSync: pushResults?.itemsFailedToSync || 0,
        skippedReasons: pushResults?.skippedReasons || [],
      };
    }),

  // Fetch Notion projects from a Projects database
  getNotionProjects: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Find the workflow
      const workflow = await ctx.db.workflow.findFirst({
        where: {
          id: input.workflowId,
          userId: ctx.session.user.id,
          provider: 'notion',
          status: 'ACTIVE',
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
          message: 'Workflow not found',
        });
      }

      const config = workflow.config as { 
        projectsDatabaseId?: string;
      };

      if (!config.projectsDatabaseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No Projects database configured for this workflow',
        });
      }

      // Get access token
      const accessToken = workflow.integration.credentials.find(
        (c: any) => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY'
      )?.key;

      if (!accessToken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No access token found for Notion integration',
        });
      }

      // Initialize Notion service and fetch projects
      const notionService = new NotionService(accessToken);
      
      try {
        const projects = await notionService.getProjectsFromDatabase(config.projectsDatabaseId);
        return projects;
      } catch (error) {
        console.error('Failed to fetch Notion projects:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch Notion projects',
        });
      }
    }),
});