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
  IconBrandTypescript
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
