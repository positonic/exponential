'use client';

import { Container, Title, Text, Stack, Paper, Group, ThemeIcon, Card, Badge, Timeline, List } from '@mantine/core';
import { IconSparkles, IconTrendingUp, IconRocket, IconUsers, IconBrain, IconTarget, IconWand, IconChartBar, IconGlobe, IconBuilding } from '@tabler/icons-react';

export default function AISalesBlogPage() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div className="text-center">
          <Group justify="center" mb="md">
            <ThemeIcon size="xl" variant="gradient" gradient={{ from: 'violet', to: 'indigo' }}>
              <IconSparkles size={28} />
            </ThemeIcon>
          </Group>
          <Title order={1} className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent text-4xl font-bold mb-4">
            The Future of Sales Pages is Conversational
          </Title>
          <Text size="xl" c="dimmed" maw={800} mx="auto">
            Why AI-powered conversational sales page builders represent the next evolution in business growth tools - 
            and how we're building it step by step.
          </Text>
        </div>

        {/* The Problem */}
        <Paper shadow="sm" p="xl" radius="md" withBorder bg="dark.8">
          <Title order={2} mb="md" c="red.4">The Problem: Brilliant Work Goes Unnoticed</Title>
          <Text size="lg" mb="md">
            Every day, talented professionals complete amazing projects that could win them new clients. 
            A developer builds an app that increases restaurant sales by 40%. A consultant helps a startup raise $2M. 
            A designer rebrands a company that gets featured in TechCrunch.
          </Text>
          <Text size="lg" mb="md">
            But here's what happens next: <strong>nothing</strong>.
          </Text>
          <Text size="lg">
            That incredible success story sits buried in a project folder, mentioned only in passing during networking events. 
            Meanwhile, competitors with inferior results but better marketing win the next client.
          </Text>
        </Paper>

        {/* The Vision */}
        <div>
          <Title order={2} mb="lg" ta="center">The Vision: Every Project Becomes a Growth Engine</Title>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
              <ThemeIcon size="xl" variant="light" color="violet" mx="auto" mb="md">
                <IconBrain size={28} />
              </ThemeIcon>
              <Title order={4} mb="sm">Intelligent Analysis</Title>
              <Text size="sm" c="dimmed">
                AI analyzes your project data - metrics, outcomes, client feedback - 
                and identifies the most compelling success stories.
              </Text>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
              <ThemeIcon size="xl" variant="light" color="green" mx="auto" mb="md">
                <IconWand size={28} />
              </ThemeIcon>
              <Title order={4} mb="sm">Conversational Creation</Title>
              <Text size="sm" c="dimmed">
                Simply describe your goals in natural language. AI handles copywriting, 
                design, optimization - everything.
              </Text>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
              <ThemeIcon size="xl" variant="light" color="blue" mx="auto" mb="md">
                <IconTrendingUp size={28} />
              </ThemeIcon>
              <Title order={4} mb="sm">Automatic Optimization</Title>
              <Text size="sm" c="dimmed">
                Pages continuously improve based on visitor behavior, 
                industry benchmarks, and conversion psychology.
              </Text>
            </Card>
          </div>
        </div>

        {/* Why This Matters */}
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2} mb="lg">Why This Matters: The $50B Opportunity</Title>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <Title order={3} mb="md" c="green.4">Market Reality</Title>
              <List spacing="md" size="md">
                <List.Item>
                  <strong>71% of freelancers</strong> struggle to showcase their work effectively to win new clients
                </List.Item>
                <List.Item>
                  <strong>$12B spent annually</strong> on marketing by small businesses, much of it ineffectively
                </List.Item>
                <List.Item>
                  <strong>89% of consultants</strong> say they could charge more if they had better case studies
                </List.Item>
                <List.Item>
                  <strong>3-5 hours average</strong> to create a decent sales page manually
                </List.Item>
              </List>
            </div>
            
            <div>
              <Title order={3} mb="md" c="blue.4">The AI Advantage</Title>
              <List spacing="md" size="md">
                <List.Item>
                  <strong>2 minutes</strong> to generate a professional sales page with our AI
                </List.Item>
                <List.Item>
                  <strong>40% higher conversion rates</strong> through AI-optimized psychology and design
                </List.Item>
                <List.Item>
                  <strong>Auto-generated case studies</strong> from actual project data and results
                </List.Item>
                <List.Item>
                  <strong>Continuous optimization</strong> based on real visitor behavior
                </List.Item>
              </List>
            </div>
          </div>
        </Paper>

        {/* The Roadmap */}
        <div>
          <Title order={2} mb="lg" ta="center">The Roadmap: Building the Future Step by Step</Title>
          
          <Timeline active={0} bulletSize={24} lineWidth={2}>
            <Timeline.Item
              bullet={<IconRocket size={16} />}
              title="Phase 1: MVP - Conversational Sales Pages (Months 1-3)"
            >
              <Paper p="md" radius="md" bg="dark.7" mt="sm">
                <Text size="sm" fw={600} mb="xs" c="green.4">Core Features:</Text>
                <List size="sm" spacing="xs">
                  <List.Item>AI chat interface for page creation</List.Item>
                  <List.Item>3 professional templates (Minimal, Professional, Creative)</List.Item>
                  <List.Item>Project data integration for automatic case studies</List.Item>
                  <List.Item>Public page hosting with clean URLs</List.Item>
                  <List.Item>Basic analytics (views, engagement)</List.Item>
                </List>
                <Text size="sm" mt="sm" c="blue.4">
                  <strong>Target:</strong> 100 beta users, $10K MRR
                </Text>
              </Paper>
            </Timeline.Item>

            <Timeline.Item
              bullet={<IconUsers size={16} />}
              title="Phase 2: Professional Features (Months 4-6)"
            >
              <Paper p="md" radius="md" bg="dark.7" mt="sm">
                <Text size="sm" fw={600} mb="xs" c="green.4">Enhanced Capabilities:</Text>
                <List size="sm" spacing="xs">
                  <List.Item>Custom branding and themes</List.Item>
                  <List.Item>A/B testing with automatic optimization</List.Item>
                  <List.Item>Lead capture forms and CRM integration</List.Item>
                  <List.Item>Team collaboration features</List.Item>
                  <List.Item>Industry-specific templates</List.Item>
                </List>
                <Text size="sm" mt="sm" c="blue.4">
                  <strong>Target:</strong> 1,000 users, $50K MRR
                </Text>
              </Paper>
            </Timeline.Item>

            <Timeline.Item
              bullet={<IconBrain size={16} />}
              title="Phase 3: AI Intelligence Layer (Months 7-9)"
            >
              <Paper p="md" radius="md" bg="dark.7" mt="sm">
                <Text size="sm" fw={600} mb="xs" c="green.4">Advanced AI Features:</Text>
                <List size="sm" spacing="xs">
                  <List.Item>Predictive conversion optimization</List.Item>
                  <List.Item>Competitor analysis and differentiation</List.Item>
                  <List.Item>Multi-modal input (voice, sketches, images)</List.Item>
                  <List.Item>Industry benchmarking and suggestions</List.Item>
                  <List.Item>Automated testimonial extraction</List.Item>
                </List>
                <Text size="sm" mt="sm" c="blue.4">
                  <strong>Target:</strong> 5,000 users, $200K MRR
                </Text>
              </Paper>
            </Timeline.Item>

            <Timeline.Item
              bullet={<IconBuilding size={16} />}
              title="Phase 4: Enterprise & Scale (Months 10-12)"
            >
              <Paper p="md" radius="md" bg="dark.7" mt="sm">
                <Text size="sm" fw={600} mb="xs" c="green.4">Scale Features:</Text>
                <List size="sm" spacing="xs">
                  <List.Item>White-label solutions for agencies</List.Item>
                  <List.Item>Custom domain support</List.Item>
                  <List.Item>Enterprise integrations (Salesforce, HubSpot)</List.Item>
                  <List.Item>Advanced analytics and reporting</List.Item>
                  <List.Item>API for third-party integrations</List.Item>
                </List>
                <Text size="sm" mt="sm" c="blue.4">
                  <strong>Target:</strong> 20,000 users, $1M ARR
                </Text>
              </Paper>
            </Timeline.Item>

            <Timeline.Item
              bullet={<IconGlobe size={16} />}
              title="Phase 5: Platform Ecosystem (Year 2)"
            >
              <Paper p="md" radius="md" bg="dark.7" mt="sm">
                <Text size="sm" fw={600} mb="xs" c="green.4">Ecosystem Expansion:</Text>
                <List size="sm" spacing="xs">
                  <List.Item>Marketplace for templates and components</List.Item>
                  <List.Item>Integration with major project management tools</List.Item>
                  <List.Item>AI-powered content marketplace</List.Item>
                  <List.Item>Community features and collaboration</List.Item>
                  <List.Item>International expansion and localization</List.Item>
                </List>
                <Text size="sm" mt="sm" c="blue.4">
                  <strong>Target:</strong> 100K users, $10M ARR
                </Text>
              </Paper>
            </Timeline.Item>
          </Timeline>
        </div>

        {/* Why Now */}
        <Paper shadow="sm" p="xl" radius="md" withBorder bg="dark.8">
          <Title order={2} mb="lg" c="yellow.4">Why Now? The Perfect Storm</Title>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <Title order={3} mb="md">Technology Convergence</Title>
              <List spacing="md">
                <List.Item>
                  <strong>LLMs Hit Production Quality:</strong> GPT-4, Claude, and others can now generate 
                  professional-grade marketing copy
                </List.Item>
                <List.Item>
                  <strong>Conversational AI is Mainstream:</strong> ChatGPT proved people want to interact 
                  with AI through natural language
                </List.Item>
                <List.Item>
                  <strong>No-Code Movement:</strong> Users expect sophisticated tools that don't require 
                  technical skills
                </List.Item>
              </List>
            </div>
            
            <div>
              <Title order={3} mb="md">Market Conditions</Title>
              <List spacing="md">
                <List.Item>
                  <strong>Remote Work Explosion:</strong> Millions of new freelancers and consultants 
                  need marketing tools
                </List.Item>
                <List.Item>
                  <strong>AI Adoption Accelerating:</strong> Businesses are actively seeking AI solutions 
                  to stay competitive
                </List.Item>
                <List.Item>
                  <strong>Competition is Outdated:</strong> Current tools (Wix, Squarespace) haven't 
                  integrated conversational AI yet
                </List.Item>
              </List>
            </div>
          </div>
        </Paper>

        {/* Competitive Advantage */}
        <div>
          <Title order={2} mb="lg" ta="center">Our Unfair Advantages</Title>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Group mb="md">
                <ThemeIcon variant="light" color="violet" size="lg">
                  <IconTarget size={20} />
                </ThemeIcon>
                <Title order={4}>Project Intelligence</Title>
              </Group>
              <Text size="sm" c="dimmed">
                Unlike generic website builders, we understand your actual work and results. 
                This creates uniquely compelling, data-driven sales pages that competitors can't match.
              </Text>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Group mb="md">
                <ThemeIcon variant="light" color="green" size="lg">
                  <IconChartBar size={20} />
                </ThemeIcon>
                <Title order={4}>Conversion Science</Title>
              </Group>
              <Text size="sm" c="dimmed">
                Every page applies proven psychology principles and continuously optimizes based on 
                real visitor behavior - not just A/B testing random variations.
              </Text>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Group mb="md">
                <ThemeIcon variant="light" color="blue" size="lg">
                  <IconWand size={20} />
                </ThemeIcon>
                <Title order={4}>Conversational UX</Title>
              </Group>
              <Text size="sm" c="dimmed">
                Creating a sales page feels like having a conversation with an expert marketer, 
                not filling out forms or dragging widgets around.
              </Text>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Group mb="md">
                <ThemeIcon variant="light" color="orange" size="lg">
                  <IconRocket size={20} />
                </ThemeIcon>
                <Title order={4}>Speed to Market</Title>
              </Group>
              <Text size="sm" c="dimmed">
                From idea to professional sales page in under 2 minutes. This isn't just faster - 
                it's fast enough to be impulse-driven, changing how people think about marketing.
              </Text>
            </Card>
          </div>
        </div>

        {/* Success Metrics */}
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2} mb="lg" ta="center">Success Metrics: How We'll Measure Progress</Title>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <Title order={3} c="green.4" mb="sm">User Adoption</Title>
              <List size="sm" spacing="xs">
                <List.Item>Monthly Active Users</List.Item>
                <List.Item>Pages Created per User</List.Item>
                <List.Item>Time to First Page (target: &lt;5 min)</List.Item>
                <List.Item>User Retention (30/60/90 day)</List.Item>
              </List>
            </div>
            
            <div className="text-center">
              <Title order={3} c="blue.4" mb="sm">Business Impact</Title>
              <List size="sm" spacing="xs">
                <List.Item>Monthly Recurring Revenue</List.Item>
                <List.Item>Customer Acquisition Cost</List.Item>
                <List.Item>Lifetime Value</List.Item>
                <List.Item>Churn Rate (&lt;5% target)</List.Item>
              </List>
            </div>
            
            <div className="text-center">
              <Title order={3} c="violet.4" mb="sm">User Success</Title>
              <List size="sm" spacing="xs">
                <List.Item>Page Conversion Rates</List.Item>
                <List.Item>Leads Generated for Users</List.Item>
                <List.Item>User-Reported Revenue Impact</List.Item>
                <List.Item>Net Promoter Score</List.Item>
              </List>
            </div>
          </div>
        </Paper>

        {/* Call to Action */}
        <Paper shadow="sm" p="xl" radius="md" withBorder className="text-center" bg="gradient-to-r from-violet-900/20 to-indigo-900/20">
          <Title order={2} mb="md">The Future is Conversational</Title>
          <Text size="lg" c="dimmed" mb="lg" maw={700} mx="auto">
            We're not just building another website builder. We're creating the first AI-powered system 
            that transforms completed work into new business opportunities automatically.
          </Text>
          <Text size="lg" mb="lg" fw={600}>
            Every project becomes a growth engine. Every success story becomes a sales machine.
          </Text>
          <Group justify="center" gap="md">
            <Badge size="lg" variant="gradient" gradient={{ from: 'violet', to: 'indigo' }}>
              Ready to transform how professionals grow their business
            </Badge>
          </Group>
        </Paper>
      </Stack>
    </Container>
  );
}