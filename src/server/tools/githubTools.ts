import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { Octokit } from "@octokit/rest";

// Schema definitions for GitHub operations
const createIssueSchema = z.object({
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
  repo: z.string().default("Akashic-fund/qf-contracts"),
  owner: z.string().default("Akashic-fund"),
  type: z.enum(["user-story", "task", "epic"]).optional(),
});

const createMilestoneSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  due_on: z.string().optional(), // ISO date string
  repo: z.string().default("Akashic-fund/qf-contracts"),
  owner: z.string().default("Akashic-fund"),
});

const addItemToProjectSchema = z.object({
  content_id: z.number(), // Issue or PR ID
  content_type: z.enum(["Issue", "PullRequest"]).default("Issue"),
  project_number: z.number().default(1), // Project number in the org
  organization: z.string().default("Akashic-fund"),
});

const updateProjectItemStatusSchema = z.object({
  item_id: z.string(), // Project item ID 
  status_value: z.enum(["Todo", "In Progress", "Done"]),
  project_number: z.number().default(1),
  organization: z.string().default("Akashic-fund"),
});

const createEpicSchema = z.object({
  title: z.string(),
  description: z.string(),
  user_stories: z.array(z.string()).optional(), // List of user story titles
  repo: z.string().default("Akashic-fund/qf-contracts"),
  owner: z.string().default("Akashic-fund"),
});

export const createGithubTools = (ctx: any) => {
  // Initialize Octokit with the GitHub token
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  const createIssueTool = tool(
    async (input): Promise<string> => {
      try {
        // Create labels based on issue type if not provided
        let labels = input.labels || [];
        if (input.type && !labels.includes(input.type)) {
          labels.push(input.type);
        }

        // Create the issue
        const { data: issue } = await octokit.issues.create({
          owner: input.owner,
          repo: input.repo.split('/')[1] || input.repo, // Handle both "owner/repo" and "repo" formats
          title: input.title,
          body: input.body,
          labels,
          assignees: input.assignees,
          milestone: input.milestone,
        });

        // Try to add the issue to the project
        try {
          if (issue.id) {
            // This would require using the GraphQL API for GitHub Projects V2
            // We'll need to implement this separately if needed
            // Placeholder for the actual implementation
            console.log(`Issue created. To add to project, use add_to_project tool with content_id: ${issue.id}`);
          }
        } catch (projError) {
          console.error("Error adding issue to project:", projError);
          // Continue since the issue was created successfully
        }

        return `Successfully created issue "${issue.title}" with number #${issue.number} and URL: ${issue.html_url}`;
      } catch (error) {
        console.error('Error creating GitHub issue:', error);
        throw new Error(`Failed to create GitHub issue: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    {
      name: "create_github_issue",
      description: "Creates a new GitHub issue with optional labels, assignees, and milestone",
      schema: createIssueSchema,
    }
  );

  const createMilestoneTool = tool(
    async (input): Promise<string> => {
      try {
        const { data: milestone } = await octokit.issues.createMilestone({
          owner: input.owner,
          repo: input.repo.split('/')[1] || input.repo,
          title: input.title,
          description: input.description,
          due_on: input.due_on,
        });

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
        // Create a main issue to track the epic
        const { data: epicIssue } = await octokit.issues.create({
          owner: input.owner,
          repo: input.repo.split('/')[1] || input.repo,
          title: `Epic: ${input.title}`,
          body: input.description,
          labels: ["epic"],
        });

        // Create user story issues if provided
        const userStoryIssues = [];
        if (input.user_stories && input.user_stories.length > 0) {
          // Build a checklist for the epic description
          let epicChecklist = `## User Stories\n\n`;
          
          for (const storyTitle of input.user_stories) {
            // Create each user story as a separate issue
            const { data: storyIssue } = await octokit.issues.create({
              owner: input.owner,
              repo: input.repo.split('/')[1] || input.repo,
              title: storyTitle,
              body: `Part of Epic: #${epicIssue.number}`,
              labels: ["user-story"],
            });
            
            userStoryIssues.push(storyIssue);
            epicChecklist += `- [ ] #${storyIssue.number} - ${storyIssue.title}\n`;
          }
          
          // Update the epic issue with the checklist of user stories
          await octokit.issues.update({
            owner: input.owner,
            repo: input.repo.split('/')[1] || input.repo,
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

  // Bulk creation tool for the specified QF integration project
//   const createQFIntegrationProjectTool = tool(
//     async (): Promise<string> => {
//       try {
//         // 1. Create milestones
//         const milestones = [
//           { title: "Knowledge Handoff Completed", description: "Ownership transferred to Shikhar, documentation shared, and support structure confirmed" },
//           { title: "Testing Infrastructure Live", description: "Foundry test suite executed and all key flows validated" },
//           { title: "Indexer Operational", description: "Ponder indexing QF events and data available for UI + audits" },
//           { title: "UI Integrated & Functional", description: "Campaign view includes matching round info and users can contribute, vote, and view matching" },
//           { title: "Audit Readiness", description: "Contracts + UI feature complete, indexer verified, and all edge cases handled in test suite" }
//         ];
        
//         const createdMilestones = [];
//         for (const m of milestones) {
//           const { data: milestone } = await octokit.issues.createMilestone({
//             owner: "Akashic-fund",
//             repo: "qf-contracts",
//             title: m.title,
//             description: m.description
//           });
//           createdMilestones.push(milestone);
//         }
        
//         // 2. Create the epic
//         const { data: epicIssue } = await octokit.issues.create({
//           owner: "Akashic-fund",
//           repo: "qf-contracts",
//           title: "Epic: Quadratic Funding Integration with Kickstarter Protocol",
//           body: "This epic tracks the integration of Quadratic Funding with the Kickstarter Protocol.",
//           labels: ["epic"]
//         });
        
//         // 3. Create user stories
//         const userStories = [
//           "As a developer, I want to test the end-to-end flow of QF contracts so I can ensure the protocol functions as intended.",
//           "As a product manager, I want UI components integrated with deployed QF contracts so users can interact with the funding mechanism smoothly.",
//           "As a data engineer, I want to index all relevant QF events so the system can track contributions, claims, and payouts accurately.",
//           "As a funder, I want to ensure campaign durations are compatible with QF rounds so my donations are matched correctly.",
//           "As a team lead, I want knowledge to be transferred seamlessly to Shikhar so the handover doesn't block development.",
//           "As a stakeholder, I want the Allo protocol architecture to support one-pool-per-project so funding flows are traceable and modular.",
//           "As a builder, I want to be able to monitor matching rounds and distribution points so I can validate fairness in fund allocation."
//         ];
        
//         const createdStories = [];
//         for (const story of userStories) {
//           const { data: storyIssue } = await octokit.issues.create({
//             owner: "Akashic-fund",
//             repo: "qf-contracts",
//             title: story,
//             body: `Part of Epic: #${epicIssue.number}`,
//             labels: ["user-story"]
//           });
//           createdStories.push(storyIssue);
//         }
        
//         // 4. Create tasks grouped by category
//         const taskCategories = {
//           "End-to-End Contract Testing": [
//             "Run Foundry tests for steps 1–18 (full user journey)",
//             "Validate deposit, vote, match, and withdraw flows"
//           ],
//           "UI Integration": [
//             "Integrate UI with deployed QF contracts",
//             "Implement logic for showing QF rounds and match status"
//           ],
//           "Indexer Setup (Ponder)": [
//             "Document requirements for QF-specific events",
//             "Set up Ponder to track: claimed events, payout distributions, and matching round point changes"
//           ],
//           "Allo Architecture Integration": [
//             "Finalize one-pool-per-project logic",
//             "Support post-campaign deposit whitelisting",
//             "Route matching funds through Allo pool",
//             "Route direct donations to project treasury"
//           ],
//           "On-chain vs. Off-chain QF Logic": [
//             "Evaluate current off-chain flow (reference: Gitcoin)",
//             "Plan upgrade path for potential on-chain calc"
//           ],
//           "Documentation & Knowledge Transfer": [
//             "Transfer knowledge from Prajwal to Shikhar",
//             "Upload Notion + GitHub documentation",
//             "Link documentation in GitHub Projects README"
//           ]
//         };
        
//         const createdTasks = [];
//         for (const [category, tasks] of Object.entries(taskCategories)) {
//           const { data: categoryIssue } = await octokit.issues.create({
//             owner: "Akashic-fund",
//             repo: "qf-contracts",
//             title: `🧩 ${category}`,
//             body: `Part of Epic: #${epicIssue.number}\n\n## Tasks:\n${tasks.map(t => `- [ ] ${t}`).join('\n')}`,
//             labels: ["task"]
//           });
//           createdTasks.push(categoryIssue);
//         }
        
//         // 5. Update epic with links to all created issues
//         let epicBody = "# Quadratic Funding Integration with Kickstarter Protocol\n\n";
//         epicBody += "## 🧑‍💻 User Stories\n";
//         createdStories.forEach(s => {
//           epicBody += `- [ ] #${s.number} ${s.title}\n`;
//         });
        
//         epicBody += "\n## 📌 Tasks\n";
//         createdTasks.forEach(t => {
//           epicBody += `- [ ] #${t.number} ${t.title}\n`;
//         });
        
//         epicBody += "\n## 🚩 Milestones\n";
//         createdMilestones.forEach(m => {
//           epicBody += `- ${m.title} (#${m.number})\n`;
//         });
        
//         await octokit.issues.update({
//           owner: "Akashic-fund",
//           repo: "qf-contracts",
//           issue_number: epicIssue.number,
//           body: epicBody
//         });
        
//         return `Successfully created QF integration project structure in GitHub:
// - Epic #${epicIssue.number}: Quadratic Funding Integration
// - ${createdStories.length} user stories created
// - ${createdTasks.length} task categories created
// - ${createdMilestones.length} milestones created

// Note: To add these items to the GitHub Project board (https://github.com/orgs/Akashic-fund/projects/1), you would need to implement GraphQL API calls using the GitHub Projects API v2.`;
//       } catch (error) {
//         console.error('Error creating QF integration project:', error);
//         throw new Error(`Failed to create QF integration project: ${error instanceof Error ? error.message : String(error)}`);
//       }
//     },
//     {
//       name: "create_qf_integration_project",
//       description: "Creates the full Quadratic Funding integration project structure in GitHub",
//       schema: z.object({}),
//     }
//   );

  return {
    createIssueTool,
    createMilestoneTool,
    createEpicTool,
    addToProjectTool,
    updateProjectItemStatusTool,
    // createQFIntegrationProjectTool,
  };
}; 