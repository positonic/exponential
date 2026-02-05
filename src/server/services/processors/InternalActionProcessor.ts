import { ActionProcessor, type ParsedActionItem, type ActionProcessorResult, type ActionProcessorConfig } from './ActionProcessor';
import { db } from '~/server/db';
import { type PRIORITY_VALUES } from '~/types/priority';

export class InternalActionProcessor extends ActionProcessor {
  name = 'Internal Actions';
  type = 'internal' as const;

  constructor(config: ActionProcessorConfig) {
    super(config);
  }

  async processActionItems(actionItems: ParsedActionItem[]): Promise<ActionProcessorResult> {
    const result: ActionProcessorResult = {
      success: true,
      processedCount: 0,
      errors: [],
      createdItems: []
    };

    try {
      for (const item of actionItems) {
        try {
          const action = await this.createAction(item);
          result.createdItems.push({
            id: action.id,
            title: action.name,
          });
          result.processedCount++;
        } catch (error) {
          result.errors.push(`Failed to create action "${item.text}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to process action items: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  private async createAction(actionItem: ParsedActionItem) {
    // Map priority from action item context to our priority system
    const priority = this.mapPriority(actionItem.priority);
    
    // Clean up the action text - remove common prefixes
    const name = this.cleanActionText(actionItem.text);
    
    // Try to find a matching user for the assignee
    let assigneeUserId: string | null = null;

    if (actionItem.assignee && actionItem.assignee !== 'Unassigned') {
      const matchedUser = await this.findUserByName(actionItem.assignee);
      if (matchedUser) {
        assigneeUserId = matchedUser.id;
      }
    }

    const actionStatus = this.config.actionStatus ?? "ACTIVE";
    const actionData = {
      name,
      description: actionItem.context || 'Action item from meeting',
      priority,
      status: actionStatus,
      createdById: this.config.userId, // Always use the user who processed the meeting
      projectId: this.config.projectId || null,
      transcriptionSessionId: this.config.transcriptionId || null,
      dueDate: actionItem.dueDate || null,
    };

    console.log('🔨 Creating action in database:', {
      name: actionData.name,
      priority: actionData.priority,
      createdById: actionData.createdById,
      projectId: actionData.projectId,
      assigneeUserId,
    });

    const createdAction = await db.action.create({
      data: actionData,
    });

    // Create ActionAssignee record if we matched a user from the transcript
    if (assigneeUserId) {
      await db.actionAssignee.create({
        data: {
          actionId: createdAction.id,
          userId: assigneeUserId,
        },
      });
      console.log('👤 Assigned action to user:', assigneeUserId);
    }

    console.log('✅ Action created successfully:', {
      id: createdAction.id,
      name: createdAction.name,
      createdById: createdAction.createdById,
      assignedTo: assigneeUserId,
    });

    return createdAction;
  }

  private async findUserByName(assigneeName: string): Promise<{ id: string; name: string } | null> {
    try {
      // Try exact name match first (case insensitive)
      const exactMatch = await db.user.findFirst({
        where: {
          name: {
            equals: assigneeName,
            mode: 'insensitive',
            not: null
          }
        },
        select: { id: true, name: true }
      });
      
      if (exactMatch && exactMatch.name) {
        return exactMatch as { id: string; name: string };
      }

      // Try partial matches (first name, last name)
      const nameParts = assigneeName.toLowerCase().split(' ');
      const partialMatch = await db.user.findFirst({
        where: {
          AND: [
            { name: { not: null } },
            {
              OR: nameParts.map(part => ({
                name: {
                  contains: part,
                  mode: 'insensitive'
                }
              }))
            }
          ]
        },
        select: { id: true, name: true }
      });

      return partialMatch && partialMatch.name ? partialMatch as { id: string; name: string } : null;
    } catch (error) {
      console.error('Error finding user by name:', error);
      return null;
    }
  }

  private mapPriority(priority?: string): typeof PRIORITY_VALUES[number] {
    if (!priority) return 'Quick';
    
    const normalizedPriority = priority.toLowerCase();
    
    // Map common priority keywords to our system
    if (normalizedPriority.includes('urgent') || normalizedPriority.includes('asap')) {
      return '1st Priority';
    }
    if (normalizedPriority.includes('high') || normalizedPriority.includes('important')) {
      return '2nd Priority';
    }
    if (normalizedPriority.includes('medium') || normalizedPriority.includes('normal')) {
      return '3rd Priority';
    }
    if (normalizedPriority.includes('low') || normalizedPriority.includes('someday')) {
      return 'Someday Maybe';
    }
    
    return 'Quick';
  }

  private cleanActionText(text: string): string {
    // Remove common action item prefixes
    const prefixesToRemove = [
      /^action item:?\s*/i,
      /^todo:?\s*/i,
      /^task:?\s*/i,
      /^follow up:?\s*/i,
      /^next step:?\s*/i,
      /^@\w+\s*/i, // Remove @mentions at the start
    ];

    let cleaned = text.trim();
    for (const prefix of prefixesToRemove) {
      cleaned = cleaned.replace(prefix, '');
    }

    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned || text; // Fallback to original if cleaning removed everything
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!this.config.userId) {
      errors.push('User ID is required');
    }

    // Verify user exists
    if (this.config.userId) {
      const user = await db.user.findUnique({
        where: { id: this.config.userId }
      });
      
      if (!user) {
        errors.push('User not found');
      }
    }

    // Verify project exists if specified
    if (this.config.projectId) {
      const project = await db.project.findUnique({
        where: { 
          id: this.config.projectId,
          createdById: this.config.userId 
        }
      });
      
      if (!project) {
        errors.push('Project not found or user does not have access');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async getStatus(): Promise<{ available: boolean; message?: string }> {
    try {
      // Test database connection by attempting to find the user
      await db.user.findUnique({
        where: { id: this.config.userId }
      });
      
      return { available: true };
    } catch (error) {
      return {
        available: false,
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}