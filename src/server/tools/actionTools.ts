import { z } from "zod";
import { tool } from "@langchain/core/tools";

// Schemas for the Action CRUD operations
const createActionSchema = z.object({
  name: z.string(),
  description: z.string(),
  dueDate: z.string().optional(), // Date will be passed as ISO string
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
  priority: z.enum(["Quick", "Low", "Medium", "High"]).default("Quick"),
  projectId: z.string(),
});

const readActionSchema = z.object({
  id: z.string(),
});

const updateActionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["Quick", "Low", "Medium", "High"]).optional(),
});

const deleteActionSchema = z.object({
  id: z.string(),
});

export const createActionTools = (ctx: any) => {
  const createActionTool = tool(
    async (input): Promise<string> => {
      try {
        console.log('input is ', input);
        
        // Clean up projectId - convert empty string to null
        const projectId = input.projectId && input.projectId.trim() !== '' ? input.projectId : null;

        console.log('project is ', {
            data: {
              name: input.name,
              description: input.description,
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
              status: input.status,
              priority: input.priority
            },
          });
        const action = await ctx.db.action.create({
          data: {
            name: input.name,
            description: input.description,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            status: input.status,
            priority: input.priority,
            createdById: ctx.session.user.id,
            
          },
        });
        
        console.log('create action is ', action);
        return `Successfully created action "${action.name}" with ID: ${action.id}`;
      } catch (error) {
        console.error('Error creating action:', error);
        if (error instanceof Error && error.message.includes('foreign key')) {
          return `Created action "${input.name}" without a project association`;
        }
        throw new Error(`Failed to create action: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "create_action",
      description: "Creates a new action item with name, description, optional due date, status, priority, and optional project ID. If no project is specified make projectId null",
      schema: createActionSchema
    }
  );

  const readActionTool = tool(
    async (input): Promise<string> => {
      try {
        const action = await ctx.db.action.findUnique({
          where: { id: input.id },
        });
        if (!action) {
          throw new Error("Action not found");
        }
        return JSON.stringify(action, null, 2);
      } catch (error) {
        console.error('Error reading action:', error);
        throw new Error(`Failed to read action: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "read_action",
      description: "Retrieves an action by its ID",
      schema: readActionSchema,
    }
  );

  const updateActionTool = tool(
    async (input): Promise<string> => {
      try {
        console.log('Update status action input is ', input);
        console.log('IN updateActionTool');
        const action = await ctx.db.action.update({
          where: { id: input.id },
          data: {
            ...(input.status && { status: input.status }),
          },
        });
        return `Successfully updated action "${action.name}"`;
      } catch (error) {
        console.error('Error updating action:', error);
        throw new Error(`Failed to update action: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "update_status_action",
      description: "Updates an existing action by ID with optional new values",
      schema: updateActionSchema,
    }
  );

  const deleteActionTool = tool(
    async (input): Promise<string> => {
      try {
        await ctx.db.action.delete({
          where: { id: input.id },
        });
        return `Successfully deleted action with ID: ${input.id}`;
      } catch (error) {
        console.error('Error deleting action:', error);
        throw new Error(`Failed to delete action: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "delete_action",
      description: "Deletes an action by its ID",
      schema: deleteActionSchema,
    }
  );

  return {
    createActionTool,
    readActionTool,
    updateActionTool,
    deleteActionTool,
  };
}; 