import { Octokit } from "@octokit/rest";

// Project-specific GitHub settings
export interface GitHubProjectSettings {
  owner: string;
  repo: string;
  validAssignees: string[];
}

// Default settings for fallback
export const DEFAULT_SETTINGS: GitHubProjectSettings = {
  owner: "akashic-fund",
  repo: "akashic",
  validAssignees: ["0xshikhar", "prajjawalk", "positonic"]
};

// Types
export interface IssueInput {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  repo?: string;
  owner?: string;
  type?: "user-story" | "task" | "epic";
}

export interface IssueResult {
  id: number;
  number: number;
  title: string;
  url: string;
}

export interface MilestoneInput {
  title: string;
  description?: string;
  due_on?: string;
  repo: string;
  owner: string;
}

export interface MilestoneResult {
  number: number;
  title: string;
  url: string;
}

/**
 * Initializes the GitHub client with the provided token
 */
export function initGithubClient(token: string): Octokit {
  if (!token) {
    throw new Error("GitHub token not configured. Please add GITHUB_TOKEN to your .env file.");
  }
  return new Octokit({ auth: token });
}

/**
 * Parses repository information to handle both "owner/repo" format and separate values
 */
export function parseRepoInfo(owner: string, repo: string): { repoOwner: string; repoName: string } {
  let repoOwner = owner;
  let repoName = repo;
  
  // Handle case where repo might be "owner/repo" format
  if (repoName.includes('/')) {
    const parts = repoName.split('/');
    repoOwner = parts[0] || repoOwner;
    repoName = parts[1] || repoName;
  }
  
  return { repoOwner, repoName };
}

/**
 * Validates that a repository exists and is accessible
 */
export async function validateRepository(
  octokit: Octokit, 
  owner: string, 
  repo: string
): Promise<void> {
  try {
    await octokit.repos.get({
      owner,
      repo,
    });
  } catch (repoError) {
    console.error("Repository access error:", repoError);
    throw new Error(`Cannot access repository ${owner}/${repo}. Please check that it exists and your token has access to it.`);
  }
}

/**
 * Validates assignees exist in the repository and are in the valid assignees list
 */
export async function validateAssignees(
  octokit: Octokit,
  settings: GitHubProjectSettings,
  assignees?: string[]
): Promise<string[]> {
  if (!assignees?.length) return [];
  
  // Filter assignees to only include those in the valid assignees list
  return assignees.filter(assignee => settings.validAssignees.includes(assignee));
}

/**
 * Creates an issue in the specified repository
 */
export async function createIssue(
  octokit: Octokit,
  input: IssueInput,
  settings: GitHubProjectSettings = DEFAULT_SETTINGS
): Promise<IssueResult> {
  // Use settings or input values with fallback to defaults
  const repoOwner = input.owner || settings.owner;
  const repoName = input.repo || settings.repo;
  
  // Add type-based label if provided
  const labels = input.labels || [];
  if (input.type && !labels.includes(input.type)) {
    labels.push(input.type);
  }
  
  // Validate repository
  await validateRepository(octokit, repoOwner, repoName);
  
  // Validate and filter assignees
  const validAssignees = await validateAssignees(octokit, settings, input.assignees);
  
  // Create the issue
  try {
    const { data: issue } = await octokit.issues.create({
      owner: repoOwner,
      repo: repoName,
      title: input.title,
      body: input.body,
      labels,
      assignees: validAssignees,
    });
    
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
    };
  } catch (error) {
    console.error('Error creating GitHub issue:', error);
    const errorMessage = error instanceof Error ? 
      error.message : 
      'Unknown error creating GitHub issue';
      
    throw new Error(`Failed to create GitHub issue: ${errorMessage}`);
  }
}

/**
 * Creates a milestone in the specified repository
 */
export async function createMilestone(
  octokit: Octokit,
  input: MilestoneInput,
  settings: GitHubProjectSettings = DEFAULT_SETTINGS
): Promise<MilestoneResult> {
  // Use settings or input values with fallback to defaults
  const repoOwner = input.owner || settings.owner;
  const repoName = input.repo || settings.repo;
  
  // Validate repository
  await validateRepository(octokit, repoOwner, repoName);
  
  // Create the milestone
  try {
    const { data: milestone } = await octokit.issues.createMilestone({
      owner: repoOwner,
      repo: repoName,
      title: input.title,
      description: input.description,
      due_on: input.due_on,
    });
    
    return {
      number: milestone.number,
      title: milestone.title,
      url: milestone.html_url,
    };
  } catch (error) {
    console.error('Error creating GitHub milestone:', error);
    const errorMessage = error instanceof Error ? 
      error.message : 
      'Unknown error creating GitHub milestone';
      
    throw new Error(`Failed to create GitHub milestone: ${errorMessage}`);
  }
}
