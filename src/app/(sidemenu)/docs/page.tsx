"use client";

import { Container, Title, Text, Tabs, Card, ThemeIcon, Accordion, Code, Button, CopyButton } from "@mantine/core";
import { 
  IconBrain, 
  IconCode, 
  IconRocket, 
  IconSettings, 
  IconKey, 
  IconBrandGithub,
  IconCopy,
  IconCheck,
  IconTerminal2,
  IconApi,
  IconBrandPython,
  IconBrandTypescript,
  IconNetwork,
  IconDatabase,
  IconGitBranch,
  IconPlug,
  IconBrandSlack,
  IconShare,
  IconMicrophone2,
  IconBell,
  IconUsers,
  IconShield,
  IconAlertCircle,
  IconBolt,
  IconArrowRight
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import { CodeHighlight } from '@mantine/code-highlight';
import '@mantine/code-highlight/styles.css';

const quickStartCode = `import { ExponentialAI } from '@exponential/ai';

// Initialize the AI assistant
const ai = new ExponentialAI({
  apiKey: process.env.EXPONENTIAL_API_KEY
});

// Create a new task with natural language
await ai.createTask({
  description: "Schedule a team meeting for next Tuesday",
  project: "Team Sync"
});`;

const pythonExample = `from exponential import ExponentialAI

# Initialize the AI assistant
ai = ExponentialAI(api_key=os.environ["EXPONENTIAL_API_KEY"])

# Create a new project with AI assistance
project = ai.create_project(
    name="Marketing Campaign",
    description="Q4 Social Media Strategy",
    deadline="2024-12-31"
)

# Let AI suggest and create tasks
tasks = ai.suggest_tasks(project)
print(f"AI suggested {len(tasks)} tasks for your project")`;

const apiExample = `curl -X POST https://api.exponential.ai/v1/tasks \\
  -H "Authorization: Bearer $EXPONENTIAL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "description": "Research competitor pricing",
    "project": "Market Analysis",
    "deadline": "2024-04-01",
    "priority": "high"
  }'`;

const configExample = `{
  "aiModel": "gpt-4",
  "language": "en",
  "timezone": "UTC",
  "features": {
    "autoScheduling": true,
    "taskSuggestions": true,
    "projectAnalytics": true
  }
}`;

interface DocSection {
  title: string;
  icon: React.ElementType;
  content: string;
  code?: string;
  language?: string;
}

const gettingStarted: DocSection[] = [
  {
    title: "Installation",
    icon: IconRocket,
    content: "Get started with Exponential AI in your project. Install via npm or yarn.",
    code: "npm install @exponential/ai",
    language: "bash"
  },
  {
    title: "Authentication",
    icon: IconKey,
    content: "Set up your API key and initialize the Exponential AI client.",
    code: quickStartCode,
    language: "typescript"
  },
  {
    title: "Configuration",
    icon: IconSettings,
    content: "Configure your Exponential AI instance with custom settings and preferences.",
    code: configExample,
    language: "json"
  }
];

const features = [
  {
    title: "Natural Language Processing",
    icon: IconBrain,
    description: "Create tasks and projects using natural language. Our AI understands context and intent.",
    example: "Schedule a team meeting for next Tuesday at 2 PM with the marketing team"
  },
  {
    title: "API Integration",
    icon: IconApi,
    description: "Integrate with your existing tools and workflows using our comprehensive API.",
    example: apiExample
  },
  {
    title: "Multiple Language Support",
    icon: IconCode,
    description: "Use Exponential AI with your preferred programming language.",
    examples: {
      python: pythonExample,
      typescript: quickStartCode
    }
  }
];

const architectureData = [
  {
    title: "Integrations vs Workflows",
    icon: IconNetwork,
    sections: [
      {
        title: "Integrations - The Connection Layer",
        icon: IconPlug,
        description: "Establishes and manages connections to external services",
        characteristics: [
          "Authentication & Credentials: Stores API keys, OAuth tokens, signing secrets",
          "Service Identity: Defines which external service (Fireflies, Slack, Notion, Monday.com)",
          "Connection Management: Tests connectivity, manages token expiration",
          "Scope: Can be personal or team-level",
          "Static Configuration: Represents the capability to connect to a service"
        ],
        example: "\"Slack Integration for Team Workspace\" - stores bot tokens, team IDs, signing secrets"
      },
      {
        title: "Workflows - The Automation Layer", 
        icon: IconGitBranch,
        description: "Defines automated processes that use integrations to sync data",
        characteristics: [
          "Process Definition: Specifies how data flows (push/pull/bidirectional)",
          "Business Logic: Maps fields, transforms data, handles conflicts",
          "Execution Tracking: Creates WorkflowRun records to track each execution",
          "Frequency Control: Manual, hourly, daily, weekly execution",
          "Depends on Integration: Uses the connection established by an Integration"
        ],
        example: "\"Sync Fireflies Actions to Notion Database\" - uses a Notion integration to push transcribed actions"
      }
    ]
  },
  {
    title: "Data Flow Architecture",
    icon: IconDatabase,
    sections: [
      {
        title: "Relationship Chain",
        description: "How the components work together",
        flow: "Integration (Authentication) → Workflow (Process) → WorkflowRun (Execution History)",
        details: [
          "Integration: API Keys/Tokens, Connection test, Service credentials",
          "Workflow: Field mappings, Sync direction, Business rules", 
          "WorkflowRun: Success/failure logs, Items processed counts, Error messages"
        ]
      },
      {
        title: "Key Distinctions",
        description: "Understanding the separation of concerns",
        comparison: [
          { aspect: "Focus", integration: "Connection capability", workflow: "Automated processes" },
          { aspect: "Reusability", integration: "One integration → Many workflows", workflow: "One workflow → One specific process" },
          { aspect: "Configuration", integration: "Authentication details", workflow: "Business logic & field mappings" },
          { aspect: "Execution", integration: "Connection testing", workflow: "Data synchronization" },
          { aspect: "History", integration: "Creation/update timestamps", workflow: "Detailed run history with metrics" }
        ]
      }
    ]
  },
  {
    title: "Real-World Example",
    icon: IconBrain,
    sections: [
      {
        title: "Complete Workflow Setup",
        description: "How integrations and workflows work together in practice",
        example: {
          integration: "\"James's Notion Workspace Connection\" (stores access token, tests API connectivity)",
          workflows: [
            "\"Push Fireflies Meeting Actions to Project Tasks DB\" (uses that Notion integration)",
            "\"Pull completed tasks from Tasks DB to mark local actions complete\" (uses same Notion integration)"
          ],
          workflowRun: "Each time Workflow #1 executes, creating tracking records with success/failure details"
        },
        benefits: [
          "Reuse connections across multiple automation processes",
          "Manage authentication separately from business logic",
          "Track execution history independently for each automation", 
          "Configure different sync behaviors using the same external service connection"
        ]
      }
    ]
  }
];

// Slack Integration Documentation
const slackIntegrationData = [
  {
    title: "Overview",
    icon: IconBrandSlack,
    description: "The Slack integration allows your team to interact with Exponential directly from Slack channels and DMs. Team members can chat with Paddy (your AI project manager), create tasks, access meeting transcriptions, and manage projects without leaving Slack.",
    features: [
      "🤖 Chat with Paddy: Natural language conversations with your AI project manager",
      "📋 Task Management: Create, list, and manage actions and projects",
      "📞 Meeting Access: Query meeting transcriptions and project data", 
      "👥 Team-Level Access: All team members can use the integration (not just the installer)",
      "🔐 Secure Authentication: User-specific authentication with proper team scoping"
    ]
  },
  {
    title: "Setup Process",
    icon: IconSettings,
    description: "Setting up the Slack integration requires creating a Slack app and configuring it with the proper credentials.",
    steps: [
      {
        step: 1,
        title: "Create Slack App",
        description: "Visit api.slack.com/apps to create a new Slack app for your workspace",
        details: ["Choose 'From scratch' option", "Enter app name (e.g., 'Exponential AI')", "Select your workspace", "Click 'Create App'"]
      },
      {
        step: 2,
        title: "Configure Bot Permissions",
        description: "Add the required OAuth scopes for the bot to function properly",
        scopes: ["app_mentions:read", "channels:history", "chat:write", "commands", "im:history", "im:read", "im:write", "users:read", "channels:read", "groups:read", "mpim:read"]
      },
      {
        step: 3,
        title: "Get Credentials",
        description: "Collect the necessary tokens and secrets from your Slack app configuration",
        credentials: [
          { name: "Bot Token", location: "OAuth & Permissions > Bot User OAuth Token", format: "xoxb-..." },
          { name: "Signing Secret", location: "Basic Information > Signing Secret", format: "hex string" },
          { name: "App ID", location: "Basic Information > App ID", format: "A1234567890" }
        ]
      },
      {
        step: 4,
        title: "Add to Exponential",
        description: "Create the integration in Exponential with your Slack app credentials",
        process: "Go to Integrations → Add Integration → Slack, then enter your Bot Token, Signing Secret, and App ID"
      }
    ]
  },
  {
    title: "Channel Configuration",
    icon: IconBell,
    description: "Configure where Slack notifications are sent for different projects and teams.",
    currentIssue: {
      title: "⚠️ Current Permission Limitation",
      description: "Currently, only the person who installed the Slack integration can configure channel notifications. This means project owners cannot set up notifications for their own projects unless they installed the integration.",
      impact: "This limits the flexibility of teams and prevents proper delegation of project management tasks."
    },
    configuration: {
      title: "How Channel Configuration Works",
      hierarchy: [
        "1. Project-specific channel (highest priority)",
        "2. Team default channel (fallback)", 
        "3. Integration default channel (last resort)"
      ],
      setup: [
        "Navigate to Project → Integrations → Slack Channel Notifications",
        "Select your Slack workspace integration",
        "Choose or enter a channel name (#channel-name)",
        "Save configuration"
      ]
    }
  },
  {
    title: "Meeting Notifications",
    icon: IconMicrophone2,
    description: "Automatic and manual Slack notifications for meeting summaries and action items.",
    workflows: [
      {
        type: "Automatic Flow",
        steps: ["Fireflies webhook receives meeting data", "Meeting gets processed and assigned to project", "Action items are extracted", "Slack notification sent automatically (if channel configured)"],
        trigger: "Happens automatically when meetings are processed"
      },
      {
        type: "Manual Flow", 
        steps: ["User views meeting in Meetings page", "Clicks 'Send to Slack' button", "Meeting summary sent to configured channel"],
        trigger: "User-initiated for processed meetings"
      }
    ],
    features: [
      "Deduplication: Won't send duplicate notifications",
      "Rich formatting: Meeting title, summary, action items, attendees",
      "Project context: Shows which project the meeting belongs to",
      "Action item details: Includes assignees and due dates where available"
    ]
  },
  {
    title: "User Registration System",
    icon: IconUsers,
    description: "Secure self-service registration system that allows team members to connect their Slack accounts to Exponential.",
    security: {
      problem: "Previously, unknown Slack users were automatically mapped to integration installers, creating a security vulnerability",
      solution: "New registration system requires explicit authentication and team membership verification"
    },
    process: [
      "Unauthorized user tries to use Slack bot",
      "System generates secure registration token (24-hour expiration)",
      "User receives registration link in Slack",
      "User authenticates with Exponential account",
      "System verifies team membership (if applicable)",
      "User mapping created, enabling Slack bot access"
    ],
    security_features: [
      "24-hour token expiration",
      "Single-use registration tokens",
      "Team membership verification",
      "Audit trail of all registrations",
      "Cryptographically secure tokens"
    ]
  },
  {
    title: "Troubleshooting",
    icon: IconAlertCircle,
    description: "Common issues and solutions for Slack integration problems.",
    issues: [
      {
        problem: "Bot doesn't respond to messages",
        causes: ["Bot not invited to channel", "Invalid bot token", "Missing permissions"],
        solutions: ["Invite bot with /invite @YourBotName", "Check bot token in integration settings", "Verify OAuth scopes match requirements"]
      },
      {
        problem: "Cannot configure Slack channels",
        causes: ["User didn't install the integration", "Missing team permissions"],
        solutions: ["Ask integration owner to configure channels", "Wait for permission sharing system (coming soon)", "Install your own Slack integration"]
      },
      {
        problem: "Meeting notifications not sending",
        causes: ["No channel configured", "Bot not in private channel", "Integration inactive"],
        solutions: ["Configure channel in project settings", "Invite bot to private channels", "Check integration status in Integrations page"]
      }
    ]
  }
];

// Integration Management Documentation
const integrationManagementData = [
  {
    title: "Current System",
    icon: IconPlug,
    description: "How integrations currently work in Exponential and the ownership model.",
    ownership_model: {
      personal: {
        title: "Personal Integrations",
        description: "Integrations created by individual users for their personal use",
        characteristics: ["Only the creator can configure and use", "Tied to user's personal API keys/credentials", "Cannot be shared with team members", "Deleted when user is removed"]
      },
      team: {
        title: "Team Integrations", 
        description: "Integrations created for team-wide use",
        characteristics: ["Created by team member but owned by team", "All team members can use in workflows", "Only creator can configure channel settings", "Persist when creator leaves team"]
      }
    },
    current_limitations: [
      "Integration owners have exclusive configuration access",
      "Project owners cannot configure integrations they didn't install",
      "Team admins cannot manage integrations installed by others",
      "No granular permission system for different integration features"
    ]
  },
  {
    title: "The Permission Problem",
    icon: IconShield,
    description: "Why the current system creates friction and blocks productivity.",
    scenarios: [
      {
        title: "Project Owner Blocked",
        problem: "Alice owns Project X but cannot configure Slack notifications because Bob installed the Slack integration",
        impact: "Alice must ask Bob every time she wants to change notification settings for her own project"
      },
      {
        title: "Team Admin Limitation",
        problem: "Carol is team admin but cannot manage integrations because individual team members installed them",
        impact: "Team-wide integration management becomes fragmented and inconsistent"
      },
      {
        title: "Integration Owner Leaves",
        problem: "When David leaves the company, his personal integrations become inaccessible to the team",
        impact: "Workflows break and configurations cannot be updated without reinstalling integrations"
      }
    ],
    root_cause: "Integration configuration permissions are tied to installation ownership rather than contextual authority (project ownership, team admin role, etc.)"
  },
  {
    title: "Planned Solution: Permission Sharing",
    icon: IconShare,
    description: "A flexible permission sharing system that allows integration owners to grant access while maintaining security.",
    permission_types: [
      {
        name: "CONFIGURE_CHANNELS",
        description: "Can set up Slack channel configurations for projects/teams",
        use_case: "Project owners configuring notifications for their projects"
      },
      {
        name: "VIEW_INTEGRATION", 
        description: "Can see integration in lists and test connections",
        use_case: "Team members checking integration status"
      },
      {
        name: "USE_IN_WORKFLOWS",
        description: "Can use integration in automated workflows (current behavior)",
        use_case: "Existing workflow functionality"
      }
    ],
    sharing_scopes: [
      {
        scope: "Global",
        description: "Full access to all integration features across all projects/teams",
        use_case: "Trusted team members or co-administrators"
      },
      {
        scope: "Team-wide",
        description: "Access to use integration for any project within a specific team", 
        use_case: "Team admins managing team projects"
      },
      {
        scope: "Project-specific",
        description: "Access limited to specific projects",
        use_case: "Project owners configuring their own projects"
      }
    ]
  },
  {
    title: "Migration & Compatibility",
    icon: IconArrowRight,
    description: "How existing integrations and configurations will be preserved during the transition.",
    backward_compatibility: [
      "All existing channel configurations remain functional",
      "Current integration ownership unchanged",
      "No interruption to existing Fireflies → Slack workflows",
      "Automatic grandfathering of existing project configurations"
    ],
    migration_features: [
      "Team integrations automatically share with team admins (configurable)",
      "Migration script to identify orphaned configurations",
      "Permission suggestions for common scenarios",
      "Gradual rollout with fallback to current system"
    ],
    health_checks: [
      "Detect when users can't configure channels for their projects",
      "Suggest relevant integrations when creating new projects", 
      "Auto-suggest permission sharing when access issues detected",
      "Regular audit of integration permissions and usage"
    ]
  }
];

// Fireflies Workflow Documentation  
const firefliesWorkflowData = [
  {
    title: "Overview",
    icon: IconMicrophone2,
    description: "How Fireflies meetings automatically flow through Exponential to create actions and send notifications.",
    workflow_types: [
      {
        type: "Automatic Processing",
        description: "Meetings are processed automatically when Fireflies webhook is received",
        trigger: "Fireflies webhook → transcription processing → action extraction → Slack notifications"
      },
      {
        type: "Manual Processing", 
        description: "Users can manually trigger processing and notifications from the Meetings page",
        trigger: "User clicks 'Process Meeting' or 'Send to Slack' buttons"
      }
    ],
    benefits: [
      "Zero manual intervention for routine meeting processing",
      "Consistent action item extraction across all meetings",
      "Automatic team notifications via Slack",
      "Full audit trail of what was processed when"
    ]
  },
  {
    title: "Processing Pipeline",
    icon: IconBolt,
    description: "The complete flow from Fireflies webhook to action items and notifications.",
    pipeline_steps: [
      {
        step: 1,
        title: "Webhook Reception",
        description: "Fireflies sends meeting data via webhook",
        details: ["Meeting transcript and summary received", "Attendee information included", "Meeting metadata (title, date, duration) captured"],
        code: `// Webhook endpoint: /api/webhooks/fireflies
// Receives: transcript, summary, attendees, metadata`
      },
      {
        step: 2,
        title: "Project Association",
        description: "Meeting gets linked to a project (manual or automatic)",
        details: ["User can assign meeting to project", "Project assignment required for action processing", "Team context established through project"],
        code: `// Database update
transcription.projectId = selectedProject.id
transcription.processedAt = null // Reset for reprocessing`
      },
      {
        step: 3,
        title: "Action Item Extraction",
        description: "AI extracts actionable items from meeting content", 
        details: ["Natural language processing identifies tasks", "Assignees detected from meeting context", "Due dates extracted where mentioned", "Priority levels inferred"],
        code: `// FirefliesService.parseActionItems()
const actionItems = extractActionItems(summary)
// Returns: { description, assignee, dueDate, priority }`
      },
      {
        step: 4,
        title: "Multi-Processor Execution",
        description: "Action items sent to all configured processors",
        details: ["Internal actions created in database", "External systems updated (Notion, Monday.com)", "Slack notifications prepared", "Error handling and retry logic"],
        code: `// ActionProcessorFactory creates processors for:
// - Internal database
// - Slack notifications  
// - External integrations (Notion, Monday)`
      },
      {
        step: 5,
        title: "Slack Notification",
        description: "Rich notification sent to configured Slack channels",
        details: ["Meeting summary and action items formatted", "Channel resolved via project → team hierarchy", "Deduplication prevents double-sending", "Notification timestamp recorded"],
        code: `// SlackNotificationService.sendNotification()
// Channel resolution: project > team > integration default`
      }
    ]
  },
  {
    title: "Channel Resolution",
    icon: IconArrowRight,
    description: "How the system decides where to send Slack notifications.",
    resolution_hierarchy: [
      {
        priority: 1,
        title: "Project-specific Channel",
        description: "Highest priority - notifications go to channel configured for the specific project",
        example: "Project 'Website Redesign' configured to send to #website-updates"
      },
      {
        priority: 2,
        title: "Team Default Channel", 
        description: "Fallback - uses team's default Slack channel if no project-specific channel",
        example: "Marketing team default channel #marketing-general"
      },
      {
        priority: 3,
        title: "Integration Default",
        description: "Last resort - uses whatever channel the integration was configured with",
        example: "Slack integration's default #general channel"
      }
    ],
    configuration_code: `// SlackChannelResolver.resolveChannel()
const channelConfig = await SlackChannelResolver.resolveChannel(
  transcription.projectId,
  transcription.project?.teamId
);

if (!channelConfig.channel) {
  return { success: false, error: 'No Slack channel configured' };
}`
  },
  {
    title: "Notification Features",
    icon: IconBell,
    description: "Rich Slack message formatting and notification options.",
    message_format: {
      title: "Rich Message Structure",
      components: [
        "📞 Meeting title and duration",
        "👥 Attendee list", 
        "📝 AI-generated summary",
        "✅ Action items with assignees",
        "🔗 Link to full transcript",
        "📊 Project context"
      ]
    },
    notification_modes: [
      {
        mode: "Auto-notify",
        description: "Notifications sent immediately when meetings are processed",
        use_case: "Real-time updates for active projects"
      },
      {
        mode: "Manual approval",
        description: "Notifications require user approval before sending",
        use_case: "Sensitive meetings or selective sharing"
      },
      {
        mode: "Digest mode", 
        description: "Multiple meeting summaries batched into daily/weekly digests",
        use_case: "High-volume meeting environments"
      }
    ],
    deduplication: {
      mechanism: "slackNotificationAt timestamp prevents duplicate sends",
      benefits: ["No spam from repeated processing", "Clear audit trail of when notifications were sent", "Safe to re-run processing without notification spam"]
    }
  },
  {
    title: "Configuration Options",
    icon: IconSettings,
    description: "How to configure and customize the Fireflies workflow for your needs.",
    project_settings: [
      "Enable/disable automatic processing",
      "Configure Slack channel for notifications",
      "Set processing preferences (auto vs manual)",
      "Choose notification format and timing"
    ],
    team_settings: [
      "Default Slack channel for team projects",
      "Team-wide processing preferences",
      "Integration sharing permissions",
      "Notification digest schedules"
    ],
    advanced_features: [
      {
        feature: "Custom Action Processors",
        description: "Create custom processors for specific workflows",
        example: "Send high-priority action items to project management tools"
      },
      {
        feature: "Conditional Notifications",
        description: "Send notifications based on meeting content or participants",
        example: "Only notify for meetings with external clients"
      },
      {
        feature: "Integration Templates",
        description: "Pre-configured workflows for common meeting types",
        example: "Daily standup vs client call vs retrospective templates"
      }
    ]
  }
];

export default function DocsPage() {
  return (
    <Container size="lg" py="xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <Title
          className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent mb-4"
        >
          Documentation
        </Title>
        <Text c="dimmed" size="xl" className="max-w-3xl mx-auto">
          Learn how to integrate and use Exponential AI in your projects.
        </Text>
      </motion.div>

      <Tabs defaultValue="getting-started" color="violet">
        <Tabs.List grow>
          <Tabs.Tab value="getting-started" leftSection={<IconRocket size={16} />}>
            Getting Started
          </Tabs.Tab>
          <Tabs.Tab value="features" leftSection={<IconBrain size={16} />}>
            Features
          </Tabs.Tab>
          <Tabs.Tab value="slack-integration" leftSection={<IconBrandSlack size={16} />}>
            Slack Integration
          </Tabs.Tab>
          <Tabs.Tab value="integrations" leftSection={<IconShare size={16} />}>
            Integration Management
          </Tabs.Tab>
          <Tabs.Tab value="fireflies-workflow" leftSection={<IconMicrophone2 size={16} />}>
            Fireflies Workflow
          </Tabs.Tab>
          <Tabs.Tab value="architecture" leftSection={<IconNetwork size={16} />}>
            Architecture
          </Tabs.Tab>
          <Tabs.Tab value="api" leftSection={<IconTerminal2 size={16} />}>
            API Reference
          </Tabs.Tab>
        </Tabs.List>

        <div className="mt-8">
          <Tabs.Panel value="getting-started">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              {gettingStarted.map((section, index) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card withBorder className="mb-6">
                    <div className="flex items-start gap-4 mb-4">
                      <ThemeIcon
                        size={40}
                        radius="md"
                        variant="light"
                        color="violet"
                      >
                        <section.icon size={20} />
                      </ThemeIcon>
                      <div>
                        <Text size="xl" fw={500}>
                          {section.title}
                        </Text>
                        <Text c="dimmed" size="sm">
                          {section.content}
                        </Text>
                      </div>
                    </div>
                    {section.code && (
                      <div className="relative">
                        <CodeHighlight code={section.code} language={section.language}>
                          {section.code}
                        </CodeHighlight>
                        <CopyButton value={section.code}>
                          {({ copied, copy }) => (
                            <Button
                              color={copied ? 'teal' : 'violet'}
                              variant="subtle"
                              size="sm"
                              onClick={copy}
                              className="absolute top-2 right-2"
                            >
                              {copied ? (
                                <IconCheck size={16} />
                              ) : (
                                <IconCopy size={16} />
                              )}
                            </Button>
                          )}
                        </CopyButton>
                      </div>
                    )}
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </Tabs.Panel>

          <Tabs.Panel value="features">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Accordion variant="separated">
                {features.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Accordion.Item value={feature.title} className="mb-4">
                      <Accordion.Control icon={
                        <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                          <feature.icon size={18} />
                        </ThemeIcon>
                      }>
                        <Text size="lg" fw={500}>{feature.title}</Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Text c="dimmed" className="mb-4">
                          {feature.description}
                        </Text>
                        {typeof feature.example === 'string' && (
                          <CodeHighlight code={feature.example} language={feature.title.includes('API') ? 'bash' : 'typescript'} />
                        )}
                        {feature.examples && (
                          <Tabs defaultValue="typescript">
                            <Tabs.List>
                              <Tabs.Tab 
                                value="typescript" 
                                leftSection={<IconBrandTypescript size={16} />}
                              >
                                TypeScript
                              </Tabs.Tab>
                              <Tabs.Tab 
                                value="python" 
                                leftSection={<IconBrandPython size={16} />}
                              >
                                Python
                              </Tabs.Tab>
                            </Tabs.List>
                            <Tabs.Panel value="typescript" pt="xs">
                              <CodeHighlight code={feature.examples.typescript} language="typescript" />
                            </Tabs.Panel>
                            <Tabs.Panel value="python" pt="xs">
                              <CodeHighlight code={feature.examples.python} language="python" />
                            </Tabs.Panel>
                          </Tabs>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  </motion.div>
                ))}
              </Accordion>
            </motion.div>
          </Tabs.Panel>

          <Tabs.Panel value="architecture">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Accordion variant="separated">
                {architectureData.map((section, index) => (
                  <motion.div
                    key={section.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Accordion.Item value={section.title} className="mb-4">
                      <Accordion.Control icon={
                        <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                          <section.icon size={18} />
                        </ThemeIcon>
                      }>
                        <Text size="lg" fw={500}>{section.title}</Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        {section.sections.map((subsection, subIndex) => (
                          <Card key={subIndex} withBorder className="mb-4">
                            <div className="flex items-start gap-3 mb-3">
                              {'icon' in subsection && subsection.icon && (
                                <ThemeIcon size={28} radius="md" color="violet" variant="light">
                                  <subsection.icon size={16} />
                                </ThemeIcon>
                              )}
                              <div>
                                <Text size="md" fw={500} className="mb-2">
                                  {subsection.title}
                                </Text>
                                <Text c="dimmed" size="sm" className="mb-3">
                                  {subsection.description}
                                </Text>
                              </div>
                            </div>
                            
                            {'characteristics' in subsection && subsection.characteristics && (
                              <div className="mb-3">
                                <Text size="sm" fw={500} className="mb-2">Key Characteristics:</Text>
                                <ul className="space-y-1">
                                  {subsection.characteristics.map((char: string, charIndex: number) => (
                                    <li key={charIndex} className="text-sm text-gray-600 dark:text-gray-400">
                                      • {char}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {'example' in subsection && subsection.example && typeof subsection.example === 'string' && (
                              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                                <Text size="sm" fw={500} className="mb-1">Example:</Text>
                                <Text size="sm" c="dimmed" className="italic">
                                  {subsection.example}
                                </Text>
                              </div>
                            )}
                            
                            {'flow' in subsection && subsection.flow && (
                              <div className="mb-3">
                                <Text size="sm" fw={500} className="mb-2">Data Flow:</Text>
                                <Code block className="mb-2">{subsection.flow}</Code>
                                <ul className="space-y-1">
                                  {'details' in subsection && subsection.details?.map((detail: string, detailIndex: number) => (
                                    <li key={detailIndex} className="text-sm text-gray-600 dark:text-gray-400">
                                      • {detail}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {'comparison' in subsection && subsection.comparison && (
                              <div className="mb-3">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="text-left py-2 font-medium">Aspect</th>
                                        <th className="text-left py-2 font-medium">Integration</th>
                                        <th className="text-left py-2 font-medium">Workflow</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {subsection.comparison.map((comp: any, compIndex: number) => (
                                        <tr key={compIndex} className="border-b border-gray-100 dark:border-gray-800">
                                          <td className="py-2 font-medium text-violet-600 dark:text-violet-400">
                                            {comp.aspect}
                                          </td>
                                          <td className="py-2 text-gray-600 dark:text-gray-400">
                                            {comp.integration}
                                          </td>
                                          <td className="py-2 text-gray-600 dark:text-gray-400">
                                            {comp.workflow}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            
                            {'example' in subsection && subsection.example && typeof subsection.example === 'object' && (
                              <div className="mb-3">
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md border border-blue-200 dark:border-blue-800">
                                  <div className="mb-3">
                                    <Text size="sm" fw={500} className="text-blue-800 dark:text-blue-200 mb-1">
                                      Integration:
                                    </Text>
                                    <Text size="sm" className="text-blue-700 dark:text-blue-300">
                                      {subsection.example.integration}
                                    </Text>
                                  </div>
                                  
                                  <div className="mb-3">
                                    <Text size="sm" fw={500} className="text-blue-800 dark:text-blue-200 mb-1">
                                      Workflows:
                                    </Text>
                                    <ul className="space-y-1">
                                      {subsection.example.workflows?.map((workflow: string, wfIndex: number) => (
                                        <li key={wfIndex} className="text-sm text-blue-700 dark:text-blue-300">
                                          • {workflow}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  
                                  <div>
                                    <Text size="sm" fw={500} className="text-blue-800 dark:text-blue-200 mb-1">
                                      WorkflowRun:
                                    </Text>
                                    <Text size="sm" className="text-blue-700 dark:text-blue-300">
                                      {subsection.example.workflowRun}
                                    </Text>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {'benefits' in subsection && subsection.benefits && (
                              <div>
                                <Text size="sm" fw={500} className="mb-2 text-green-700 dark:text-green-300">
                                  Benefits of this separation:
                                </Text>
                                <ul className="space-y-1">
                                  {subsection.benefits.map((benefit: string, benefitIndex: number) => (
                                    <li key={benefitIndex} className="text-sm text-green-600 dark:text-green-400">
                                      ✓ {benefit}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </Card>
                        ))}
                      </Accordion.Panel>
                    </Accordion.Item>
                  </motion.div>
                ))}
              </Accordion>
            </motion.div>
          </Tabs.Panel>

          {/* Slack Integration Tab */}
          <Tabs.Panel value="slack-integration">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Accordion variant="separated">
                {slackIntegrationData.map((section, index) => (
                  <motion.div
                    key={section.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Accordion.Item value={section.title} className="mb-4">
                      <Accordion.Control icon={
                        <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                          <section.icon size={18} />
                        </ThemeIcon>
                      }>
                        <Text size="lg" fw={500}>{section.title}</Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Text c="dimmed" className="mb-4">
                          {section.description}
                        </Text>

                        {section.features && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Key Features:</Text>
                            <ul className="space-y-1">
                              {section.features.map((feature, featureIndex) => (
                                <li key={featureIndex} className="text-sm text-gray-600 dark:text-gray-400">
                                  {feature}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {section.steps && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Setup Steps:</Text>
                            {section.steps.map((step, stepIndex) => (
                              <Card key={stepIndex} withBorder className="mb-3">
                                <div className="flex items-start gap-3">
                                  <ThemeIcon size={24} radius="xl" color="violet" variant="light">
                                    <Text size="xs" fw={700}>{step.step}</Text>
                                  </ThemeIcon>
                                  <div className="flex-1">
                                    <Text size="sm" fw={500} className="mb-1">{step.title}</Text>
                                    <Text size="xs" c="dimmed" className="mb-2">{step.description}</Text>
                                    
                                    {step.details && (
                                      <ul className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                        {step.details.map((detail, detailIndex) => (
                                          <li key={detailIndex}>• {detail}</li>
                                        ))}
                                      </ul>
                                    )}
                                    
                                    {step.scopes && (
                                      <div>
                                        <Text size="xs" fw={500} className="mb-1">Required OAuth Scopes:</Text>
                                        <div className="flex flex-wrap gap-1">
                                          {step.scopes.map((scope, scopeIndex) => (
                                            <Code key={scopeIndex}>{scope}</Code>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {step.credentials && (
                                      <div>
                                        <Text size="xs" fw={500} className="mb-1">Required Credentials:</Text>
                                        {step.credentials.map((cred, credIndex) => (
                                          <div key={credIndex} className="mb-1">
                                            <Text size="xs" fw={500}>{cred.name}:</Text>
                                            <Text size="xs" c="dimmed">{cred.location} ({cred.format})</Text>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {step.process && (
                                      <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded text-xs">
                                        {step.process}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}

                        {section.currentIssue && (
                          <Card withBorder className="mb-4 border-orange-200 dark:border-orange-800">
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded">
                              <Text size="sm" fw={500} className="text-orange-800 dark:text-orange-200 mb-2">
                                {section.currentIssue.title}
                              </Text>
                              <Text size="sm" className="text-orange-700 dark:text-orange-300 mb-2">
                                {section.currentIssue.description}
                              </Text>
                              <Text size="xs" className="text-orange-600 dark:text-orange-400">
                                <strong>Impact:</strong> {section.currentIssue.impact}
                              </Text>
                            </div>
                          </Card>
                        )}

                        {section.configuration && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">{section.configuration.title}</Text>
                            {section.configuration.hierarchy && (
                              <div className="mb-2">
                                <Text size="xs" fw={500} className="mb-1">Priority Hierarchy:</Text>
                                <ul className="text-xs text-gray-600 dark:text-gray-400">
                                  {section.configuration.hierarchy.map((item, itemIndex) => (
                                    <li key={itemIndex}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {section.configuration.setup && (
                              <div>
                                <Text size="xs" fw={500} className="mb-1">Setup Process:</Text>
                                <ul className="text-xs text-gray-600 dark:text-gray-400">
                                  {section.configuration.setup.map((step, stepIndex) => (
                                    <li key={stepIndex}>• {step}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {section.workflows && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Notification Workflows:</Text>
                            {section.workflows.map((workflow, workflowIndex) => (
                              <Card key={workflowIndex} withBorder className="mb-2">
                                <Text size="sm" fw={500} className="mb-1">{workflow.type}</Text>
                                <Text size="xs" c="dimmed" className="mb-2">{workflow.trigger}</Text>
                                <ol className="text-xs text-gray-600 dark:text-gray-400">
                                  {workflow.steps.map((step, stepIndex) => (
                                    <li key={stepIndex}>{stepIndex + 1}. {step}</li>
                                  ))}
                                </ol>
                              </Card>
                            ))}
                          </div>
                        )}

                        {section.security && (
                          <div className="mb-4">
                            <Card withBorder className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                              <Text size="sm" fw={500} className="text-green-800 dark:text-green-200 mb-2">Security Improvements</Text>
                              <Text size="xs" className="text-green-700 dark:text-green-300 mb-2">
                                <strong>Previous Issue:</strong> {section.security.problem}
                              </Text>
                              <Text size="xs" className="text-green-700 dark:text-green-300">
                                <strong>Current Solution:</strong> {section.security.solution}
                              </Text>
                            </Card>
                          </div>
                        )}

                        {section.process && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Registration Process:</Text>
                            <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                              {section.process.map((step, stepIndex) => (
                                <li key={stepIndex}>{stepIndex + 1}. {step}</li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {section.security_features && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Security Features:</Text>
                            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                              {section.security_features.map((feature, featureIndex) => (
                                <li key={featureIndex}>• {feature}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {section.issues && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Common Issues & Solutions:</Text>
                            {section.issues.map((issue, issueIndex) => (
                              <Card key={issueIndex} withBorder className="mb-3">
                                <Text size="sm" fw={500} className="mb-2 text-red-600 dark:text-red-400">
                                  {issue.problem}
                                </Text>
                                
                                <div className="mb-2">
                                  <Text size="xs" fw={500} className="mb-1">Possible Causes:</Text>
                                  <ul className="text-xs text-gray-600 dark:text-gray-400">
                                    {issue.causes.map((cause, causeIndex) => (
                                      <li key={causeIndex}>• {cause}</li>
                                    ))}
                                  </ul>
                                </div>
                                
                                <div>
                                  <Text size="xs" fw={500} className="mb-1">Solutions:</Text>
                                  <ul className="text-xs text-green-600 dark:text-green-400">
                                    {issue.solutions.map((solution, solutionIndex) => (
                                      <li key={solutionIndex}>• {solution}</li>
                                    ))}
                                  </ul>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  </motion.div>
                ))}
              </Accordion>
            </motion.div>
          </Tabs.Panel>

          {/* Integration Management Tab */}
          <Tabs.Panel value="integrations">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Accordion variant="separated">
                {integrationManagementData.map((section, index) => (
                  <motion.div
                    key={section.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Accordion.Item value={section.title} className="mb-4">
                      <Accordion.Control icon={
                        <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                          <section.icon size={18} />
                        </ThemeIcon>
                      }>
                        <Text size="lg" fw={500}>{section.title}</Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Text c="dimmed" className="mb-4">
                          {section.description}
                        </Text>

                        {section.ownership_model && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Integration Ownership Model:</Text>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Card withBorder className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                                <Text size="sm" fw={500} className="text-blue-800 dark:text-blue-200 mb-2">
                                  {section.ownership_model.personal.title}
                                </Text>
                                <Text size="xs" className="text-blue-700 dark:text-blue-300 mb-2">
                                  {section.ownership_model.personal.description}
                                </Text>
                                <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                                  {section.ownership_model.personal.characteristics.map((char, charIndex) => (
                                    <li key={charIndex}>• {char}</li>
                                  ))}
                                </ul>
                              </Card>
                              
                              <Card withBorder className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                                <Text size="sm" fw={500} className="text-green-800 dark:text-green-200 mb-2">
                                  {section.ownership_model.team.title}
                                </Text>
                                <Text size="xs" className="text-green-700 dark:text-green-300 mb-2">
                                  {section.ownership_model.team.description}
                                </Text>
                                <ul className="text-xs text-green-600 dark:text-green-400 space-y-1">
                                  {section.ownership_model.team.characteristics.map((char, charIndex) => (
                                    <li key={charIndex}>• {char}</li>
                                  ))}
                                </ul>
                              </Card>
                            </div>
                          </div>
                        )}

                        {section.current_limitations && (
                          <Card withBorder className="mb-4 border-orange-200 dark:border-orange-800">
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded">
                              <Text size="sm" fw={500} className="text-orange-800 dark:text-orange-200 mb-2">
                                Current System Limitations
                              </Text>
                              <ul className="text-xs text-orange-700 dark:text-orange-300 space-y-1">
                                {section.current_limitations.map((limitation, limitIndex) => (
                                  <li key={limitIndex}>• {limitation}</li>
                                ))}
                              </ul>
                            </div>
                          </Card>
                        )}

                        {section.scenarios && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Problem Scenarios:</Text>
                            {section.scenarios.map((scenario, scenarioIndex) => (
                              <Card key={scenarioIndex} withBorder className="mb-3">
                                <Text size="sm" fw={500} className="mb-2 text-red-600 dark:text-red-400">
                                  {scenario.title}
                                </Text>
                                <Text size="xs" className="text-gray-700 dark:text-gray-300 mb-1">
                                  <strong>Problem:</strong> {scenario.problem}
                                </Text>
                                <Text size="xs" className="text-gray-700 dark:text-gray-300">
                                  <strong>Impact:</strong> {scenario.impact}
                                </Text>
                              </Card>
                            ))}
                            
                            {section.root_cause && (
                              <Card withBorder className="mt-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                                <Text size="sm" fw={500} className="text-red-800 dark:text-red-200 mb-2">
                                  Root Cause
                                </Text>
                                <Text size="xs" className="text-red-700 dark:text-red-300">
                                  {section.root_cause}
                                </Text>
                              </Card>
                            )}
                          </div>
                        )}

                        {section.permission_types && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Permission Types:</Text>
                            {section.permission_types.map((perm, permIndex) => (
                              <Card key={permIndex} withBorder className="mb-2">
                                <Text size="sm" fw={500} className="mb-1 text-violet-600 dark:text-violet-400">
                                  {perm.name}
                                </Text>
                                <Text size="xs" c="dimmed" className="mb-1">{perm.description}</Text>
                                <Text size="xs" className="text-gray-600 dark:text-gray-400">
                                  <strong>Use case:</strong> {perm.use_case}
                                </Text>
                              </Card>
                            ))}
                          </div>
                        )}

                        {section.sharing_scopes && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Sharing Scopes:</Text>
                            {section.sharing_scopes.map((scope, scopeIndex) => (
                              <Card key={scopeIndex} withBorder className="mb-2">
                                <Text size="sm" fw={500} className="mb-1 text-indigo-600 dark:text-indigo-400">
                                  {scope.scope} Access
                                </Text>
                                <Text size="xs" c="dimmed" className="mb-1">{scope.description}</Text>
                                <Text size="xs" className="text-gray-600 dark:text-gray-400">
                                  <strong>Use case:</strong> {scope.use_case}
                                </Text>
                              </Card>
                            ))}
                          </div>
                        )}

                        {section.backward_compatibility && (
                          <div className="mb-4">
                            <Card withBorder className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                              <Text size="sm" fw={500} className="text-green-800 dark:text-green-200 mb-2">
                                Backward Compatibility
                              </Text>
                              <ul className="text-xs text-green-700 dark:text-green-300 space-y-1">
                                {section.backward_compatibility.map((item, itemIndex) => (
                                  <li key={itemIndex}>✓ {item}</li>
                                ))}
                              </ul>
                            </Card>
                          </div>
                        )}

                        {section.migration_features && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Migration Features:</Text>
                            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                              {section.migration_features.map((feature, featureIndex) => (
                                <li key={featureIndex}>• {feature}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {section.health_checks && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Health Checks & Smart Features:</Text>
                            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                              {section.health_checks.map((check, checkIndex) => (
                                <li key={checkIndex}>• {check}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  </motion.div>
                ))}
              </Accordion>
            </motion.div>
          </Tabs.Panel>

          {/* Fireflies Workflow Tab */}
          <Tabs.Panel value="fireflies-workflow">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Accordion variant="separated">
                {firefliesWorkflowData.map((section, index) => (
                  <motion.div
                    key={section.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Accordion.Item value={section.title} className="mb-4">
                      <Accordion.Control icon={
                        <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                          <section.icon size={18} />
                        </ThemeIcon>
                      }>
                        <Text size="lg" fw={500}>{section.title}</Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Text c="dimmed" className="mb-4">
                          {section.description}
                        </Text>

                        {section.workflow_types && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Workflow Types:</Text>
                            {section.workflow_types.map((workflow, workflowIndex) => (
                              <Card key={workflowIndex} withBorder className="mb-2">
                                <Text size="sm" fw={500} className="mb-1 text-violet-600 dark:text-violet-400">
                                  {workflow.type}
                                </Text>
                                <Text size="xs" c="dimmed" className="mb-1">{workflow.description}</Text>
                                <Text size="xs" className="text-gray-600 dark:text-gray-400">
                                  <strong>Trigger:</strong> {workflow.trigger}
                                </Text>
                              </Card>
                            ))}
                          </div>
                        )}

                        {section.benefits && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Key Benefits:</Text>
                            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                              {section.benefits.map((benefit, benefitIndex) => (
                                <li key={benefitIndex}>• {benefit}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {section.pipeline_steps && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Processing Pipeline:</Text>
                            {section.pipeline_steps.map((step, stepIndex) => (
                              <Card key={stepIndex} withBorder className="mb-3">
                                <div className="flex items-start gap-3">
                                  <ThemeIcon size={28} radius="xl" color="violet" variant="filled">
                                    <Text size="xs" fw={700} c="white">{step.step}</Text>
                                  </ThemeIcon>
                                  <div className="flex-1">
                                    <Text size="sm" fw={500} className="mb-1">{step.title}</Text>
                                    <Text size="xs" c="dimmed" className="mb-2">{step.description}</Text>
                                    
                                    {step.details && (
                                      <ul className="text-xs text-gray-600 dark:text-gray-400 mb-2 space-y-1">
                                        {step.details.map((detail, detailIndex) => (
                                          <li key={detailIndex}>• {detail}</li>
                                        ))}
                                      </ul>
                                    )}
                                    
                                    {step.code && (
                                      <CodeHighlight code={step.code} language="javascript" />
                                    )}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}

                        {section.resolution_hierarchy && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Channel Resolution Hierarchy:</Text>
                            {section.resolution_hierarchy.map((level, levelIndex) => (
                              <Card key={levelIndex} withBorder className="mb-2">
                                <div className="flex items-start gap-3">
                                  <ThemeIcon size={24} radius="xl" color="violet" variant="light">
                                    <Text size="xs" fw={700}>{level.priority}</Text>
                                  </ThemeIcon>
                                  <div className="flex-1">
                                    <Text size="sm" fw={500} className="mb-1">{level.title}</Text>
                                    <Text size="xs" c="dimmed" className="mb-1">{level.description}</Text>
                                    <Text size="xs" className="text-violet-600 dark:text-violet-400">
                                      <strong>Example:</strong> {level.example}
                                    </Text>
                                  </div>
                                </div>
                              </Card>
                            ))}
                            
                            {section.configuration_code && (
                              <div className="mt-3">
                                <Text size="sm" fw={500} className="mb-2">Implementation:</Text>
                                <CodeHighlight code={section.configuration_code} language="javascript" />
                              </div>
                            )}
                          </div>
                        )}

                        {section.message_format && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">{section.message_format.title}:</Text>
                            <Card withBorder className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                                {section.message_format.components.map((component, componentIndex) => (
                                  <li key={componentIndex}>{component}</li>
                                ))}
                              </ul>
                            </Card>
                          </div>
                        )}

                        {section.notification_modes && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Notification Modes:</Text>
                            {section.notification_modes.map((mode, modeIndex) => (
                              <Card key={modeIndex} withBorder className="mb-2">
                                <Text size="sm" fw={500} className="mb-1 text-indigo-600 dark:text-indigo-400">
                                  {mode.mode}
                                </Text>
                                <Text size="xs" c="dimmed" className="mb-1">{mode.description}</Text>
                                <Text size="xs" className="text-gray-600 dark:text-gray-400">
                                  <strong>Use case:</strong> {mode.use_case}
                                </Text>
                              </Card>
                            ))}
                          </div>
                        )}

                        {section.deduplication && (
                          <div className="mb-4">
                            <Card withBorder className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                              <Text size="sm" fw={500} className="text-green-800 dark:text-green-200 mb-2">
                                Deduplication System
                              </Text>
                              <Text size="xs" className="text-green-700 dark:text-green-300 mb-2">
                                <strong>Mechanism:</strong> {section.deduplication.mechanism}
                              </Text>
                              <Text size="xs" fw={500} className="text-green-800 dark:text-green-200 mb-1">Benefits:</Text>
                              <ul className="text-xs text-green-700 dark:text-green-300 space-y-1">
                                {section.deduplication.benefits.map((benefit, benefitIndex) => (
                                  <li key={benefitIndex}>• {benefit}</li>
                                ))}
                              </ul>
                            </Card>
                          </div>
                        )}

                        {section.project_settings && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Project-Level Settings:</Text>
                            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                              {section.project_settings.map((setting, settingIndex) => (
                                <li key={settingIndex}>• {setting}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {section.team_settings && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-2">Team-Level Settings:</Text>
                            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                              {section.team_settings.map((setting, settingIndex) => (
                                <li key={settingIndex}>• {setting}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {section.advanced_features && (
                          <div className="mb-4">
                            <Text size="sm" fw={500} className="mb-3">Advanced Features (Planned):</Text>
                            {section.advanced_features.map((feature, featureIndex) => (
                              <Card key={featureIndex} withBorder className="mb-2">
                                <Text size="sm" fw={500} className="mb-1 text-purple-600 dark:text-purple-400">
                                  {feature.feature}
                                </Text>
                                <Text size="xs" c="dimmed" className="mb-1">{feature.description}</Text>
                                <Text size="xs" className="text-gray-600 dark:text-gray-400">
                                  <strong>Example:</strong> {feature.example}
                                </Text>
                              </Card>
                            ))}
                          </div>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  </motion.div>
                ))}
              </Accordion>
            </motion.div>
          </Tabs.Panel>

          <Tabs.Panel value="api">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card withBorder className="mb-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <Text size="xl" fw={500}>
                      API Reference
                    </Text>
                    <Text c="dimmed">
                      Explore our comprehensive API documentation
                    </Text>
                  </div>
                  <Button
                    variant="light"
                    color="violet"
                    leftSection={<IconBrandGithub size={18} />}
                    component="a"
                    href="https://github.com/yourusername/exponential/docs"
                    target="_blank"
                  >
                    View on GitHub
                  </Button>
                </div>
                <Text>
                  Full API documentation coming soon. In the meantime, check our GitHub repository for examples and guides.
                </Text>
              </Card>
            </motion.div>
          </Tabs.Panel>
        </div>
      </Tabs>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="mt-12 text-center"
      >
        <Text c="dimmed">
          Need help? Join our{" "}
          <Text
            component="a"
            href="https://github.com/positonic/ai-todo/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 transition-colors"
          >
            community discussions
          </Text>
          {" "}on GitHub
        </Text>
      </motion.div>
    </Container>
  );
}
