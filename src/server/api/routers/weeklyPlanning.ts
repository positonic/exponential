import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Helper function to get start of week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday = 0
  return new Date(d.setDate(diff));
}

export const weeklyPlanningRouter = createTRPCRouter({
  
  // Get team weekly view (member-centric)
  getTeamWeeklyView: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      weekStartDate: z.date()
    }))
    .query(async ({ ctx, input }) => {
      const { projectId, weekStartDate } = input;
      const weekStart = getWeekStart(weekStartDate);
      
      // Verify user has access to this project
      const project = await ctx.db.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { createdById: ctx.session.user.id },
            { 
              team: {
                members: {
                  some: { userId: ctx.session.user.id }
                }
              }
            }
          ]
        },
        include: {
          team: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      image: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!project || !project.team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project or team not found"
        });
      }

      // Get team members with their weekly data
      const teamMembers = await Promise.all(
        project.team.members.map(async (member) => {
          // Get member's weekly outcomes
          const weeklyOutcomes = await ctx.db.weeklyOutcome.findMany({
            where: {
              projectId,
              weekStartDate: weekStart,
              assignees: {
                some: { userId: member.userId }
              }
            },
            include: {
              assignees: {
                include: {
                  user: {
                    select: { id: true, name: true, image: true }
                  }
                }
              }
            }
          });

          // Get member's actions for this week
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          
          const actions = await ctx.db.action.findMany({
            where: {
              projectId,
              assignees: {
                some: { userId: member.userId }
              },
              AND: [
                {
                  OR: [
                    {
                      dueDate: {
                        gte: weekStart,
                        lte: weekEnd
                      }
                    },
                    {
                      dueDate: null,
                      status: { in: ["ACTIVE", "IN_PROGRESS"] }
                    }
                  ]
                }
              ]
            },
            select: {
              id: true,
              name: true,
              status: true,
              priority: true,
              dueDate: true
            }
          });

          // Get member's capacity for this week
          const capacity = await ctx.db.teamMemberWeeklyCapacity.findFirst({
            where: {
              userId: member.userId,
              teamId: project.teamId!,
              projectId,
              weekStartDate: weekStart
            }
          });

          // Calculate progress
          const completedActions = actions.filter(a => a.status === "DONE").length;
          const progress = {
            completed: completedActions,
            total: actions.length,
            percentage: actions.length > 0 ? Math.round((completedActions / actions.length) * 100) : 0
          };

          return {
            user: member.user,
            role: member.role,
            capacity: capacity?.availableHours ?? 40,
            weeklyOutcomes,
            actions,
            progress
          };
        })
      );

      return { teamMembers };
    }),

  // Get weekly outcomes (outcome-centric)
  getWeeklyOutcomes: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      weekStartDate: z.date()
    }))
    .query(async ({ ctx, input }) => {
      const { projectId, weekStartDate } = input;
      const weekStart = getWeekStart(weekStartDate);
      
      // Verify user has access to this project
      const project = await ctx.db.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { createdById: ctx.session.user.id },
            { 
              team: {
                members: {
                  some: { userId: ctx.session.user.id }
                }
              }
            }
          ]
        }
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found or access denied"
        });
      }

      const outcomes = await ctx.db.weeklyOutcome.findMany({
        where: {
          projectId,
          weekStartDate: weekStart
        },
        include: {
          assignees: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          relatedActions: {
            select: {
              id: true,
              name: true,
              status: true,
              priority: true
            }
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      // Calculate progress for each outcome
      const outcomesWithProgress = outcomes.map(outcome => {
        const completedActions = outcome.relatedActions.filter(a => a.status === "DONE").length;
        const totalActions = outcome.relatedActions.length;
        const progress = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

        return {
          ...outcome,
          assignees: outcome.assignees.map(a => a.user),
          progress
        };
      });

      return { outcomes: outcomesWithProgress };
    }),

  // Get team members for assignment dropdowns
  getTeamMembers: protectedProcedure
    .input(z.object({
      teamId: z.string()
    }))
    .query(async ({ ctx, input }) => {
      // Verify user is part of the team
      const teamMembership = await ctx.db.teamUser.findFirst({
        where: {
          userId: ctx.session.user.id,
          teamId: input.teamId
        }
      });

      if (!teamMembership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not a member of this team"
        });
      }

      const members = await ctx.db.teamUser.findMany({
        where: {
          teamId: input.teamId
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      });

      return { 
        members: members.map(m => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          role: m.role
        }))
      };
    }),

  // Get team capacity for a week
  getTeamCapacity: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      projectId: z.string().optional(),
      weekStartDate: z.date()
    }))
    .query(async ({ ctx, input }) => {
      const { teamId, projectId, weekStartDate } = input;
      const weekStart = getWeekStart(weekStartDate);
      
      // Verify user is part of the team
      const teamMembership = await ctx.db.teamUser.findFirst({
        where: {
          userId: ctx.session.user.id,
          teamId
        }
      });

      if (!teamMembership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not a member of this team"
        });
      }

      const capacities = await ctx.db.teamMemberWeeklyCapacity.findMany({
        where: {
          teamId,
          weekStartDate: weekStart,
          ...(projectId && { projectId })
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return { capacities };
    }),

  // Create weekly outcome
  createWeeklyOutcome: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      teamId: z.string(),
      projectId: z.string(),
      weekStartDate: z.date(),
      priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
      assigneeIds: z.array(z.string()).default([]),
      dueDate: z.date().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { assigneeIds, ...outcomeData } = input;
      const weekStart = getWeekStart(input.weekStartDate);
      
      // Verify user can create outcomes for this team
      const teamMembership = await ctx.db.teamUser.findFirst({
        where: {
          userId: ctx.session.user.id,
          teamId: input.teamId
        }
      });

      if (!teamMembership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to create outcomes for this team"
        });
      }

      // Create the weekly outcome
      const outcome = await ctx.db.weeklyOutcome.create({
        data: {
          ...outcomeData,
          weekStartDate: weekStart,
          createdById: ctx.session.user.id,
          assignees: {
            create: assigneeIds.map(userId => ({ userId }))
          }
        },
        include: {
          assignees: {
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true }
              }
            }
          }
        }
      });

      return outcome;
    }),

  // Update weekly outcome
  updateWeeklyOutcome: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED"]).optional(),
      priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
      assigneeIds: z.array(z.string()).optional(),
      dueDate: z.date().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, assigneeIds, ...updateData } = input;
      
      // Verify user can update this outcome
      const outcome = await ctx.db.weeklyOutcome.findFirst({
        where: {
          id,
          team: {
            members: {
              some: { userId: ctx.session.user.id }
            }
          }
        }
      });

      if (!outcome) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Weekly outcome not found or access denied"
        });
      }

      // Update the outcome
      const updatedOutcome = await ctx.db.weeklyOutcome.update({
        where: { id },
        data: {
          ...updateData,
          ...(assigneeIds && {
            assignees: {
              deleteMany: {},
              create: assigneeIds.map(userId => ({ userId }))
            }
          })
        },
        include: {
          assignees: {
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true }
              }
            }
          }
        }
      });

      return updatedOutcome;
    }),

  // Set team member capacity
  setMemberCapacity: protectedProcedure
    .input(z.object({
      userId: z.string(),
      teamId: z.string(),
      projectId: z.string().optional(),
      weekStartDate: z.date(),
      availableHours: z.number().min(0).max(168), // Max hours in a week
      notes: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const weekStart = getWeekStart(input.weekStartDate);
      
      // Verify user can set capacity for this team
      const teamMembership = await ctx.db.teamUser.findFirst({
        where: {
          userId: ctx.session.user.id,
          teamId: input.teamId
        }
      });

      if (!teamMembership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to set capacity for this team"
        });
      }

      // Find existing capacity or create new one
      const existingCapacity = await ctx.db.teamMemberWeeklyCapacity.findFirst({
        where: {
          userId: input.userId,
          teamId: input.teamId,
          weekStartDate: weekStart,
          projectId: input.projectId || null
        }
      });

      let capacity;
      if (existingCapacity) {
        capacity = await ctx.db.teamMemberWeeklyCapacity.update({
          where: { id: existingCapacity.id },
          data: {
            availableHours: input.availableHours,
            notes: input.notes
          }
        });
      } else {
        capacity = await ctx.db.teamMemberWeeklyCapacity.create({
          data: {
            userId: input.userId,
            teamId: input.teamId,
            projectId: input.projectId || null,
            weekStartDate: weekStart,
            availableHours: input.availableHours,
            notes: input.notes
          }
        });
      }

      return capacity;
    }),

  // Link action to weekly outcome
  linkActionToWeeklyOutcome: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      weeklyOutcomeId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user has access to both the action and outcome
      const [action, outcome] = await Promise.all([
        ctx.db.action.findFirst({
          where: {
            id: input.actionId,
            OR: [
              { createdById: ctx.session.user.id },
              {
                project: {
                  team: {
                    members: {
                      some: { userId: ctx.session.user.id }
                    }
                  }
                }
              }
            ]
          }
        }),
        ctx.db.weeklyOutcome.findFirst({
          where: {
            id: input.weeklyOutcomeId,
            team: {
              members: {
                some: { userId: ctx.session.user.id }
              }
            }
          }
        })
      ]);

      if (!action || !outcome) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action or outcome not found or access denied"
        });
      }

      // Link the action to the outcome
      await ctx.db.action.update({
        where: { id: input.actionId },
        data: {
          weeklyOutcomes: {
            connect: { id: input.weeklyOutcomeId }
          }
        }
      });

      return { success: true };
    }),

  // Remove weekly outcome
  removeWeeklyOutcome: protectedProcedure
    .input(z.object({
      id: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user can delete this outcome
      const outcome = await ctx.db.weeklyOutcome.findFirst({
        where: {
          id: input.id,
          team: {
            members: {
              some: { userId: ctx.session.user.id }
            }
          }
        }
      });

      if (!outcome) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Weekly outcome not found or access denied"
        });
      }

      await ctx.db.weeklyOutcome.delete({
        where: { id: input.id }
      });

      return { success: true };
    })
});