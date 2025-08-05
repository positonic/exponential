import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import * as githubService from "~/server/services/githubService";

export const githubRouter = createTRPCRouter({
  createIssue: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        body: z.string(),
        labels: z.array(z.string()).optional(),
        assignees: z.array(z.string()).optional(),
        repo: z.string().default(githubService.DEFAULT_SETTINGS.repo),
        owner: z.string().default(githubService.DEFAULT_SETTINGS.owner),
        type: z.enum(["user-story", "task", "epic"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Initialize GitHub client
      console.log("GITHUB_TOKEN", process.env.GITHUB_TOKEN);
      const octokit = githubService.initGithubClient(process.env.GITHUB_TOKEN || "");
      
      // Create the issue using the shared service
      const issue = await githubService.createIssue(octokit, input);
      
      return {
        success: true,
        issue,
      };
    }),

  createMilestone: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        due_on: z.string().optional(),
        repo: z.string().default(githubService.DEFAULT_SETTINGS.repo),
        owner: z.string().default(githubService.DEFAULT_SETTINGS.owner),
      })
    )
    .mutation(async ({ input }) => {
      // Initialize GitHub client
      const octokit = githubService.initGithubClient(process.env.GITHUB_TOKEN || "");
      
      // Create the milestone using the shared service
      const milestone = await githubService.createMilestone(octokit, input);
      
      return {
        success: true,
        milestone,
      };
    }),

  createEpic: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string(),
        user_stories: z.array(z.string()).optional(),
        repo: z.string().default(githubService.DEFAULT_SETTINGS.repo),
        owner: z.string().default(githubService.DEFAULT_SETTINGS.owner),
      })
    )
    .mutation(async ({ input }) => {
      // Initialize GitHub client
      const octokit = githubService.initGithubClient(process.env.GITHUB_TOKEN || "");
      
      // Process input 
      const { repoOwner, repoName } = githubService.parseRepoInfo(input.owner, input.repo);
      
      // Validate repository
      await githubService.validateRepository(octokit, repoOwner, repoName);

      try {
        // Create main epic issue
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
          let epicChecklist = `## User Stories\n\n`;
          
          for (const storyTitle of input.user_stories) {
            const storyIssue = await githubService.createIssue(octokit, {
              owner: repoOwner,
              repo: repoName,
              title: storyTitle,
              body: `Part of Epic: #${epicIssue.number}`,
              labels: ["user-story"],
            });
            
            userStoryIssues.push(storyIssue);
            epicChecklist += `- [ ] #${storyIssue.number} - ${storyIssue.title}\n`;
          }
          
          // Update epic with checklist
          await octokit.issues.update({
            owner: repoOwner,
            repo: repoName,
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
        const errorMessage = error instanceof Error ? 
          error.message : 
          'Unknown error creating GitHub epic';
          
        throw new Error(`Failed to create GitHub epic: ${errorMessage}`);
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