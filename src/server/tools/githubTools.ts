import { z } from "zod";
import { tool } from "@langchain/core/tools";
import * as githubService from "~/server/services/githubService";

// Schema definitions for GitHub operations
const createIssueSchema = z.object({
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
  repo: z.string().optional(),
  owner: z.string().optional(),
  type: z.enum(["user-story", "task", "epic"]).optional(),
});

const createMilestoneSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  due_on: z.string().optional(),
  repo: z.string().optional(),
  owner: z.string().optional(),
});

const addItemToProjectSchema = z.object({
  content_id: z.number(),
  content_type: z.enum(["Issue", "PullRequest"]).default("Issue"),
  project_number: z.number().default(1),
  organization: z.string().optional(),
});

const updateProjectItemStatusSchema = z.object({
  item_id: z.string(),
  status_value: z.enum(["Todo", "In Progress", "Done"]),
  project_number: z.number().default(1),
  organization: z.string().optional(),
});

const createEpicSchema = z.object({
  title: z.string(),
  description: z.string(),
  user_stories: z.array(z.string()).optional(),
  repo: z.string().optional(),
  owner: z.string().optional(),
});

export const createGithubTools = (ctx: any, projectSettings?: githubService.GitHubProjectSettings) => {
  const settings = projectSettings || githubService.DEFAULT_SETTINGS;
  
  // Initialize the GitHub client with the token from environment
  const getOctokit = () => {
    return githubService.initGithubClient(process.env.GITHUB_TOKEN || '');
  };

  const createIssueTool = tool(
    async (input): Promise<string> => {
      try {
        const octokit = githubService.initGithubClient(process.env.GITHUB_TOKEN || "");
        console.log("Creating issue with settings:", settings);
        
        // Create the issue using the shared service with project settings
        const issue = await githubService.createIssue(octokit, input, settings);

        return `Successfully created issue "${issue.title}" with number #${issue.number} and URL: ${issue.url}`;
      } catch (error) {
        console.error('Error creating GitHub issue:', error);
        throw new Error(`Failed to create GitHub issue: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "create_github_issue",
      description: `Creates a new GitHub issue. Valid assignees are: ${settings.validAssignees.join(", ")}`,
      schema: createIssueSchema,
    }
  );

  const createMilestoneTool = tool(
    async (input): Promise<string> => {
      try {
        const octokit = getOctokit();
        
        // Create the milestone using the shared service with project settings
        const milestone = await githubService.createMilestone(octokit, {
          title: input.title,
          description: input.description,
          due_on: input.due_on,
          repo: input.repo || settings.repo,
          owner: input.owner || settings.owner,
        }, settings);

        return `Successfully created milestone "${milestone.title}" with number #${milestone.number}`;
      } catch (error) {
        console.error('Error creating GitHub milestone:', error);
        throw new Error(`Failed to create GitHub milestone: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "create_github_milestone",
      description: "Creates a new GitHub milestone with optional description and due date",
      schema: createMilestoneSchema,
    }
  );

  const createEpicTool = tool(
    async (input): Promise<string> => {
      try {
        const octokit = getOctokit();
        
        // Process input using settings
        const repoOwner = input.owner || settings.owner;
        const repoName = input.repo || settings.repo;
        
        // Validate repository
        await githubService.validateRepository(octokit, repoOwner, repoName);
        
        // Create a main issue to track the epic
        const { data: epicIssue } = await octokit.issues.create({
          owner: repoOwner,
          repo: repoName,
          title: `Epic: ${input.title}`,
          body: input.description,
          labels: ["epic"],
        });

        // Create user stories if provided
        const userStoryIssues = [];
        if (input.user_stories && input.user_stories.length > 0) {
          // Build a checklist for the epic description
          let epicChecklist = `## User Stories\n\n`;
          
          for (const storyTitle of input.user_stories) {
            // Create each user story as a separate issue using the shared service
            const storyIssue = await githubService.createIssue(octokit, {
              title: storyTitle,
              body: `Part of Epic: #${epicIssue.number}`,
              labels: ["user-story"],
              owner: repoOwner,
              repo: repoName,
            }, settings);
            
            userStoryIssues.push(storyIssue);
            epicChecklist += `- [ ] #${storyIssue.number} - ${storyIssue.title}\n`;
          }
          
          // Update the epic issue with the checklist of user stories
          await octokit.issues.update({
            owner: repoOwner,
            repo: repoName,
            issue_number: epicIssue.number,
            body: `${input.description}\n\n${epicChecklist}`,
          });
        }

        return `Successfully created Epic "${epicIssue.title}" with number #${epicIssue.number} and ${userStoryIssues.length} linked user stories`;
      } catch (error) {
        console.error('Error creating GitHub epic:', error);
        throw new Error(`Failed to create GitHub epic: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "create_github_epic",
      description: "Creates an epic issue with linked user story issues",
      schema: createEpicSchema,
    }
  );

  // Note: The following tools require GitHub's GraphQL API for Projects v2
  // This is a simplified placeholder - actual implementation would need to use graphql
  
  const addToProjectTool = tool(
    async (input): Promise<string> => {
      try {
        // This is a placeholder for the actual implementation
        // In reality, you would need to use GitHub's GraphQL API to add items to Projects v2
        return `This tool requires GitHub's GraphQL API for Projects v2. To add issue #${input.content_id} to project #${input.project_number}, you would need to implement the GraphQL mutation 'addProjectV2ItemById'`;
      } catch (error) {
        console.error('Error adding item to GitHub project:', error);
        throw new Error(`Failed to add item to GitHub project: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "add_to_github_project",
      description: "Adds an issue or PR to a GitHub project (Note: requires GraphQL API)",
      schema: addItemToProjectSchema,
    }
  );

  const updateProjectItemStatusTool = tool(
    async (input): Promise<string> => {
      try {
        // This is a placeholder for the actual implementation
        // In reality, you would need to use GitHub's GraphQL API to update project item status
        return `This tool requires GitHub's GraphQL API for Projects v2. To update item ${input.item_id} status to ${input.status_value}, you would need to implement the GraphQL mutation 'updateProjectV2ItemFieldValue'`;
      } catch (error) {
        console.error('Error updating GitHub project item status:', error);
        throw new Error(`Failed to update GitHub project item status: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "update_github_project_status",
      description: "Updates the status of a GitHub project item (Note: requires GraphQL API)",
      schema: updateProjectItemStatusSchema,
    }
  );

  return {
    createIssueTool,
    createMilestoneTool,
    createEpicTool,
    addToProjectTool,
    updateProjectItemStatusTool,
  };
}; 