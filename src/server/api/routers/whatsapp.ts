import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { WhatsAppNotificationService } from "~/server/services/whatsapp/WhatsAppNotificationService";
import { db } from "~/server/db";

export const whatsappRouter = createTRPCRouter({
  // Get WhatsApp configuration for the current user
  getConfig: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get user's team memberships
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        select: {
          teamId: true,
        },
      });

      const teamIds = userTeams.map(membership => membership.teamId);

      // Get the WhatsApp config
      const config = await ctx.db.whatsAppConfig.findFirst({
        where: {
          integrationId: input.integrationId,
          integration: {
            OR: [
              { userId: ctx.session.user.id },
              ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
            ],
          },
        },
        include: {
          integration: true,
          templates: true,
        },
      });

      if (!config) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'WhatsApp configuration not found',
        });
      }

      return config;
    }),

  // Test WhatsApp connection
  testConnection: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get the integration and credentials
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id },
            {
              AND: [
                { teamId: { not: null } },
                {
                  team: {
                    members: {
                      some: {
                        userId: ctx.session.user.id,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        include: {
          credentials: true,
          whatsappConfig: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      // Get credentials
      const accessToken = integration.credentials.find((c: any) => c.keyType === 'ACCESS_TOKEN')?.key;
      const phoneNumberId = integration.credentials.find((c: any) => c.keyType === 'PHONE_NUMBER_ID')?.key;

      if (!accessToken || !phoneNumberId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing required credentials',
        });
      }

      try {
        // Test the connection by fetching phone number details
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return {
            success: false,
            error: `API Error: ${error}`,
          };
        }

        const data = await response.json();
        
        // Update the config with latest info
        if (integration.whatsappConfig) {
          await ctx.db.whatsAppConfig.update({
            where: {
              id: integration.whatsappConfig.id,
            },
            data: {
              displayPhoneNumber: data.display_phone_number,
              businessName: data.verified_name,
            },
          });
        }

        return {
          success: true,
          phoneNumber: data.display_phone_number,
          businessName: data.verified_name,
          qualityRating: data.quality_rating,
        };
      } catch (error) {
        console.error('WhatsApp connection test error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection test failed',
        };
      }
    }),

  // Send a test message
  sendTestMessage: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      phoneNumber: z.string(),
      message: z.string().max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get integration and credentials
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id },
            {
              AND: [
                { teamId: { not: null } },
                {
                  team: {
                    members: {
                      some: {
                        userId: ctx.session.user.id,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        include: {
          credentials: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      // Get credentials
      const accessToken = integration.credentials.find((c: any) => c.keyType === 'ACCESS_TOKEN')?.key;
      const phoneNumberId = integration.credentials.find((c: any) => c.keyType === 'PHONE_NUMBER_ID')?.key;

      if (!accessToken || !phoneNumberId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Missing required credentials',
        });
      }

      try {
        // Send text message
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: input.phoneNumber,
              type: 'text',
              text: {
                body: input.message,
              },
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Failed to send message: ${error.error?.message || 'Unknown error'}`,
          });
        }

        const data = await response.json();

        return {
          success: true,
          messageId: data.messages?.[0]?.id,
        };
      } catch (error) {
        console.error('Failed to send WhatsApp message:', error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to send message',
        });
      }
    }),

  // Get all templates
  getTemplates: protectedProcedure
    .query(async ({ ctx }) => {
      // Get user's integrations
      const userIntegrations = await ctx.db.integration.findMany({
        where: {
          userId: ctx.session.user.id,
          provider: 'whatsapp',
          status: 'ACTIVE',
        },
        include: {
          whatsappConfig: {
            include: {
              templates: {
                include: {
                  _count: {
                    select: {
                      usageMetrics: true,
                    },
                  },
                },
                orderBy: {
                  createdAt: 'desc',
                },
              },
            },
          },
        },
      });

      // Flatten templates from all configs
      const templates = userIntegrations
        .flatMap(i => i.whatsappConfig?.templates || [])
        .filter((template, index, self) => 
          index === self.findIndex(t => t.id === template.id)
        );

      return templates;
    }),

  // Get template metrics
  getTemplateMetrics: protectedProcedure
    .query(async ({ ctx }) => {
      const userIntegrations = await ctx.db.integration.findMany({
        where: {
          userId: ctx.session.user.id,
          provider: 'whatsapp',
          status: 'ACTIVE',
        },
        select: {
          whatsappConfig: {
            select: {
              templates: {
                select: {
                  id: true,
                  status: true,
                  _count: {
                    select: {
                      usageMetrics: true,
                    },
                  },
                  usageMetrics: {
                    select: {
                      delivered: true,
                      read: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const templates = userIntegrations.flatMap(i => i.whatsappConfig?.templates || []);
      
      const total = templates.length;
      const approved = templates.filter(t => t.status === 'APPROVED').length;
      const totalSent = templates.reduce((sum, t) => sum + t._count.usageMetrics, 0);
      const totalDelivered = templates.reduce((sum, t) => 
        sum + t.usageMetrics.filter(u => u.delivered).length, 0
      );

      return {
        total,
        approved,
        pending: templates.filter(t => t.status === 'PENDING').length,
        rejected: templates.filter(t => t.status === 'REJECTED').length,
        totalSent,
        deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      };
    }),

  // Create new template
  createTemplate: protectedProcedure
    .input(z.object({
      name: z.string(),
      language: z.string(),
      category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
      headerType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
      headerText: z.string().optional(),
      bodyText: z.string(),
      footerText: z.string().optional(),
      buttons: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user's active WhatsApp integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          userId: ctx.session.user.id,
          provider: 'whatsapp',
          status: 'ACTIVE',
        },
        include: {
          whatsappConfig: true,
          credentials: true,
        },
      });

      if (!integration?.whatsappConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active WhatsApp integration found',
        });
      }

      // Create template in database
      const template = await ctx.db.whatsAppTemplate.create({
        data: {
          name: input.name,
          language: input.language,
          category: input.category,
          headerType: input.headerType,
          headerText: input.headerText,
          bodyText: input.bodyText,
          footerText: input.footerText,
          buttons: input.buttons || null,
          status: 'PENDING',
          whatsappConfigId: integration.whatsappConfig.id,
        },
      });

      // Submit template to WhatsApp for approval
      const accessToken = integration.credentials.find(c => c.keyType === 'ACCESS_TOKEN')?.key;
      const businessAccountId = integration.whatsappConfig.businessAccountId;

      if (accessToken && businessAccountId) {
        try {
          const components = [];
          
          // Add header component if specified
          if (input.headerType && input.headerText) {
            components.push({
              type: 'HEADER',
              format: input.headerType,
              text: input.headerText,
            });
          }

          // Add body component
          components.push({
            type: 'BODY',
            text: input.bodyText,
          });

          // Add footer if specified
          if (input.footerText) {
            components.push({
              type: 'FOOTER',
              text: input.footerText,
            });
          }

          // Add buttons if specified
          if (input.buttons && Array.isArray(input.buttons)) {
            components.push({
              type: 'BUTTONS',
              buttons: input.buttons,
            });
          }

          const response = await fetch(
            `https://graph.facebook.com/v18.0/${businessAccountId}/message_templates`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: input.name,
                language: input.language,
                category: input.category,
                components,
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            // Update template with WhatsApp ID
            await ctx.db.whatsAppTemplate.update({
              where: { id: template.id },
              data: { whatsappTemplateId: data.id },
            });
          } else {
            const error = await response.json();
            console.error('Failed to submit template to WhatsApp:', error);
          }
        } catch (error) {
          console.error('Error submitting template to WhatsApp:', error);
        }
      }

      return template;
    }),

  // Update template
  updateTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      name: z.string(),
      language: z.string(),
      category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
      headerType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
      headerText: z.string().optional(),
      bodyText: z.string(),
      footerText: z.string().optional(),
      buttons: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const template = await ctx.db.whatsAppTemplate.findFirst({
        where: {
          id: input.templateId,
          whatsappConfig: {
            integration: {
              userId: ctx.session.user.id,
            },
          },
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      if (template.status === 'APPROVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot edit approved templates',
        });
      }

      // Update template
      const updated = await ctx.db.whatsAppTemplate.update({
        where: { id: input.templateId },
        data: {
          name: input.name,
          language: input.language,
          category: input.category,
          headerType: input.headerType,
          headerText: input.headerText,
          bodyText: input.bodyText,
          footerText: input.footerText,
          buttons: input.buttons || null,
        },
      });

      return updated;
    }),

  // Delete template
  deleteTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const template = await ctx.db.whatsAppTemplate.findFirst({
        where: {
          id: input.templateId,
          whatsappConfig: {
            integration: {
              userId: ctx.session.user.id,
            },
          },
        },
        include: {
          whatsappConfig: {
            include: {
              integration: {
                include: {
                  credentials: true,
                },
              },
            },
          },
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      // If template has WhatsApp ID, delete from WhatsApp
      if (template.whatsappTemplateId) {
        const accessToken = template.whatsappConfig.integration.credentials
          .find(c => c.keyType === 'ACCESS_TOKEN')?.key;
        
        if (accessToken) {
          try {
            await fetch(
              `https://graph.facebook.com/v18.0/${template.whatsappConfig.businessAccountId}/message_templates?name=${template.name}`,
              {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
              }
            );
          } catch (error) {
            console.error('Failed to delete template from WhatsApp:', error);
          }
        }
      }

      // Delete from database
      await ctx.db.whatsAppTemplate.delete({
        where: { id: input.templateId },
      });

      return { success: true };
    }),

  // Test template
  testTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      variables: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get template and user's phone mapping
      const template = await ctx.db.whatsAppTemplate.findFirst({
        where: {
          id: input.templateId,
          whatsappConfig: {
            integration: {
              userId: ctx.session.user.id,
            },
          },
        },
        include: {
          whatsappConfig: {
            include: {
              integration: true,
            },
          },
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      if (template.status !== 'APPROVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Template must be approved before testing',
        });
      }

      // Get user's phone number
      const phoneMapping = await ctx.db.integrationUserMapping.findFirst({
        where: {
          userId: ctx.session.user.id,
          integrationId: template.whatsappConfig.integrationId,
        },
      });

      if (!phoneMapping) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Please link your WhatsApp number first',
        });
      }

      // Send test message
      const whatsappService = WhatsAppNotificationService.getInstance();
      const result = await whatsappService.sendTemplate(
        template.whatsappConfig.integrationId,
        phoneMapping.externalUserId,
        template.name,
        template.language,
        input.variables || []
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to send test message',
        });
      }

      // Track usage
      await ctx.db.whatsAppTemplateUsage.create({
        data: {
          templateId: template.id,
          usedBy: ctx.session.user.id,
          recipientPhone: phoneMapping.externalUserId,
          messageId: result.messageId,
          variables: input.variables || [],
          status: 'sent',
        },
      });

      return { success: true };
    }),

  // Get template analytics
  getTemplateAnalytics: protectedProcedure
    .query(async ({ ctx }) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const analytics = await ctx.db.whatsAppTemplateUsage.groupBy({
        by: ['templateId'],
        where: {
          template: {
            whatsappConfig: {
              integration: {
                userId: ctx.session.user.id,
              },
            },
          },
          usedAt: {
            gte: thirtyDaysAgo,
          },
        },
        _count: {
          _all: true,
        },
      });

      // Get detailed metrics for each template
      const detailedAnalytics = await Promise.all(
        analytics.map(async (item) => {
          const metrics = await ctx.db.whatsAppTemplateUsage.findMany({
            where: {
              templateId: item.templateId,
              usedAt: {
                gte: thirtyDaysAgo,
              },
            },
            select: {
              delivered: true,
              read: true,
              status: true,
              usedAt: true,
            },
            orderBy: {
              usedAt: 'desc',
            },
            take: 1,
          });

          const totalSent = item._count._all;
          const delivered = metrics.filter(m => m.delivered).length;
          const read = metrics.filter(m => m.read).length;
          const failed = metrics.filter(m => m.status === 'failed').length;

          return {
            templateId: item.templateId,
            totalSent,
            delivered,
            read,
            failed,
            deliveryRate: totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0,
            readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
            lastUsed: metrics[0]?.usedAt,
          };
        })
      );

      return detailedAnalytics;
    }),

  // Admin: Approve template
  approveTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user has admin permissions
      const isAdmin = await checkTemplateAdminPermission(ctx.session.user.id);
      if (!isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can approve templates',
        });
      }

      // Get template
      const template = await ctx.db.whatsAppTemplate.findUnique({
        where: { id: input.templateId },
        include: {
          whatsappConfig: {
            include: {
              integration: {
                include: {
                  credentials: true,
                },
              },
            },
          },
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      if (template.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending templates can be approved',
        });
      }

      // Update template status
      const updatedTemplate = await ctx.db.whatsAppTemplate.update({
        where: { id: input.templateId },
        data: {
          status: 'APPROVED',
          rejectionReason: null,
        },
      });

      // Log the approval action
      await ctx.db.aiInteractionHistory.create({
        data: {
          platform: 'whatsapp_admin',
          systemUserId: ctx.session.user.id,
          userMessage: `Approved template: ${template.name}`,
          aiResponse: 'Template approved successfully',
          intent: 'template_approval',
          category: 'admin',
          actionsTaken: [{
            action: 'approve_template',
            templateId: template.id,
            templateName: template.name,
            result: 'success',
          }],
        },
      });

      return updatedTemplate;
    }),

  // Admin: Reject template
  rejectTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user has admin permissions
      const isAdmin = await checkTemplateAdminPermission(ctx.session.user.id);
      if (!isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can reject templates',
        });
      }

      // Get template
      const template = await ctx.db.whatsAppTemplate.findUnique({
        where: { id: input.templateId },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      if (template.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending templates can be rejected',
        });
      }

      // Update template status
      const updatedTemplate = await ctx.db.whatsAppTemplate.update({
        where: { id: input.templateId },
        data: {
          status: 'REJECTED',
          rejectionReason: input.reason,
        },
      });

      // Log the rejection action
      await ctx.db.aiInteractionHistory.create({
        data: {
          platform: 'whatsapp_admin',
          systemUserId: ctx.session.user.id,
          userMessage: `Rejected template: ${template.name}`,
          aiResponse: `Template rejected. Reason: ${input.reason}`,
          intent: 'template_rejection',
          category: 'admin',
          actionsTaken: [{
            action: 'reject_template',
            templateId: template.id,
            templateName: template.name,
            reason: input.reason,
            result: 'success',
          }],
        },
      });

      return updatedTemplate;
    }),

  // Admin: Get pending templates for review
  getPendingTemplatesForReview: protectedProcedure
    .query(async ({ ctx }) => {
      // Check if user has admin permissions
      const isAdmin = await checkTemplateAdminPermission(ctx.session.user.id);
      if (!isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can view pending templates',
        });
      }

      const templates = await ctx.db.whatsAppTemplate.findMany({
        where: {
          status: 'PENDING',
        },
        include: {
          whatsappConfig: {
            include: {
              integration: {
                select: {
                  user: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              usageMetrics: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc', // Oldest first for review queue
        },
      });

      return templates;
    }),

  // Admin: Get template approval history
  getTemplateApprovalHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // Check if user has admin permissions
      const isAdmin = await checkTemplateAdminPermission(ctx.session.user.id);
      if (!isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can view approval history',
        });
      }

      const history = await ctx.db.aiInteractionHistory.findMany({
        where: {
          platform: 'whatsapp_admin',
          intent: {
            in: ['template_approval', 'template_rejection'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: input.limit,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      return history;
    }),

  // Check user admin permissions
  checkAdminPermissions: protectedProcedure
    .query(async ({ ctx }) => {
      const isAdmin = await checkTemplateAdminPermission(ctx.session.user.id);
      
      return {
        isAdmin,
        permissions: {
          canApproveTemplates: isAdmin,
          canRejectTemplates: isAdmin,
          canViewPendingTemplates: isAdmin,
          canViewApprovalHistory: isAdmin,
        },
      };
    }),
});

/**
 * Check if a user has template admin permissions
 * This is a simple implementation - in production you might want to use a proper RBAC system
 */
async function checkTemplateAdminPermission(userId: string): Promise<boolean> {
  // For now, check if user is a team owner or has specific admin permissions
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      teams: {
        where: {
          role: 'owner',
        },
        select: {
          teamId: true,
        },
      },
      // You could also check for specific admin roles or permissions here
      permissionsGrantedTo: {
        where: {
          permissions: {
            has: 'ADMIN_TEMPLATES',
          },
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      },
    },
  });

  // User is admin if they own a team or have explicit template admin permissions
  return (
    (user?.teams?.length ?? 0) > 0 || 
    (user?.permissionsGrantedTo?.length ?? 0) > 0 ||
    // For development, you might want to allow certain email addresses
    user?.email?.includes('@admin.') === true
  );
}