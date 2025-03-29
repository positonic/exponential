import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { Octokit } from "@octokit/rest";

// Default settings for a public repo you can access
const DEFAULT_OWNER = "Akashic-fund";
const DEFAULT_REPO = "akashic";  // Just the repo name, not owner/repo

export const githubRouter = createTRPCRouter({
  createIssue: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        body: z.string(),
        labels: z.array(z.string()).optional(),
        assignees: z.array(z.string()).optional(),
        repo: z.string().default(DEFAULT_REPO),
        owner: z.string().default(DEFAULT_OWNER),
        type: z.enum(["user-story", "task", "epic"]).optional(),
      }).transform(data => ({
        ...data,
        // Ensure these values are never undefined due to defaults
        repo: data.repo ?? DEFAULT_REPO,
        owner: data.owner ?? DEFAULT_OWNER,
      }))
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure there's a GitHub token available
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error("GitHub token not configured. Please add GITHUB_TOKEN to your .env file.");
      }

      const octokit = new Octokit({
        auth: token,
      });

      // Add type-based label if provided
      const labels = input.labels || [];
      if (input.type && !labels.includes(input.type)) {
        labels.push(input.type);
      }

      try {
        // Extract repository name if it contains owner prefix
        let repoName = input.repo as string;
        let repoOwner = input.owner as string;
        
        // Handle case where repo might be "owner/repo" format
        if (repoName.includes('/')) {
          const parts = repoName.split('/');
          repoOwner = parts[0];
          repoName = parts[1];
        }

        console.log(`Creating issue in ${repoOwner}/${repoName}`);
        
        // First check if the repo exists and is accessible
        try {
          await octokit.repos.get({
            owner: repoOwner,
            repo: repoName,
          });
        } catch (repoError) {
          console.error("Repository access error:", repoError);
          throw new Error(`Cannot access repository ${repoOwner}/${repoName}. Please check that it exists and your token has access to it.`);
        }

        const { data: issue } = await octokit.issues.create({
          owner: repoOwner,
          repo: repoName,
          title: input.title,
          body: input.body,
          labels,
          assignees: input.assignees,
        });

        return {
          success: true,
          issue: {
            id: issue.id,
            number: issue.number,
            title: issue.title,
            url: issue.html_url,
          },
        };
      } catch (error) {
        console.error('Error creating GitHub issue:', error);
        const errorMessage = error instanceof Error ? 
          error.message : 
          'Unknown error creating GitHub issue';
          
        throw new Error(`Failed to create GitHub issue: ${errorMessage}`);
      }
    }),

  createMilestone: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        due_on: z.string().optional(),
        repo: z.string().default("qf-contracts"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!process.env.GITHUB_TOKEN) {
        throw new Error("GitHub token not configured");
      }

      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
      });

      try {
        const { data: milestone } = await octokit.issues.createMilestone({
          owner: DEFAULT_OWNER,
          repo: input.repo,
          title: input.title,
          description: input.description,
          due_on: input.due_on,
        });

        return {
          success: true,
          milestone: {
            number: milestone.number,
            title: milestone.title,
            url: milestone.html_url,
          },
        };
      } catch (error) {
        console.error("Error creating GitHub milestone:", error);
        throw new Error(`Failed to create GitHub milestone: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

  createEpic: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string(),
        user_stories: z.array(z.string()).optional(),
        repo: z.string().default("qf-contracts"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!process.env.GITHUB_TOKEN) {
        throw new Error("GitHub token not configured");
      }

      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
      });

      try {
        // Create main epic issue
        const { data: epicIssue } = await octokit.issues.create({
          owner: DEFAULT_OWNER,
          repo: input.repo,
          title: `Epic: ${input.title}`,
          body: input.description,
          labels: ["epic"],
        });

        // Create user stories if provided
        const userStoryIssues = [];
        if (input.user_stories && input.user_stories.length > 0) {
          let epicChecklist = `## User Stories\n\n`;
          
          for (const storyTitle of input.user_stories) {
            const { data: storyIssue } = await octokit.issues.create({
              owner: DEFAULT_OWNER,
              repo: input.repo,
              title: storyTitle,
              body: `Part of Epic: #${epicIssue.number}`,
              labels: ["user-story"],
            });
            
            userStoryIssues.push({
              number: storyIssue.number,
              title: storyIssue.title,
              url: storyIssue.html_url,
            });
            epicChecklist += `- [ ] #${storyIssue.number} - ${storyIssue.title}\n`;
          }
          
          // Update epic with checklist
          await octokit.issues.update({
            owner: DEFAULT_OWNER,
            repo: input.repo,
            issue_number: epicIssue.number,
            body: `${input.description}\n\n${epicChecklist}`,
          });
        }

        return {
          success: true,
          epic: {
            number: epicIssue.number,
            title: epicIssue.title,
            url: epicIssue.html_url,
          },
          userStories: userStoryIssues,
        };
      } catch (error) {
        console.error("Error creating GitHub epic:", error);
        throw new Error(`Failed to create GitHub epic: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

//   createQFIntegrationProject: protectedProcedure
//     .mutation(async ({ ctx }) => {
//       if (!process.env.GITHUB_TOKEN) {
//         throw new Error("GitHub token not configured");
//       }

//       const octokit = new Octokit({
//         auth: process.env.GITHUB_TOKEN,
//       });

//       try {
//         const repoOwner = "positonic";
//         const repoName = "ai-todo";
        
//         // First check if we can access the repo
//         try {
//           await octokit.repos.get({
//             owner: repoOwner,
//             repo: repoName,
//           });
//         } catch (repoError) {
//           throw new Error(`Cannot access repository ${repoOwner}/${repoName}. Please check that it exists and your token has access to it.`);
//         }

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
//             owner: repoOwner,
//             repo: repoName,
//             title: m.title,
//             description: m.description
//           });
//           createdMilestones.push({
//             number: milestone.number,
//             title: milestone.title,
//             url: milestone.html_url,
//           });
//         }
        
//         // 2. Create the epic
//         const { data: epicIssue } = await octokit.issues.create({
//           owner: repoOwner,
//           repo: repoName,
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
//             owner: repoOwner,
//             repo: repoName,
//             title: story,
//             body: `Part of Epic: #${epicIssue.number}`,
//             labels: ["user-story"]
//           });
//           createdStories.push({
//             number: storyIssue.number,
//             title: storyIssue.title,
//             url: storyIssue.html_url,
//           });
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
//             owner: repoOwner,
//             repo: repoName,
//             title: `🧩 ${category}`,
//             body: `Part of Epic: #${epicIssue.number}\n\n## Tasks:\n${tasks.map(t => `- [ ] ${t}`).join('\n')}`,
//             labels: ["task"]
//           });
//           createdTasks.push({
//             number: categoryIssue.number,
//             title: categoryIssue.title,
//             url: categoryIssue.html_url,
//           });
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
//           owner: repoOwner,
//           repo: repoName,
//           issue_number: epicIssue.number,
//           body: epicBody
//         });
        
//         return {
//           success: true,
//           epic: {
//             number: epicIssue.number,
//             title: epicIssue.title,
//             url: epicIssue.html_url
//           },
//           userStories: createdStories,
//           tasks: createdTasks,
//           milestones: createdMilestones,
//           message: "Successfully created QF integration project structure in GitHub"
//         };
//       } catch (error) {
//         console.error("Error creating QF Integration Project:", error);
//         const errorMessage = error instanceof Error ? 
//           error.message : 
//           'Unknown error creating QF integration project';
          
//         throw new Error(`Failed to create QF Integration Project: ${errorMessage}`);
//       }
//     }),
}); 