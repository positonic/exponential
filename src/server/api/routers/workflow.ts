import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { MondayService } from "~/server/services/MondayService";
import { NotionService } from "~/server/services/NotionService";
import {
  WorkflowExecutorFactory,
  type WorkflowWithCredentials,
  type WorkflowConfig,
} from "~/server/services/sync";

// Helper function for Notion pull sync
async function runNotionPullSync(ctx: any, workflow: any, runId: string, deletionBehavior?: string, projectId?: string) {
  const config = workflow.config as {
    databaseId: string;
    propertyMappings?: Record<string, string>;
    projectColumn?: string; // Dynamic column name for project relation
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

  // Get the project's notionProjectId for filtering if projectId is provided
  let project = null;
  let notionProjectId = undefined;

  if (projectId) {
    project = await ctx.db.project.findUnique({
      where: { id: projectId },
      select: { notionProjectId: true, name: true },
    });
    notionProjectId = project?.notionProjectId;
  }

  // Initialize Notion service
  const notionService = new NotionService(accessToken);

  // Get pages from the Notion database, filtered by project if available
  const notionPages = await notionService.getAllPagesFromDatabase(
    config.databaseId,
    notionProjectId,
    config.projectColumn // Pass dynamic column name
  );

  // Get user mappings for this integration to resolve assignees
  const userMappings = await ctx.db.integrationUserMapping.findMany({
    where: {
      integrationId: workflow.integrationId,
    },
  });

  console.log('[PULL SYNC] User mappings found:', userMappings.length, 'for integrationId:', workflow.integrationId);
  console.log('[PULL SYNC] User mappings:', userMappings.map((m: { externalUserId: string; userId: string }) => ({ externalUserId: m.externalUserId, localUserId: m.userId })));

  // Create a lookup map for quick access: Notion user ID -> Local user ID
  const userMappingLookup = new Map<string, string>();
  for (const mapping of userMappings) {
    userMappingLookup.set(mapping.externalUserId, mapping.userId);
  }

  // Create actions for each task
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let itemsSkipped = 0;

  for (const page of notionPages) {
    try {
      // Parse Notion page to action format
      const task = notionService.parseNotionPageToAction(page, config.propertyMappings);

      // Resolve assignee using the user mapping
      const assignedToId = task.assigneeNotionUserId
        ? userMappingLookup.get(task.assigneeNotionUserId)
        : undefined;

      console.log('[PULL SYNC] Assignee resolution:', {
        taskName: task.name,
        notionUserId: task.assigneeNotionUserId,
        resolvedLocalUserId: assignedToId,
        mappingExists: task.assigneeNotionUserId ? userMappingLookup.has(task.assigneeNotionUserId) : false,
      });

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

      let shouldCreateNew = false;

      if (existingSync) {
        if (existingSync.action) {
          // Update existing action if it's different
          const existingAction = existingSync.action;
          const needsUpdate =
            existingAction.name !== task.name ||
            existingAction.status !== task.status ||
            existingAction.description !== task.description ||
            existingAction.priority !== task.priority ||
            existingAction.assignedToId !== assignedToId ||
            existingAction.projectId !== projectId || // Also update if projectId changed
            (existingAction.dueDate?.getTime() !== task.dueDate?.getTime());

          console.log('[PULL SYNC] Action check:', {
            actionId: existingAction.id,
            actionName: existingAction.name,
            existingProjectId: existingAction.projectId,
            targetProjectId: projectId,
            existingStatus: existingAction.status,
            newStatus: task.status,
            needsUpdate,
          });

          if (needsUpdate) {
            await ctx.db.action.update({
              where: { id: existingAction.id },
              data: {
                name: task.name,
                description: task.description,
                status: task.status,
                priority: task.priority,
                dueDate: task.dueDate,
                assignedToId: assignedToId ?? existingAction.assignedToId,
                projectId: projectId ?? existingAction.projectId, // Update projectId if provided
              },
            });

            // Also update the assignees relationship (many-to-many)
            if (assignedToId) {
              // Check if this assignee already exists
              const existingAssignee = await ctx.db.actionAssignee.findFirst({
                where: {
                  actionId: existingAction.id,
                  userId: assignedToId,
                },
              });

              if (!existingAssignee) {
                await ctx.db.actionAssignee.create({
                  data: {
                    actionId: existingAction.id,
                    userId: assignedToId,
                  },
                });
                console.log('[PULL SYNC] Added assignee:', assignedToId, 'to action:', existingAction.id);
              }
            }

            console.log('[PULL SYNC] Updated action:', existingAction.id, 'with projectId:', projectId);

            // Update the sync record
            await ctx.db.actionSync.update({
              where: { id: existingSync.id },
              data: {
                status: 'synced',
                updatedAt: new Date(),
              },
            });

            itemsUpdated++;
          } else {
            itemsSkipped++;
          }
        } else {
          // Sync record exists but action was deleted locally - recreate it

          // Delete the orphaned sync record
          await ctx.db.actionSync.delete({
            where: { id: existingSync.id },
          });

          // Mark that we need to create a new action
          shouldCreateNew = true;
        }
      } else {
        shouldCreateNew = true;
      }

      if (shouldCreateNew) {
        // Create new action and ActionSync record
        const newAction = await ctx.db.action.create({
          data: {
            name: task.name,
            description: task.description,
            status: task.status,
            priority: task.priority || 'Quick',
            dueDate: task.dueDate,
            createdById: ctx.session.user.id,
            projectId: projectId || undefined, // Use the provided projectId
            assignedToId,
          },
        });

        // Create ActionAssignee record for many-to-many relationship
        if (assignedToId) {
          await ctx.db.actionAssignee.create({
            data: {
              actionId: newAction.id,
              userId: assignedToId,
            },
          });
          console.log('[PULL SYNC] Created action with assignee:', assignedToId);
        }

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
      }
    } catch (taskError) {
      console.error(`Error processing Notion page ${page.id}:`, taskError);
      itemsSkipped++;
    }
  }

  // Handle deletions - find actions that exist locally but not in Notion
  if (deletionBehavior === 'mark_deleted' && projectId) {
    const localActionSyncs = await ctx.db.actionSync.findMany({
      where: {
        provider: 'notion',
        action: {
          createdById: ctx.session.user.id,
          projectId: projectId, // Use the provided projectId
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
async function runNotionPushSync(ctx: any, workflow: any, runId: string, overwriteMode = false, projectId?: string, actionIds?: string[]) {
  const config = workflow.config as {
    databaseId: string;
    propertyMappings?: Record<string, string>;
    source?: 'fireflies' | 'internal' | 'all';
    projectColumn?: string; // Dynamic column name for project relation
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
  const actionsQuery: any = {
    createdById: ctx.session.user.id,
    status: {
      not: 'COMPLETED',
    },
  };

  // Get Notion projects for later use
  const notionProjects = await ctx.db.project.findMany({
    where: {
      createdById: ctx.session.user.id,
      taskManagementTool: 'notion',
    },
    select: { id: true }
  });

  const projectIds = notionProjects.map((p: any) => p.id);

  // If specific action IDs are provided, filter by them
  if (actionIds && actionIds.length > 0) {
    actionsQuery.id = { in: actionIds };
  } else {
    // Apply source filtering (only when not using specific IDs)
    if (config.source === 'fireflies') {
      actionsQuery.transcriptionSessionId = {
        not: null,
      };
    } else if (config.source === 'internal') {
      actionsQuery.transcriptionSessionId = null;
    }
    // 'all' means no additional filtering

    // Only get actions from projects configured for Notion
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


  // Check for deletions before pushing to avoid showing stale sync status
  
  // Get all ActionSync records for this project to check if they still exist in Notion
  const existingSyncs = await ctx.db.actionSync.findMany({
    where: {
      provider: 'notion',
      status: 'synced', // Only check synced items
      action: {
        createdById: ctx.session.user.id,
        projectId: { in: projectIds },
      },
    },
    include: { action: true },
  });

  if (existingSyncs.length > 0) {
    
    // Get current pages from Notion to check what still exists
    const currentNotionPages = await notionService.getAllPagesFromDatabase(
      config.databaseId,
      undefined, // No project filter for existence check
      config.projectColumn
    );
    const currentPageIds = currentNotionPages.map((page: any) => page.id);
    
    // Check each synced task to see if it still exists in Notion
    for (const syncRecord of existingSyncs) {
      if (!currentPageIds.includes(syncRecord.externalId)) {
        await ctx.db.actionSync.update({
          where: { id: syncRecord.id },
          data: { status: 'deleted_remotely' },
        });
      }
    }
  }

  let itemsCreated = 0;
  let itemsSkipped = 0;
  let itemsAlreadySynced = 0;
  let itemsFailedToSync = 0;
  let itemsDeleted = 0;
  let itemsUpdated = 0;
  const skippedReasons: string[] = [];

  // In overwrite mode, delete all Notion tasks that don't exist in our local actions
  if (overwriteMode) {
    
    // Get all pages from Notion for this project
    const allNotionPages = await notionService.getAllPagesFromDatabase(
      config.databaseId,
      projectId ? (await ctx.db.project.findUnique({
        where: { id: projectId },
        select: { notionProjectId: true }
      }))?.notionProjectId : undefined,
      config.projectColumn
    );
    
    const localActionNotionIds = new Set(
      await ctx.db.actionSync.findMany({
        where: {
          provider: 'notion',
          action: {
            createdById: ctx.session.user.id,
            projectId: projectId || { in: projectIds },
            status: { not: 'DELETED' },
          },
        },
        select: { externalId: true },
      }).then((syncs: any) => syncs.map((s: any) => s.externalId))
    );
    
    // Delete Notion pages that don't have corresponding local actions
    for (const notionPage of allNotionPages) {
      if (!localActionNotionIds.has(notionPage.id)) {
        try {
          // Archive the page in Notion (safer than hard delete)
          await notionService.archivePage(notionPage.id);
          itemsDeleted++;
        } catch (error) {
          console.error(`Failed to delete Notion page ${notionPage.id}:`, error);
        }
      }
    }
    
    if (itemsDeleted > 0) {
    }
  }

  for (const action of actions) {
    try {
      // Transform action to Notion page format first (needed for overwrite mode)
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

      // Check if this action has already been synced to Notion
      const existingSync = await ctx.db.actionSync.findFirst({
        where: {
          actionId: action.id,
          provider: 'notion',
        },
      });


      if (existingSync) {
        if (existingSync.status === 'deleted_remotely') {
          itemsAlreadySynced++;
          itemsSkipped++;
          skippedReasons.push(`"${action.name}" - Deleted from Notion (cannot recreate)`);
          continue;
        } else if (existingSync.status === 'synced') {
          if (overwriteMode) {
            // In overwrite mode, update the existing page
            
            try {
              // Update the existing Notion page
              await notionService.updatePage({
                pageId: existingSync.externalId,
                properties: properties,
              });
              
              itemsUpdated++;
            } catch (error) {
              console.error(`Failed to update Notion page ${existingSync.externalId}:`, error);
              itemsFailedToSync++;
              itemsSkipped++;
              skippedReasons.push(`"${action.name}" - Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            continue;
          } else {
            itemsAlreadySynced++;
            itemsSkipped++;
            skippedReasons.push(`"${action.name}" - Already synced to Notion`);
            continue;
          }
        } else if (existingSync.status === 'failed') {
          // Allow the sync to proceed for failed items
        }
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
        projectId: project?.notionProjectId ?? undefined,
        projectColumn: config.projectColumn,
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
    itemsUpdated,
    itemsSkipped,
    itemsAlreadySynced,
    itemsFailedToSync,
    itemsDeleted,
    skippedReasons,
  };
}

// Helper function for new sync engine (feature flagged)
async function runNewSyncEngine(
  ctx: any,
  workflow: WorkflowWithCredentials,
  runId: string,
  input: {
    projectId?: string;
    overwriteMode?: boolean;
    actionIds?: string[];
    notionProjectId?: string;
  }
) {
  const config = workflow.config as WorkflowConfig;
  const syncDirection = workflow.syncDirection ?? config.syncDirection ?? 'push';

  // Get project's notionProjectId if projectId is provided
  let notionProjectId = input.notionProjectId ?? config.notionProjectId;
  if (input.projectId && !notionProjectId) {
    const project = await ctx.db.project.findUnique({
      where: { id: input.projectId },
      select: { notionProjectId: true },
    });
    notionProjectId = project?.notionProjectId ?? undefined;
  }

  const engine = WorkflowExecutorFactory.create(workflow, {
    userId: ctx.session.user.id,
    db: ctx.db,
  });

  let result;

  switch (syncDirection) {
    case 'pull': {
      const pullConfig = WorkflowExecutorFactory.buildPullConfig(
        workflow,
        {
          projectId: input.projectId,
          notionProjectId,
          deletionBehavior: config.deletionHandling,
        },
        ctx.session.user.id
      );
      result = await engine.pull(pullConfig);
      break;
    }

    case 'push': {
      const pushConfig = WorkflowExecutorFactory.buildPushConfig(
        workflow,
        {
          projectId: input.projectId,
          notionProjectId,
          actionIds: input.actionIds,
          overwriteMode: input.overwriteMode,
        },
        ctx.session.user.id
      );
      result = await engine.push(pushConfig);
      break;
    }

    case 'bidirectional': {
      const biConfig = WorkflowExecutorFactory.buildBiSyncConfig(
        workflow,
        {
          projectId: input.projectId,
          notionProjectId,
          conflictResolution: 'local_wins',
          deletionBehavior: config.deletionHandling,
        },
        ctx.session.user.id
      );
      result = await engine.bidirectional(biConfig);
      break;
    }

    default:
      throw new Error(`Unknown sync direction: ${syncDirection}`);
  }

  // Update the run record with results
  await ctx.db.workflowRun.update({
    where: { id: runId },
    data: {
      status: result.success ? 'SUCCESS' : 'FAILED',
      completedAt: new Date(),
      itemsProcessed: result.itemsProcessed,
      itemsCreated: result.itemsCreated,
      itemsUpdated: result.itemsUpdated,
      itemsSkipped: result.itemsSkipped,
      metadata: {
        syncDirection,
        itemsDeleted: result.itemsDeleted,
        conflicts: result.conflicts.length,
        errors: result.errors.map(e => e.message),
        useNewSyncEngine: true,
      },
    },
  });

  // Update workflow last run time
  await ctx.db.workflow.update({
    where: { id: workflow.id },
    data: { lastRunAt: new Date() },
  });

  return {
    success: result.success,
    runId,
    itemsProcessed: result.itemsProcessed,
    itemsCreated: result.itemsCreated,
    itemsUpdated: result.itemsUpdated,
    itemsSkipped: result.itemsSkipped,
    itemsDeleted: result.itemsDeleted,
    conflicts: result.conflicts,
    errors: result.errors,
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
      projectId: z.string().optional(), // Optional project context for filtering
      overwriteMode: z.boolean().optional(), // For "Exponential is source of truth" mode
      actionIds: z.array(z.string()).optional(), // Optional specific action IDs to sync
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
        // Check for new sync engine feature flag
        const workflowConfig = workflow.config as WorkflowConfig;
        if (workflowConfig.useNewSyncEngine && workflow.provider === 'notion') {
          // Use new provider-agnostic sync engine
          const typedWorkflow: WorkflowWithCredentials = {
            id: workflow.id,
            name: workflow.name,
            provider: workflow.provider,
            syncDirection: workflow.syncDirection,
            config: workflow.config,
            integration: workflow.integration,
          };

          return await runNewSyncEngine(ctx, typedWorkflow, run.id, {
            projectId: input.projectId,
            overwriteMode: input.overwriteMode,
            actionIds: input.actionIds,
          });
        }

        // Legacy sync implementation (existing code)
        // Execute the workflow based on type
        // Only treat as pull if syncDirection is pull AND no overwriteMode is specified
        if (workflow.provider === 'notion' && workflow.syncDirection === 'pull' && !input.overwriteMode) {
          // Use the helper function with project context
          const result = await runNotionPullSync(
            ctx, 
            workflow, 
            run.id, 
            'mark_deleted', // Default deletion behavior
            input.projectId // Pass the project context from input
          );
          
          // Update workflow last run time
          await ctx.db.workflow.update({
            where: { id: workflow.id },
            data: { lastRunAt: new Date() },
          });

          return {
            success: true,
            runId: run.id,
            itemsProcessed: result.itemsProcessed,
            itemsCreated: result.itemsCreated,
            itemsUpdated: result.itemsUpdated,
            itemsSkipped: result.itemsSkipped,
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

          // First, find projects that are configured to use Monday.com
          const mondayProjects = await ctx.db.project.findMany({
            where: {
              createdById: ctx.session.user.id,
              taskManagementTool: 'monday',
            },
            select: { id: true }
          });

          const mondayProjectIds = mondayProjects.map(p => p.id);

          // If specific action IDs are provided, filter by them
          if (input.actionIds && input.actionIds.length > 0) {
            actionsQuery.id = { in: input.actionIds };
          } else {
            // If source is specified, filter accordingly (only when not using specific IDs)
            if (config.source === 'fireflies') {
              actionsQuery.transcriptionSessionId = { not: null };
            } else if (config.source === 'internal') {
              actionsQuery.transcriptionSessionId = null;
            }
            // If source is 'all' or not specified, include all actions
            

            // Only search for actions from projects that are configured for Monday.com
            if (mondayProjectIds.length > 0) {
              actionsQuery.projectId = { in: mondayProjectIds };
            } else {
              // No projects configured for Monday.com, so no actions to sync
              actionsQuery.projectId = 'no-monday-projects';
            }
          }


          // Debug: Check all actions for this project regardless of source
          // const allProjectActions = await ctx.db.action.findMany({
          //   where: {
          //     createdById: ctx.session.user.id,
          //     status: 'ACTIVE',
          //     projectId: { in: mondayProjectIds }
          //   },
          //   include: {
          //     project: true,
          //     transcriptionSession: true,
          //   },
          // });

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


          // Since we already filtered by Monday-configured projects in the query, 
          // all returned actions should be Monday-compatible
          const mondayCompatibleActions = actions;

          let itemsCreated = 0;
          let itemsSkipped = 0;
          let itemsAlreadySynced = 0;
          let itemsFailedToSync = 0;
          const skippedReasons: string[] = [];

          for (const action of mondayCompatibleActions) {
            try {
              // Check if this action has already been synced to Monday.com
              const existingSync = await ctx.db.actionSync.findFirst({
                where: {
                  actionId: action.id,
                  provider: 'monday',
                },
              });


              if (existingSync) {
                if (existingSync.status === 'synced') {
                    itemsAlreadySynced++;
                  itemsSkipped++;
                  skippedReasons.push(`"${action.name}" - Already synced to Monday.com`);
                  continue;
                } else if (existingSync.status === 'failed') {
                    // Allow the sync to proceed for failed items
                }
              }

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

              // Create ActionSync record to track this sync
              await ctx.db.actionSync.create({
                data: {
                  actionId: action.id,
                  provider: 'monday',
                  externalId: createdItem.id,
                  status: 'synced',
                },
              });

              itemsCreated++;


            } catch (error) {
              console.error(`Failed to create Monday.com item for action ${action.id}:`, error);
              
              itemsFailedToSync++;
              itemsSkipped++;
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              skippedReasons.push(`"${action.name}" - Failed: ${errorMessage}`);
              
              // Create ActionSync record with failed status
              try {
                await ctx.db.actionSync.create({
                  data: {
                    actionId: action.id,
                    provider: 'monday',
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
            where: { id: run.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              itemsProcessed: mondayCompatibleActions.length,
              itemsCreated,
              itemsUpdated: 0,
              itemsSkipped,
              metadata: {
                itemsProcessed: mondayCompatibleActions.length,
                itemsCreated: itemsCreated,
                itemsSkipped: itemsSkipped,
                itemsAlreadySynced,
                itemsFailedToSync,
                skippedReasons,
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
            itemsAlreadySynced,
            itemsFailedToSync,
            skippedReasons,
          };
        } else if (workflow.provider === 'notion' && workflow.syncDirection === 'push') {
          // Notion workflow - push actions to Notion database using robust implementation
          const result = await runNotionPushSync(
            ctx, 
            workflow, 
            run.id, 
            input.overwriteMode || false,
            input.projectId,
            input.actionIds
          );
          
          // Update workflow last run time
          await ctx.db.workflow.update({
            where: { id: workflow.id },
            data: { lastRunAt: new Date() },
          });

          return {
            success: true,
            runId: run.id,
            itemsProcessed: result.itemsProcessed,
            itemsCreated: result.itemsCreated,
            itemsUpdated: result.itemsUpdated,
            itemsSkipped: result.itemsSkipped,
            itemsAlreadySynced: result.itemsAlreadySynced,
            itemsFailedToSync: result.itemsFailedToSync,
            skippedReasons: result.skippedReasons,
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
      actionIds: z.array(z.string()).optional(), // Optional specific action IDs to sync
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

      // Get available workflows with integration credentials
      const workflows = await ctx.db.workflow.findMany({
        where: {
          userId: ctx.session.user.id,
          provider: project.taskManagementTool,
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

      let pullResults = null;
      let pushResults = null;

      // Step 1: Pull sync (if strategy requires it)
      if (syncStrategy === 'notion_canonical' || syncStrategy === 'auto_pull_then_push') {
        // For pull, we can use any active workflow since we're explicitly pulling
        const pullWorkflow = workflows[0]; // Use the first active workflow

        if (pullWorkflow) {
          // Verify the workflow has an integration with credentials
          if (!pullWorkflow.integration) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Workflow is not linked to a Notion integration. Please reconfigure the workflow on the Notion Integration page.',
            });
          }

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
              pullResults = await runNotionPullSync(ctx, pullWorkflow, pullRunResult.id, config.deletionBehavior, input.projectId);
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
        // Verify the workflow has an integration with credentials
        if (!pushWorkflow.integration) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Workflow is not linked to a Notion integration. Please reconfigure the workflow on the Notion Integration page.',
          });
        }

        const pushRunResult = await ctx.db.workflowRun.create({
          data: {
            workflowId: pushWorkflow.id,
            status: 'RUNNING',
          },
        });

        try {
          // Call the existing push sync logic from the run method
          if (project.taskManagementTool === 'notion') {
            pushResults = await runNotionPushSync(ctx, pushWorkflow, pushRunResult.id, false, input.projectId, input.actionIds);
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

  // Get Notion workspace users for DRI mapping
  getNotionUsers: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get integration with credentials
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
          provider: 'notion',
        },
        include: {
          credentials: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notion integration not found',
        });
      }

      const accessToken = integration.credentials.find(
        (c) => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY'
      )?.key;

      if (!accessToken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No access token found for Notion integration',
        });
      }

      try {
        const notionService = new NotionService(accessToken);
        return await notionService.getWorkspaceUsers();
      } catch (error) {
        console.error('Failed to fetch Notion users:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch Notion workspace users',
        });
      }
    }),

  // Get local users for mapping dropdown
  getLocalUsers: protectedProcedure
    .query(async ({ ctx }) => {
      const users = await ctx.db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      return users;
    }),

  // Get existing user mappings for an integration
  getUserMappings: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const mappings = await ctx.db.integrationUserMapping.findMany({
        where: {
          integrationId: input.integrationId,
          integration: {
            userId: ctx.session.user.id,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      return mappings;
    }),

  // Save user mappings for an integration
  saveUserMappings: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      mappings: z.array(z.object({
        externalUserId: z.string(),
        externalUserName: z.string().optional(),
        userId: z.string().nullable(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user owns the integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found',
        });
      }

      // Process each mapping
      for (const mapping of input.mappings) {
        if (mapping.userId) {
          // Upsert the mapping
          await ctx.db.integrationUserMapping.upsert({
            where: {
              integrationId_externalUserId: {
                integrationId: input.integrationId,
                externalUserId: mapping.externalUserId,
              },
            },
            update: {
              userId: mapping.userId,
            },
            create: {
              integrationId: input.integrationId,
              externalUserId: mapping.externalUserId,
              userId: mapping.userId,
            },
          });
        } else {
          // Remove the mapping if userId is null
          await ctx.db.integrationUserMapping.deleteMany({
            where: {
              integrationId: input.integrationId,
              externalUserId: mapping.externalUserId,
            },
          });
        }
      }

      return { success: true };
    }),

  // Get Notion projects that don't have a local project linked
  getUnlinkedNotionProjects: protectedProcedure
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
        return { unlinkedProjects: [], totalNotionProjects: 0, linkedCount: 0 };
      }

      // Get access token
      const accessToken = workflow.integration.credentials.find(
        (c: { keyType: string }) => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY'
      )?.key;

      if (!accessToken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No access token found for Notion integration',
        });
      }

      try {
        // Fetch all Notion projects
        const notionService = new NotionService(accessToken);
        const notionProjects = await notionService.getProjectsFromDatabase(config.projectsDatabaseId);

        // Get all local projects that are linked to Notion
        const linkedProjects = await ctx.db.project.findMany({
          where: {
            createdById: ctx.session.user.id,
            notionProjectId: { not: null },
          },
          select: {
            notionProjectId: true,
          },
        });

        const linkedNotionIds = new Set(linkedProjects.map(p => p.notionProjectId));

        // Helper to extract status from Notion page properties
        const getNotionStatus = (properties: Record<string, any>): string | null => {
          // eslint-disable-next-line @typescript-eslint/dot-notation
          const statusProperty = properties['Status'];
          if (!statusProperty) return null;

          // Handle native Notion status type
          if (statusProperty.status?.name) {
            return statusProperty.status.name;
          }
          // Handle select type status
          if (statusProperty.select?.name) {
            return statusProperty.select.name;
          }
          return null;
        };

        // Status values to include in suggestions
        const allowedStatuses = ['Not started', 'In Progress', 'In progress', 'Active', 'Todo', 'To-do'];

        // Filter to only unlinked Notion projects with allowed status
        const unlinkedProjects = notionProjects.filter(np => {
          // Must not be already linked
          if (linkedNotionIds.has(np.id)) return false;

          // Check status - if no status property, include by default
          const status = getNotionStatus(np.properties);
          if (!status) return true; // No status field = include it

          return allowedStatuses.some(allowed =>
            status.toLowerCase() === allowed.toLowerCase()
          );
        });

        return {
          unlinkedProjects: unlinkedProjects.map(p => ({
            notionId: p.id,
            title: p.title,
            url: p.url,
          })),
          totalNotionProjects: notionProjects.length,
          linkedCount: linkedProjects.length,
        };
      } catch (error) {
        console.error('Failed to fetch unlinked Notion projects:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch Notion projects',
        });
      }
    }),
});