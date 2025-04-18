import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import path from "path";
import OpenAI from "openai";
import { TRPCError } from "@trpc/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Input validation schema
const launchPlanInputSchema = z.object({
  productDescription: z.string(),
  differentiators: z.array(z.string()),
  goals: z.array(z.string()),
  audience: z.array(z.string()),
});

// Response schema
const launchPlanResponseSchema = z.object({
  project: z.object({
    name: z.string(),
    description: z.string(),
  }),
  outcome: z.object({
    description: z.string(),
    type: z.string(),
    dueDate: z.string(),
  }),
  weeklyGoals: z.array(z.object({
    week: z.number().min(1).max(3),
    title: z.string(),
    description: z.string(),
  })),
  actions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    dueDate: z.string(),
    priority: z.enum(["High", "Medium", "Low"]),
    week: z.number().min(1).max(3),
  })),
});

async function readPromptTemplate(templateName: string) {
  // Dynamic import fs promises only when the function is called (server-side)
  const fs = await import('node:fs/promises');
  const promptPath = path.join(process.cwd(), "src/prompts", templateName);
  return fs.readFile(promptPath, "utf-8");
}

export const workflowRouter = createTRPCRouter({
  suggestDifferentiatorsAndAudience: protectedProcedure
    .input(z.object({ productDescription: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Fetch all differentiators and audiences from the database
        const [differentiators, audiences] = await Promise.all([
          ctx.db.differentiator.findMany({
            orderBy: [{ isDefault: 'desc' }, { label: 'asc' }]
          }),
          ctx.db.audience.findMany({
            orderBy: [{ isDefault: 'desc' }, { label: 'asc' }]
          })
        ]);

        const completion = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: `You are a product strategist helping identify key differentiators, target audiences, and compelling taglines. Based on the product description:
              
1) Suggest 3-5 key differentiators from this list: ${differentiators.map(d => d.label).join(', ')}
2) For each differentiator, provide an expanded description that highlights its value proposition
3) Suggest 2-4 target audiences from this list: ${audiences.map(a => a.label).join(', ')}
4) For each audience, provide an expanded description explaining why they are a good fit and their key needs
5) Create 3 compelling taglines that emphasize the product's unique value

Return your response as a JSON object with:
- 'differentiators': array of objects with { label, value, description }
- 'audiences': array of objects with { label, description }
- 'taglines': array of strings with compelling taglines`,
            },
            {
              role: "user",
              content: `Please analyze this product description and return the expanded suggestions as JSON: "${input.productDescription}"`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const response = completion.choices[0]?.message.content;
        if (!response) throw new Error("Failed to generate suggestions");

        const result = z.object({
          differentiators: z.array(z.object({
            label: z.string(),
            value: z.string(),
            description: z.string().optional(),
          })),
          audiences: z.array(z.object({
            label: z.string(),
            description: z.string(),
          })),
          taglines: z.array(z.string()),
        }).parse(JSON.parse(response));

        return result;
      } catch (error) {
        console.error('Error in suggestDifferentiatorsAndAudience:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to suggest differentiators and audiences',
        });
      }
    }),

  generateLaunchPlan: protectedProcedure
    .input(launchPlanInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify session
        if (!ctx.session?.user?.id) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to generate a launch plan',
          });
        }

        console.log('Starting launch plan generation with input:', input);

        // 1. Read the prompt template
        const promptTemplate = await readPromptTemplate("launch-sprint.txt");

        // 2. Fill in the template
        const filledPrompt = promptTemplate
          .replace("{{product_description}}", input.productDescription)
          .replace("{{[differentiators]}}", JSON.stringify(input.differentiators))
          .replace("{{[goals]}}", JSON.stringify(input.goals))
          .replace("{{[audience]}}", JSON.stringify(input.audience));

        console.log('Calling OpenAI with prompt...');

        // 3. Call OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: "You are a startup co-pilot that helps entrepreneurs launch their products.",
            },
            {
              role: "user",
              content: filledPrompt,
            },
          ],
          response_format: { type: "json_object" },
        });

        const response = completion.choices[0]?.message.content;
        if (!response) throw new Error("Failed to generate launch plan");

        console.log('Received OpenAI response, parsing...');

        // 4. Parse and validate the response
        const plan = launchPlanResponseSchema.parse(JSON.parse(response));
        console.log('Parsed launch plan:', plan);
        console.log('Creating workflow in database...');

        return { plan };
      } catch (error) {
        console.error('Error in generateLaunchPlan:', error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      }
    }),

  saveLaunchPlan: protectedProcedure
    .input(z.object({
      plan: launchPlanResponseSchema
    }))
    .mutation(async ({ ctx, input }) => {
      const baseSlug = input.plan.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const uniqueSlug = `${baseSlug}`;

      // Create the project with all related data
      const project = await ctx.db.project.create({
        data: {
          name: input.plan.project.name,
          description: input.plan.project.description,
          slug: uniqueSlug,
          createdById: ctx.session.user.id,
          status: "ACTIVE",
          // Create the main outcome
          outcomes: {
            create: {
              description: input.plan.outcome.description,
              type: input.plan.outcome.type,
              dueDate: new Date(input.plan.outcome.dueDate),
              userId: ctx.session.user.id,
            },
          },
          // Create weekly goals
          goals: {
            create: input.plan.weeklyGoals.map(goal => ({
              title: `Week ${goal.week}: ${goal.title}`,
              description: goal.description,
              lifeDomainId: 1, // Launch domain
              userId: ctx.session.user.id,
              dueDate: new Date(input.plan.actions.find(a => a.week === goal.week)?.dueDate ?? new Date()),
            }))
          },
          // Create actions
          actions: {
            create: input.plan.actions.map((action, index) => ({
              name: action.name,
              description: action.description,
              dueDate: new Date(action.dueDate),
              priority: action.priority === "High" ? "1st Priority" : 
                       action.priority === "Medium" ? "2nd Priority" : 
                       "3rd Priority",
              createdById: ctx.session.user.id,
              status: "ACTIVE",
            }))
          }
        },
        include: {
          outcomes: true,
          goals: true,
          actions: true,
        },
      });

      if (!project) throw new Error("Failed to create project");

      return { projects: [project] };
    }),

  getAllDifferentiators: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.differentiator.findMany({
        orderBy: [
          { isDefault: 'desc' },
          { label: 'asc' }
        ]
      });
    }),

  getAllAudiences: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.audience.findMany({
        orderBy: [
          { isDefault: 'desc' },
          { label: 'asc' }
        ]
      });
    }),

  createDifferentiator: protectedProcedure
    .input(z.object({
      value: z.string(),
      label: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.differentiator.create({
        data: {
          value: input.value,
          label: input.label,
          description: input.description || "",
          isDefault: false,
        }
      });
    }),

  generateAudienceDescription: protectedProcedure
    .input(z.object({
      audienceLabel: z.string(),
      productDescription: z.string(),
    }))
    .mutation(async ({ input }) => {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a product strategist helping to identify why a specific audience segment would benefit from a product. Generate a concise but detailed description (2-3 sentences) explaining why this audience is a good fit and what specific needs the product addresses for them.",
          },
          {
            role: "user",
            content: `Please generate a description for the audience "${input.audienceLabel}" based on this product description: "${input.productDescription}"`,
          },
        ],
      });

      const description = completion.choices[0]?.message.content;
      if (!description) throw new Error("Failed to generate audience description");

      return { description };
    }),

  createAudience: protectedProcedure
    .input(z.object({
      value: z.string(),
      label: z.string(),
      description: z.string().optional(),
      productDescription: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let description = input.description || "";
      
      // If no description is provided but we have a product description, generate one
      if (!description && input.productDescription) {
        try {
          const result = await workflowRouter.createCaller(ctx).generateAudienceDescription({
            audienceLabel: input.label,
            productDescription: input.productDescription,
          });
          description = result.description;
        } catch (error) {
          console.error('Failed to generate audience description:', error);
          // Continue with empty description if generation fails
        }
      }

      return ctx.db.audience.create({
        data: {
          value: input.value,
          label: input.label,
          description: description,
          isDefault: false,
        }
      });
    }),
}); 