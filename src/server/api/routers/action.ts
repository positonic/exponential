import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PRIORITY_VALUES } from "~/types/priority";

export const actionRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.object({
      assigneeId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
    console.log("in getAll")
    const whereClause: any = {
      createdById: ctx.session.user.id,
      status: {
        not: "DELETED",
      },
    };

    // Add assignee filtering if specified
    if (input?.assigneeId) {
      whereClause.assignees = {
        some: {
          userId: input.assigneeId,
        },
      };
    }

    return ctx.db.action.findMany({
      where: whereClause,
      include: {
        project: true,
        syncs: true, // Include ActionSync records to show sync status
        assignees: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
      orderBy: {
        project: {
          priority: "asc",
        },
      },
    });
  }),

  getProjectActions: protectedProcedure
    .input(z.object({ 
      projectId: z.string(),
      assigneeId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const whereClause: any = {
        // createdById: ctx.session.user.id,
        projectId: input.projectId,
        status: {
          not: "DELETED",
        },
      };

      // Add assignee filtering if specified
      if (input.assigneeId) {
        whereClause.assignees = {
          some: {
            userId: input.assigneeId,
          },
        };
      }

      return ctx.db.action.findMany({
        where: whereClause,
        include: {
          project: true,
          syncs: true, // Include ActionSync records to show sync status
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
        orderBy: [
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  // Get actions for Kanban board with comprehensive filtering
  getKanbanActions: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      assigneeId: z.string().optional(),
      kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const whereClause: any = {
        createdById: ctx.session.user.id,
        status: {
          not: "DELETED",
        },
        // Only include actions that have a kanbanStatus (project-associated actions)
        kanbanStatus: {
          not: null,
        },
      };

      // Add project filtering if specified
      if (input?.projectId) {
        whereClause.projectId = input.projectId;
      }

      // Add assignee filtering if specified
      if (input?.assigneeId) {
        whereClause.assignees = {
          some: {
            userId: input.assigneeId,
          },
        };
      }

      // Add kanban status filtering if specified
      if (input?.kanbanStatus) {
        whereClause.kanbanStatus = input.kanbanStatus;
      }

      return ctx.db.action.findMany({
        where: whereClause,
        include: {
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
        orderBy: [
          { kanbanStatus: "asc" }, // Order by kanban status first
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        projectId: z.string().optional(),
        dueDate: z.date().optional(),
        priority: z.enum(PRIORITY_VALUES).default("Quick"),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "DELETED"]).default("ACTIVE"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user exists before creating action
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id }
      });
      
      if (!user) {
        throw new Error(`User not found: ${ctx.session.user.id}. Please ensure your account is properly set up.`);
      }
      
      // Set default kanban status for project tasks
      const actionData: any = {
        ...input,
        createdById: ctx.session.user.id,
      };

      // If this action is being created for a project, set default kanban status to TODO
      if (input.projectId) {
        // Get the current highest order across all statuses in this project
        const maxOrderAcrossBoard = await ctx.db.action.findFirst({
          where: {
            projectId: input.projectId,
            kanbanOrder: { not: null }
          },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true }
        });

        // Get the current highest order in the TODO column specifically
        const maxOrderInTodo = await ctx.db.action.findFirst({
          where: {
            projectId: input.projectId,
            kanbanStatus: "TODO",
            kanbanOrder: { not: null }
          },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true }
        });

        // Calculate next order position
        let nextOrder: number;
        
        if (maxOrderInTodo?.kanbanOrder) {
          // If there are existing tasks in TODO column, add after the last one
          nextOrder = maxOrderInTodo.kanbanOrder + 1;
        } else if (maxOrderAcrossBoard?.kanbanOrder) {
          // If TODO column is empty but board has other tasks, 
          // place at the end of the board order
          nextOrder = maxOrderAcrossBoard.kanbanOrder + 1;
        } else {
          // First task in the entire project
          nextOrder = 1;
        }

        actionData.kanbanStatus = "TODO";
        actionData.kanbanOrder = nextOrder;
      }

      return ctx.db.action.create({
        data: actionData,
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: { select: { id: true, name: true } },
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        projectId: z.string().optional(),
        dueDate: z.date().optional(),
        priority: z.enum(PRIORITY_VALUES).optional(),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "DELETED"]).optional(),
        kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      
      // Check if action is being marked as completed
      const isCompleting = updateData.status === "COMPLETED" || updateData.kanbanStatus === "DONE";
      const isUncompleting = updateData.status === "ACTIVE" || (updateData.kanbanStatus && updateData.kanbanStatus !== "DONE");
      
      // Get current action to check previous state
      const currentAction = await ctx.db.action.findUnique({
        where: { id },
        select: { status: true, kanbanStatus: true, completedAt: true }
      });
      
      const wasCompleted = currentAction?.status === "COMPLETED" || currentAction?.kanbanStatus === "DONE";
      
      // Set completedAt timestamp when completing, clear when uncompleting
      const finalUpdateData = {
        ...updateData,
        ...(isCompleting && !wasCompleted && { completedAt: new Date() }),
        ...(isUncompleting && wasCompleted && { completedAt: null }),
      };
      
      return ctx.db.action.update({
        where: { id },
        data: finalUpdateData,
      });
    }),

  // Update kanban status (for drag-and-drop)
  updateKanbanStatus: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the action exists and user has permission to modify it
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        select: { 
          id: true, 
          createdById: true, 
          kanbanStatus: true,
          completedAt: true 
        }
      });

      if (!action) {
        throw new Error("Action not found");
      }

      if (action.createdById !== ctx.session.user.id) {
        throw new Error("You don't have permission to modify this action");
      }

      // Check if action is being completed or uncompleted
      const isCompleting = input.kanbanStatus === "DONE";
      const isUncompleting = input.kanbanStatus !== "DONE";
      const wasCompleted = action.kanbanStatus === "DONE";

      // Prepare update data with completion timestamp
      const updateData = {
        kanbanStatus: input.kanbanStatus,
        ...(isCompleting && !wasCompleted && { completedAt: new Date() }),
        ...(isUncompleting && wasCompleted && { completedAt: null }),
      };

      // Update the kanban status
      return ctx.db.action.update({
        where: { id: input.actionId },
        data: updateData,
        include: {
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      });
    }),

  getToday: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return ctx.db.action.findMany({
      where: {
        createdById: ctx.session.user.id,
        dueDate: {
          gte: today,
          lt: tomorrow,
        },
        status: "ACTIVE",
      },
      include: {
        project: true,
        syncs: true, // Include ActionSync records to show sync status
        assignees: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
      orderBy: {
        project: {
          priority: "desc",
        },
      },
    });
  }),

  updateActionsProject: protectedProcedure
    .input(
      z.object({
        transcriptionSessionId: z.string(),
        projectId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log('🔄 updateActionsProject called with:', {
        transcriptionSessionId: input.transcriptionSessionId,
        projectId: input.projectId,
        userId: ctx.session.user.id
      });

      // First, let's check what actions exist for this transcription session
      let existingActions;
      try {
        existingActions = await ctx.db.action.findMany({
          where: {
            transcriptionSessionId: input.transcriptionSessionId,
            createdById: ctx.session.user.id,
          },
          select: {
            id: true,
            name: true,
            projectId: true,
            transcriptionSessionId: true,
          },
        });

        console.log('📋 Found existing actions for this transcription:', {
          count: existingActions.length,
          actions: existingActions.map((a: any) => ({
            id: a.id,
            name: a.name,
            currentProjectId: a.projectId,
            transcriptionSessionId: a.transcriptionSessionId
          }))
        });
      } catch (error) {
        console.error('❌ Error finding actions:', error);
        throw new Error(`Failed to find actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Update all actions associated with this transcription session
      let result;
      try {
        result = await ctx.db.action.updateMany({
          where: {
            transcriptionSessionId: input.transcriptionSessionId,
            createdById: ctx.session.user.id, // Ensure user can only update their own actions
          },
          data: {
            projectId: input.projectId,
          },
        });

        console.log('✅ Update result:', {
          count: result.count,
          message: `Updated ${result.count} action${result.count === 1 ? '' : 's'}`,
          existingActionsFound: existingActions.length
        });
      } catch (error) {
        console.error('❌ Error updating actions:', error);
        throw new Error(`Failed to update actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return {
        count: result.count,
        message: `Updated ${result.count} action${result.count === 1 ? '' : 's'}`,
      };
    }),

  // Debug endpoint to check action-transcription relationships
  debugTranscriptionActions: protectedProcedure
    .input(z.object({ transcriptionSessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const actions = await ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          transcriptionSessionId: true,
        },
        orderBy: {
          id: 'desc'
        }
      });

      const transcriptionSession = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionSessionId },
        select: {
          id: true,
          sessionId: true,
          title: true,
        }
      });

      return {
        transcriptionSession,
        allUserActions: actions,
        actionsForThisTranscription: actions.filter((a: any) => a.transcriptionSessionId === input.transcriptionSessionId),
        totalActions: actions.length,
      };
    }),

  // Link existing actions to a transcription session
  linkActionsToTranscription: protectedProcedure
    .input(z.object({ 
      actionIds: z.array(z.string()),
      transcriptionSessionId: z.string() 
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.action.updateMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns the actions
        },
        data: {
          transcriptionSessionId: input.transcriptionSessionId,
        },
      });

      return {
        count: result.count,
        message: `Linked ${result.count} action${result.count === 1 ? '' : 's'} to transcription`,
      };
    }),

  // Bulk delete actions
  bulkDelete: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.action.deleteMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns the actions
        },
      });

      return {
        count: result.count,
        message: `Deleted ${result.count} action${result.count === 1 ? '' : 's'}`,
      };
    }),

  // Assign users to an action
  assign: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the action exists and user has permission to modify it
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: { 
          project: {
            include: {
              projectMembers: {
                select: { userId: true }
              },
              team: {
                include: {
                  members: {
                    select: { userId: true }
                  }
                }
              }
            }
          },
          team: {
            include: {
              members: {
                select: { userId: true }
              }
            }
          }
        },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      if (action.createdById !== ctx.session.user.id) {
        throw new Error("You don't have permission to modify this action");
      }

      // Validate that all users can be assigned to this action
      for (const userId of input.userIds) {
        let canAssign = false;
        
        // Check if action has a project - users must be project members or team members
        if (action.projectId && action.project) {
          // Check if user is a project member
          const isProjectMember = action.project.projectMembers.some((member: any) => member.userId === userId);
          
          // Check if user is a team member (if project has a team)
          const isTeamMember = action.project.team?.members.some((member: any) => member.userId === userId);
          
          canAssign = isProjectMember || isTeamMember || false;
        }
        // Check if action has a team (but no project) - users must be team members
        else if (action.teamId && action.team) {
          const isTeamMember = action.team.members.some((member: any) => member.userId === userId);
          canAssign = isTeamMember;
        }
        // If action has neither project nor team, allow assignment to any user
        else {
          canAssign = true;
        }

        if (!canAssign) {
          // Get user info for better error message
          const user = await ctx.db.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true }
          });
          const userName = user?.name || user?.email || userId;
          
          throw new Error(`User ${userName} cannot be assigned to this action. They must be a member of the ${action.projectId ? 'project' : 'team'}.`);
        }
      }

      // Create assignments for each user (using createMany with skipDuplicates)
      await ctx.db.actionAssignee.createMany({
        data: input.userIds.map(userId => ({
          actionId: input.actionId,
          userId,
        })),
        skipDuplicates: true,
      });

      // Return updated action with assignees
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: true,
        },
      });
    }),

  // Unassign users from an action
  unassign: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the action exists and user has permission to modify it
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      if (action.createdById !== ctx.session.user.id) {
        throw new Error("You don't have permission to modify this action");
      }

      // Remove assignments
      await ctx.db.actionAssignee.deleteMany({
        where: {
          actionId: input.actionId,
          userId: { in: input.userIds },
        },
      });

      // Return updated action with assignees
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: true,
        },
      });
    }),

  // Bulk assign users to multiple actions
  bulkAssign: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify all actions exist and user has permission to modify them
      const actions = await ctx.db.action.findMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns all actions
        },
        include: { 
          project: {
            include: {
              projectMembers: {
                select: { userId: true }
              },
              team: {
                include: {
                  members: {
                    select: { userId: true }
                  }
                }
              }
            }
          },
          team: {
            include: {
              members: {
                select: { userId: true }
              }
            }
          }
        },
      });

      if (actions.length !== input.actionIds.length) {
        throw new Error("Some actions not found or you don't have permission to modify them");
      }

      // Validate assignments for each action-user combination
      for (const action of actions) {
        for (const userId of input.userIds) {
          let canAssign = false;
          
          // Check if action has a project - users must be project members or team members
          if (action.projectId && action.project) {
            // Check if user is a project member
            const isProjectMember = action.project.projectMembers.some((member: any) => member.userId === userId);
            
            // Check if user is a team member (if project has a team)
            const isTeamMember = action.project.team?.members.some((member: any) => member.userId === userId);
            
            canAssign = isProjectMember || isTeamMember || false;
          }
          // Check if action has a team (but no project) - users must be team members
          else if (action.teamId && action.team) {
            const isTeamMember = action.team.members.some((member: any) => member.userId === userId);
            canAssign = isTeamMember;
          }
          // If action has neither project nor team, allow assignment to any user
          else {
            canAssign = true;
          }

          if (!canAssign) {
            // Get user info for better error message
            const user = await ctx.db.user.findUnique({
              where: { id: userId },
              select: { name: true, email: true }
            });
            const userName = user?.name || user?.email || userId;
            
            throw new Error(`User ${userName} cannot be assigned to action "${action.name}". They must be a member of the ${action.projectId ? 'project' : 'team'}.`);
          }
        }
      }

      // Create all assignments
      const assignments = input.actionIds.flatMap(actionId =>
        input.userIds.map(userId => ({ actionId, userId }))
      );

      await ctx.db.actionAssignee.createMany({
        data: assignments,
        skipDuplicates: true,
      });

      return {
        count: assignments.length,
        message: `Assigned ${input.userIds.length} user${input.userIds.length === 1 ? '' : 's'} to ${input.actionIds.length} action${input.actionIds.length === 1 ? '' : 's'}`,
      };
    }),

  // Get users available for assignment to a specific action
  getAssignableUsers: protectedProcedure
    .input(z.object({
      actionId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get the action with its project/team context
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: { 
          project: {
            include: {
              projectMembers: {
                include: {
                  user: { select: { id: true, name: true, email: true, image: true } }
                }
              },
              team: {
                include: {
                  members: {
                    include: {
                      user: { select: { id: true, name: true, email: true, image: true } }
                    }
                  }
                }
              }
            }
          },
          team: {
            include: {
              members: {
                include: {
                  user: { select: { id: true, name: true, email: true, image: true } }
                }
              }
            }
          }
        },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      if (action.createdById !== ctx.session.user.id) {
        throw new Error("You don't have permission to view assignable users for this action");
      }

      let assignableUsers: Array<{ id: string; name: string | null; email: string | null; image: string | null }> = [];

      // If action has a project, get project members and team members
      if (action.projectId && action.project) {
        // Add project members
        assignableUsers = action.project.projectMembers.map((member: any) => member.user);
        
        // Add team members if project has a team
        if (action.project.team) {
          const teamUsers = action.project.team.members.map((member: any) => member.user);
          // Merge and deduplicate by user ID
          const userMap = new Map();
          [...assignableUsers, ...teamUsers].forEach(user => userMap.set(user.id, user));
          assignableUsers = Array.from(userMap.values());
        }
      }
      // If action has a team (but no project), get team members
      else if (action.teamId && action.team) {
        assignableUsers = action.team.members.map((member: any) => member.user);
      }
      // If action has neither project nor team, get all users (or limit to action creator for now)
      else {
        assignableUsers = [
          {
            id: ctx.session.user.id,
            name: ctx.session.user.name ?? null,
            email: ctx.session.user.email ?? null,
            image: ctx.session.user.image ?? null,
          }
        ];
      }

      return {
        assignableUsers,
        actionContext: {
          hasProject: !!action.projectId,
          hasTeam: !!action.teamId,
          projectName: action.project?.name,
          teamName: action.project?.team?.name || action.team?.name,
        }
      };
    }),

  updateKanbanStatusWithOrder: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]),
      targetPosition: z.number().optional(),
      droppedOnTaskId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { actionId, kanbanStatus, targetPosition, droppedOnTaskId } = input;

      // Get the action being moved
      const action = await ctx.db.action.findUnique({
        where: { id: actionId },
        include: { project: true }
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Ensure user has permission to update this action
      if (action.createdById !== ctx.session.user.id && action.assignedToId !== ctx.session.user.id) {
        // Check if user is assigned to this action
        const assignment = await ctx.db.actionAssignee.findFirst({
          where: {
            actionId,
            userId: ctx.session.user.id,
          },
        });

        if (!assignment && action.project) {
          // Check if user is a project member
          const projectMember = await ctx.db.projectMember.findFirst({
            where: {
              projectId: action.projectId!,
              userId: ctx.session.user.id,
            },
          });

          if (!projectMember) {
            throw new Error("Not authorized to update this action");
          }
        }
      }

      let newOrder: number;

      if (droppedOnTaskId) {
        // Get the target task details
        const targetTask = await ctx.db.action.findUnique({
          where: { id: droppedOnTaskId },
          select: { kanbanOrder: true, kanbanStatus: true }
        });

        if (!targetTask) {
          throw new Error("Target task not found");
        }

        // Get the target task's order
        const targetOrder = targetTask.kanbanOrder ?? 1;

        // Find all tasks in the same column that need to be shifted down
        const tasksToShift = await ctx.db.action.findMany({
          where: {
            projectId: action.projectId,
            kanbanStatus,
            kanbanOrder: { gte: targetOrder },
            id: { not: actionId } // Don't include the task being moved
          },
          select: { id: true, kanbanOrder: true },
          orderBy: { kanbanOrder: 'asc' }
        });

        // Use a transaction to update all affected tasks
        await ctx.db.$transaction(async (tx: any) => {
          // First, shift all tasks down by 1
          for (const task of tasksToShift) {
            await tx.action.update({
              where: { id: task.id },
              data: { kanbanOrder: (task.kanbanOrder ?? 0) + 1 }
            });
          }
        });

        // Set the moved task to take the target position
        newOrder = targetOrder;
      } else if (targetPosition !== undefined) {
        // Use provided position
        newOrder = targetPosition;
      } else {
        // Get the highest order in this status column
        const maxOrderInColumn = await ctx.db.action.findFirst({
          where: {
            projectId: action.projectId,
            kanbanStatus,
            kanbanOrder: { not: null }
          },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true }
        });

        // Get the highest order across the entire board
        const maxOrderAcrossBoard = await ctx.db.action.findFirst({
          where: {
            projectId: action.projectId,
            kanbanOrder: { not: null }
          },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true }
        });

        if (maxOrderInColumn?.kanbanOrder) {
          // Add to the end of the specific column
          newOrder = maxOrderInColumn.kanbanOrder + 1;
        } else if (maxOrderAcrossBoard?.kanbanOrder) {
          // Column is empty, but board has tasks - place at end of board order
          newOrder = maxOrderAcrossBoard.kanbanOrder + 1;
        } else {
          // First task in the entire project
          newOrder = 1;
        }
      }

      // Update the action
      return ctx.db.action.update({
        where: { id: actionId },
        data: {
          kanbanStatus,
          kanbanOrder: newOrder,
        },
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: { select: { id: true, name: true } },
        },
      });
    }),

  reorderKanbanCard: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      newPosition: z.number(), // 0-based index position
      targetColumnStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { actionId, newPosition, targetColumnStatus } = input;

      // Get the action to verify permissions
      const action = await ctx.db.action.findUnique({
        where: { id: actionId },
        select: { 
          id: true, 
          projectId: true, 
          kanbanStatus: true, 
          kanbanOrder: true,
          createdById: true,
          assignedToId: true,
          project: true
        }
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Ensure user has permission to reorder this action
      if (action.createdById !== ctx.session.user.id && action.assignedToId !== ctx.session.user.id) {
        const assignment = await ctx.db.actionAssignee.findFirst({
          where: {
            actionId,
            userId: ctx.session.user.id,
          },
        });

        if (!assignment && action.project) {
          const projectMember = await ctx.db.projectMember.findFirst({
            where: {
              projectId: action.projectId!,
              userId: ctx.session.user.id,
            },
          });

          if (!projectMember) {
            throw new Error("Not authorized to reorder this action");
          }
        }
      }

      // Get all tasks in the target column, ordered
      const columnTasks = await ctx.db.action.findMany({
        where: {
          projectId: action.projectId,
          kanbanStatus: targetColumnStatus,
          id: { not: actionId } // Exclude the task being moved
        },
        select: { id: true, kanbanOrder: true },
        orderBy: { kanbanOrder: 'asc' }
      });

      // Calculate new order values for all tasks in the column
      return ctx.db.$transaction(async (tx: any) => {
        // Update the moved task first
        await tx.action.update({
          where: { id: actionId },
          data: {
            kanbanStatus: targetColumnStatus,
            kanbanOrder: newPosition + 1 // Convert 0-based to 1-based
          }
        });

        // Reorder all other tasks in the column
        for (let i = 0; i < columnTasks.length; i++) {
          const task = columnTasks[i];
          let newOrder: number;
          
          if (i < newPosition) {
            // Tasks before the insertion point keep their relative position
            newOrder = i + 1;
          } else {
            // Tasks at and after the insertion point are shifted down by 1
            newOrder = i + 2;
          }

          await tx.action.update({
            where: { id: task!.id },
            data: { kanbanOrder: newOrder }
          });
        }

        return { message: "Reordering completed successfully" };
      });
    }),

  // Utility endpoint to initialize kanban orders for existing tasks
  initializeKanbanOrders: protectedProcedure
    .input(z.object({
      projectId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get all actions in this project without kanban orders
      const actionsWithoutOrder = await ctx.db.action.findMany({
        where: {
          projectId: input.projectId,
          kanbanOrder: null,
        },
        orderBy: [
          { kanbanStatus: 'asc' },
          // { createdAt: 'asc' }
        ],
      });

      if (actionsWithoutOrder.length === 0) {
        return { message: 'No actions need order initialization', updated: 0 };
      }

      // Get the current highest order in the project
      const maxOrder = await ctx.db.action.findFirst({
        where: {
          projectId: input.projectId,
          kanbanOrder: { not: null }
        },
        orderBy: { kanbanOrder: 'desc' },
        select: { kanbanOrder: true }
      });

      const startingOrder = maxOrder?.kanbanOrder ? maxOrder.kanbanOrder + 1 : 1;

      // Update each action with a kanban order
      const updates = actionsWithoutOrder.map(async (action: any, index: number) => {
        // Set default kanban status if not set
        const kanbanStatus = action.kanbanStatus || "TODO";
        
        return ctx.db.action.update({
          where: { id: action.id },
          data: {
            kanbanStatus,
            kanbanOrder: startingOrder + index,
          },
        });
      });

      await Promise.all(updates);

      return { 
        message: `Initialized kanban orders for ${actionsWithoutOrder.length} actions`,
        updated: actionsWithoutOrder.length 
      };
    }),

  // Get actions completed today
  getCompletedToday: protectedProcedure
    .query(async ({ ctx }) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          completedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
      });
    }),

  // Get recent completed actions with date range
  getRecentCompleted: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(7), // Default to last 7 days, max 90
    }))
    .query(async ({ ctx, input }) => {
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);
      startDate.setHours(0, 0, 0, 0);

      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          completedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
      });
    }),
}); 