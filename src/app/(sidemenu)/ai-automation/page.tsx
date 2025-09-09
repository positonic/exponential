'use client';

import { Container, Title, Text, Stack, Paper, Group, Button, Card, Badge, ThemeIcon, Timeline, List, Accordion } from '@mantine/core';
import { 
  IconRobot, 
  IconTrendingUp, 
  IconRocket, 
  IconUsers, 
  IconBrain, 
  IconTarget, 
  IconChartBar, 
  IconClock, 
  IconCheck, 
  IconSettings,
  IconShieldCheck,
  IconBolt,
  IconCurrencyDollar,
  IconStar,
  IconCalendar,
  IconMail
} from '@tabler/icons-react';

export default function AIAutomationPage() {
  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Hero Section */}
        <div className="text-center">
          <Group justify="center" mb="md">
            <ThemeIcon size="xl" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
              <IconRobot size={28} />
            </ThemeIcon>
          </Group>
          <Title order={1} className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent text-4xl font-bold mb-4">
            Stop Losing $50K+ Annually to Manual Processes
          </Title>
          <Text size="xl" c="dimmed" maw={800} mx="auto" mb="lg">
            Transform Your Business Operations with AI Automation Consulting from the Exponential.im Team
          </Text>
          <Group justify="center">
            <Button
              size="lg"
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan' }}
              leftSection={<IconCalendar size={20} />}
            >
              Get Free Process Audit
            </Button>
            <Button
              size="lg"
              variant="outline"
              leftSection={<IconMail size={20} />}
            >
              Learn More
            </Button>
          </Group>
        </div>

        {/* Problem Section */}
        <Paper shadow="sm" p="xl" radius="md" withBorder bg="red.0">
          <Title order={2} mb="md" c="red.7">The Hidden Cost of Manual Work</Title>
          <Text size="lg" mb="lg" c="red.8">
            Your team is drowning in repetitive tasks while your competitors race ahead with automation. 
            Every minute spent on manual processes is money left on the table.
          </Text>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <Title order={3} mb="md" c="red.7">What You&apos;re Losing</Title>
              <List spacing="md" size="md">
                <List.Item icon={<ThemeIcon size="sm" color="red" variant="light"><IconClock size={12} /></ThemeIcon>}>
                  <strong>40+ hours/week</strong> lost to repetitive tasks across your team
                </List.Item>
                <List.Item icon={<ThemeIcon size="sm" color="red" variant="light"><IconTarget size={12} /></ThemeIcon>}>
                  <strong>$15K-50K monthly</strong> in opportunity cost from manual bottlenecks
                </List.Item>
                <List.Item icon={<ThemeIcon size="sm" color="red" variant="light"><IconUsers size={12} /></ThemeIcon>}>
                  <strong>Top talent burnout</strong> from mind-numbing, repetitive work
                </List.Item>
                <List.Item icon={<ThemeIcon size="sm" color="red" variant="light"><IconTrendingUp size={12} /></ThemeIcon>}>
                  <strong>Competitive disadvantage</strong> as agile competitors automate and scale
                </List.Item>
              </List>
            </div>
            
            <div>
              <Title order={3} mb="md" c="red.7">The Reality Check</Title>
              <Stack gap="md">
                <Paper p="md" radius="md" bg="red.1" withBorder>
                  <Text fw={600} size="lg" c="red.8">87% of businesses</Text>
                  <Text size="sm" c="red.7">still rely heavily on manual processes that could be automated</Text>
                </Paper>
                <Paper p="md" radius="md" bg="red.1" withBorder>
                  <Text fw={600} size="lg" c="red.8">$2.9 trillion annually</Text>
                  <Text size="sm" c="red.7">lost globally due to inefficient manual work</Text>
                </Paper>
                <Paper p="md" radius="md" bg="red.1" withBorder>
                  <Text fw={600} size="lg" c="red.8">60% of jobs</Text>
                  <Text size="sm" c="red.7">have at least 30% of activities that could be automated today</Text>
                </Paper>
              </Stack>
            </div>
          </div>
        </Paper>

        {/* Solution Overview */}
        <div>
          <Title order={2} mb="lg" ta="center">AI Automation That Actually Works</Title>
          <Text size="lg" c="dimmed" ta="center" maw={700} mx="auto" mb="lg">
            We don&apos;t just implement tools - we transform your entire operation with intelligent automation 
            that scales with your business.
          </Text>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
              <ThemeIcon size="xl" variant="light" color="green" mx="auto" mb="md">
                <IconBolt size={28} />
              </ThemeIcon>
              <Title order={4} mb="sm">60-80% Reduction</Title>
              <Text size="sm" c="dimmed">
                In manual work across all automated processes
              </Text>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
              <ThemeIcon size="xl" variant="light" color="blue" mx="auto" mb="md">
                <IconClock size={28} />
              </ThemeIcon>
              <Title order={4} mb="sm">24/7 Operations</Title>
              <Text size="sm" c="dimmed">
                Automated workflows that never sleep or take breaks
              </Text>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
              <ThemeIcon size="xl" variant="light" color="violet" mx="auto" mb="md">
                <IconShieldCheck size={28} />
              </ThemeIcon>
              <Title order={4} mb="sm">Zero Human Error</Title>
              <Text size="sm" c="dimmed">
                Eliminate costly mistakes on routine tasks
              </Text>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
              <ThemeIcon size="xl" variant="light" color="orange" mx="auto" mb="md">
                <IconChartBar size={28} />
              </ThemeIcon>
              <Title order={4} mb="sm">300%+ ROI</Title>
              <Text size="sm" c="dimmed">
                Within 6 months of implementation
              </Text>
            </Card>
          </div>
        </div>

        {/* Services Offered */}
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2} mb="lg" ta="center">Our Automation Services</Title>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Stack gap="md">
              <Card shadow="xs" p="md" radius="md" withBorder>
                <Group mb="sm">
                  <ThemeIcon variant="light" color="blue" size="lg">
                    <IconTarget size={20} />
                  </ThemeIcon>
                  <Title order={4}>Process Discovery & Audit</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Comprehensive analysis of your current workflows to identify the highest-impact 
                  automation opportunities with detailed ROI projections.
                </Text>
              </Card>

              <Card shadow="xs" p="md" radius="md" withBorder>
                <Group mb="sm">
                  <ThemeIcon variant="light" color="green" size="lg">
                    <IconBrain size={20} />
                  </ThemeIcon>
                  <Title order={4}>Custom AI Workflow Design</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Tailored automation solutions designed specifically for your business needs, 
                  processes, and existing technology stack.
                </Text>
              </Card>

              <Card shadow="xs" p="md" radius="md" withBorder>
                <Group mb="sm">
                  <ThemeIcon variant="light" color="violet" size="lg">
                    <IconSettings size={20} />
                  </ThemeIcon>
                  <Title order={4}>Implementation & Integration</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Full technical deployment with seamless integration into your existing systems, 
                  ensuring zero disruption to ongoing operations.
                </Text>
              </Card>
            </Stack>

            <Stack gap="md">
              <Card shadow="xs" p="md" radius="md" withBorder>
                <Group mb="sm">
                  <ThemeIcon variant="light" color="orange" size="lg">
                    <IconUsers size={20} />
                  </ThemeIcon>
                  <Title order={4}>Training & Handoff</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Comprehensive team training and documentation to ensure your staff can 
                  manage and optimize automated processes independently.
                </Text>
              </Card>

              <Card shadow="xs" p="md" radius="md" withBorder>
                <Group mb="sm">
                  <ThemeIcon variant="light" color="teal" size="lg">
                    <IconTrendingUp size={20} />
                  </ThemeIcon>
                  <Title order={4}>Ongoing Optimization</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Continuous monitoring, performance analysis, and iterative improvements 
                  to maximize efficiency and ROI over time.
                </Text>
              </Card>

              <Paper p="md" radius="md" bg="blue.0" withBorder>
                <Group>
                  <ThemeIcon variant="light" color="blue" size="sm">
                    <IconCheck size={16} />
                  </ThemeIcon>
                  <Text size="sm" fw={600} c="blue.8">
                    Full-Service Approach: From strategy to execution to optimization
                  </Text>
                </Group>
              </Paper>
            </Stack>
          </div>
        </Paper>

        {/* Expertise Section */}
        <div>
          <Title order={2} mb="lg" ta="center">Built by the Exponential.im Team</Title>
          <Text size="lg" c="dimmed" ta="center" maw={700} mx="auto" mb="lg">
            The same team behind Exponential.im&apos;s advanced productivity platform now brings 
            enterprise-grade automation expertise to your business.
          </Text>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Paper p="lg" radius="md" bg="blue.0" withBorder className="text-center">
              <Title order={3} c="blue.8" mb="sm">50+</Title>
              <Text size="sm" c="blue.7">Successful automation projects delivered</Text>
            </Paper>
            
            <Paper p="lg" radius="md" bg="green.0" withBorder className="text-center">
              <Title order={3} c="green.8" mb="sm">10+</Title>
              <Text size="sm" c="green.7">Years combined AI/automation experience</Text>
            </Paper>
            
            <Paper p="lg" radius="md" bg="violet.0" withBorder className="text-center">
              <Title order={3} c="violet.8" mb="sm">$2M+</Title>
              <Text size="sm" c="violet.7">In documented cost savings for clients</Text>
            </Paper>
            
            <Paper p="lg" radius="md" bg="orange.0" withBorder className="text-center">
              <Title order={3} c="orange.8" mb="sm">100%</Title>
              <Text size="sm" c="orange.7">Client satisfaction and retention rate</Text>
            </Paper>
          </div>

          <Paper shadow="sm" p="lg" radius="md" withBorder mt="lg">
            <Title order={3} mb="md" ta="center">Our Expertise Spans</Title>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <List size="sm" spacing="xs">
                <List.Item icon={<IconCheck size={16} />}>Process Mining & Analysis</List.Item>
                <List.Item icon={<IconCheck size={16} />}>AI/ML Model Development</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Workflow Automation</List.Item>
                <List.Item icon={<IconCheck size={16} />}>RPA Implementation</List.Item>
              </List>
              <List size="sm" spacing="xs">
                <List.Item icon={<IconCheck size={16} />}>API Integrations</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Database Optimization</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Cloud Infrastructure</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Security & Compliance</List.Item>
              </List>
              <List size="sm" spacing="xs">
                <List.Item icon={<IconCheck size={16} />}>Business Intelligence</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Custom Software Development</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Change Management</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Performance Monitoring</List.Item>
              </List>
            </div>
          </Paper>
        </div>

        {/* Case Studies */}
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2} mb="lg" ta="center">Real Results from Real Clients</Title>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Badge variant="light" color="blue" mb="md">Manufacturing</Badge>
              <Title order={4} mb="sm">70% Faster Order Processing</Title>
              <Text size="sm" c="dimmed" mb="md">
                Automated entire order-to-fulfillment pipeline for a mid-size manufacturer, 
                reducing processing time from 2 days to 6 hours.
              </Text>
              <List size="xs" spacing="xs">
                <List.Item icon={<IconCheck size={12} />}>$180K annual savings</List.Item>
                <List.Item icon={<IconCheck size={12} />}>99.8% accuracy rate</List.Item>
                <List.Item icon={<IconCheck size={12} />}>4-month payback period</List.Item>
              </List>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Badge variant="light" color="green" mb="md">SaaS</Badge>
              <Title order={4} mb="sm">5x Customer Onboarding Scale</Title>
              <Text size="sm" c="dimmed" mb="md">
                Built intelligent onboarding automation that handles 5x more customers 
                with the same team size and improved satisfaction scores.
              </Text>
              <List size="xs" spacing="xs">
                <List.Item icon={<IconCheck size={12} />}>500% capacity increase</List.Item>
                <List.Item icon={<IconCheck size={12} />}>40% higher CSAT scores</List.Item>
                <List.Item icon={<IconCheck size={12} />}>6-month ROI: 420%</List.Item>
              </List>
            </Card>

            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Badge variant="light" color="violet" mb="md">Professional Services</Badge>
              <Title order={4} mb="sm">80% Faster Proposals</Title>
              <Text size="sm" c="dimmed" mb="md">
                Automated proposal generation and client communication workflows, 
                dramatically improving response times and win rates.
              </Text>
              <List size="xs" spacing="xs">
                <List.Item icon={<IconCheck size={12} />}>35% higher win rate</List.Item>
                <List.Item icon={<IconCheck size={12} />}>20 hours/week saved</List.Item>
                <List.Item icon={<IconCheck size={12} />}>$300K additional revenue</List.Item>
              </List>
            </Card>
          </div>
        </Paper>

        {/* Process Timeline */}
        <div>
          <Title order={2} mb="lg" ta="center">Our Proven Implementation Process</Title>
          
          <Timeline active={7} bulletSize={24} lineWidth={2}>
            <Timeline.Item
              bullet={<IconTarget size={16} />}
              title="Week 1: Discovery & Audit"
            >
              <Paper p="md" radius="md" bg="gray.0" mt="sm">
                <List size="sm" spacing="xs">
                  <List.Item>Process mapping and bottleneck identification</List.Item>
                  <List.Item>ROI opportunity analysis</List.Item>
                  <List.Item>Technical requirements assessment</List.Item>
                  <List.Item>Automation roadmap creation</List.Item>
                </List>
              </Paper>
            </Timeline.Item>

            <Timeline.Item
              bullet={<IconBrain size={16} />}
              title="Weeks 2-4: Design & Development"
            >
              <Paper p="md" radius="md" bg="gray.0" mt="sm">
                <List size="sm" spacing="xs">
                  <List.Item>Custom AI solution architecture</List.Item>
                  <List.Item>Workflow automation development</List.Item>
                  <List.Item>Integration with existing systems</List.Item>
                  <List.Item>Security and compliance implementation</List.Item>
                </List>
              </Paper>
            </Timeline.Item>

            <Timeline.Item
              bullet={<IconSettings size={16} />}
              title="Weeks 5-6: Testing & Integration"
            >
              <Paper p="md" radius="md" bg="gray.0" mt="sm">
                <List size="sm" spacing="xs">
                  <List.Item>Comprehensive testing in staging environment</List.Item>
                  <List.Item>Performance optimization and tuning</List.Item>
                  <List.Item>User acceptance testing with your team</List.Item>
                  <List.Item>Final integration and deployment preparation</List.Item>
                </List>
              </Paper>
            </Timeline.Item>

            <Timeline.Item
              bullet={<IconRocket size={16} />}
              title="Week 7: Training & Go-Live"
            >
              <Paper p="md" radius="md" bg="gray.0" mt="sm">
                <List size="sm" spacing="xs">
                  <List.Item>Comprehensive team training sessions</List.Item>
                  <List.Item>Documentation and process handoff</List.Item>
                  <List.Item>Monitored go-live with real-time support</List.Item>
                  <List.Item>Initial performance validation</List.Item>
                </List>
              </Paper>
            </Timeline.Item>

            <Timeline.Item
              bullet={<IconTrendingUp size={16} />}
              title="Ongoing: Monitoring & Optimization"
            >
              <Paper p="md" radius="md" bg="gray.0" mt="sm">
                <List size="sm" spacing="xs">
                  <List.Item>24/7 system monitoring and alerts</List.Item>
                  <List.Item>Monthly performance reviews and optimizations</List.Item>
                  <List.Item>Continuous improvement recommendations</List.Item>
                  <List.Item>Priority support and maintenance</List.Item>
                </List>
              </Paper>
            </Timeline.Item>
          </Timeline>
        </div>

        {/* Pricing Section */}
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2} mb="lg" ta="center">Investment Tiers</Title>
          <Text size="lg" c="dimmed" ta="center" maw={600} mx="auto" mb="xl">
            Choose the automation package that fits your business needs and scale. 
            All packages include our proven process and ongoing support.
          </Text>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Starter Tier */}
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Badge variant="light" color="blue" size="lg" mb="md">Starter</Badge>
              <Group mb="md">
                <Title order={2} c="blue.8">$15K</Title>
                <Text size="sm" c="dimmed">Single Process</Text>
              </Group>
              <Text size="sm" c="dimmed" mb="md">
                Perfect for businesses looking to automate their first critical process
              </Text>
              <List size="sm" spacing="xs" mb="lg">
                <List.Item icon={<IconCheck size={16} />}>1 process automation</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Basic integrations</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Team training</List.Item>
                <List.Item icon={<IconCheck size={16} />}>3 months support</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Performance monitoring</List.Item>
              </List>
              <Button variant="outline" fullWidth>
                Get Started
              </Button>
            </Card>

            {/* Growth Tier */}
            <Card shadow="md" p="lg" radius="md" withBorder className="border-2 border-green-200">
              <Group mb="md" justify="space-between">
                <Badge variant="light" color="green" size="lg">Growth</Badge>
                <Badge variant="filled" color="green" size="sm">Most Popular</Badge>
              </Group>
              <Group mb="md">
                <Title order={2} c="green.8">$35K</Title>
                <Text size="sm" c="dimmed">Multi-Process</Text>
              </Group>
              <Text size="sm" c="dimmed" mb="md">
                Ideal for scaling businesses ready to automate multiple workflows
              </Text>
              <List size="sm" spacing="xs" mb="lg">
                <List.Item icon={<IconCheck size={16} />}>3-5 process automations</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Advanced integrations</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Custom AI workflows</List.Item>
                <List.Item icon={<IconCheck size={16} />}>6 months support</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Performance analytics</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Priority optimization</List.Item>
              </List>
              <Button variant="gradient" gradient={{ from: 'green', to: 'teal' }} fullWidth>
                Most Popular
              </Button>
            </Card>

            {/* Enterprise Tier */}
            <Card shadow="sm" p="lg" radius="md" withBorder>
              <Badge variant="light" color="violet" size="lg" mb="md">Enterprise</Badge>
              <Group mb="md">
                <Title order={2} c="violet.8">$75K+</Title>
                <Text size="sm" c="dimmed">Full Transformation</Text>
              </Group>
              <Text size="sm" c="dimmed" mb="md">
                Comprehensive automation transformation for established enterprises
              </Text>
              <List size="sm" spacing="xs" mb="lg">
                <List.Item icon={<IconCheck size={16} />}>Company-wide automation</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Enterprise integrations</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Custom AI/ML models</List.Item>
                <List.Item icon={<IconCheck size={16} />}>12 months support</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Dedicated success manager</List.Item>
                <List.Item icon={<IconCheck size={16} />}>Executive reporting</List.Item>
              </List>
              <Button variant="outline" fullWidth>
                Contact Sales
              </Button>
            </Card>
          </div>

          <Paper p="md" radius="md" bg="blue.0" withBorder mt="lg">
            <Group justify="center">
              <IconCurrencyDollar size={20} />
              <Text fw={600} c="blue.8">
                ROI Guarantee: If you don&apos;t see measurable results within 6 months, we&apos;ll continue working at no charge until you do.
              </Text>
            </Group>
          </Paper>
        </Paper>

        {/* Social Proof */}
        <div>
          <Title order={2} mb="lg" ta="center">What Our Clients Say</Title>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Paper p="lg" radius="md" withBorder>
              <Group mb="md">
                <div>
                  <Group gap="xs">
                    {Array(5).fill(0).map((_, i) => (
                      <IconStar key={i} size={16} className="text-yellow-400" />
                    ))}
                  </Group>
                </div>
              </Group>
              <Text size="md" style={{ fontStyle: 'italic' }} mb="md">
                &quot;The Exponential.im team didn&apos;t just automate our processes - they transformed how we think about efficiency. 
                We&apos;re now processing 3x more orders with the same headcount.&quot;
              </Text>
              <Group>
                <Text fw={600} size="sm">Sarah Chen</Text>
                <Text size="sm" c="dimmed">COO, TechFlow Manufacturing</Text>
              </Group>
            </Paper>

            <Paper p="lg" radius="md" withBorder>
              <Group mb="md">
                <div>
                  <Group gap="xs">
                    {Array(5).fill(0).map((_, i) => (
                      <IconStar key={i} size={16} className="text-yellow-400" />
                    ))}
                  </Group>
                </div>
              </Group>
              <Text size="md" style={{ fontStyle: 'italic' }} mb="md">
                &quot;ROI was immediate and measurable. The automation paid for itself in 4 months, 
                and now saves us $30K monthly. Best investment we&apos;ve made.&quot;
              </Text>
              <Group>
                <Text fw={600} size="sm">Marcus Rodriguez</Text>
                <Text size="sm" c="dimmed">CEO, Digital Solutions Inc</Text>
              </Group>
            </Paper>
          </div>

          <Paper p="lg" radius="md" bg="green.0" withBorder mt="lg">
            <Group justify="center" mb="md">
              <ThemeIcon variant="light" color="green" size="lg">
                <IconShieldCheck size={20} />
              </ThemeIcon>
              <Title order={3} c="green.8">Industry Recognition</Title>
            </Group>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <Text fw={600} c="green.8">Top 10 AI Consultancy</Text>
                <Text size="sm" c="green.7">TechReview 2024</Text>
              </div>
              <div>
                <Text fw={600} c="green.8">Automation Excellence Award</Text>
                <Text size="sm" c="green.7">ProcessPro Summit</Text>
              </div>
              <div>
                <Text fw={600} c="green.8">Client Satisfaction: 98%</Text>
                <Text size="sm" c="green.7">Independent Survey</Text>
              </div>
            </div>
          </Paper>
        </div>

        {/* FAQ Section */}
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2} mb="lg" ta="center">Frequently Asked Questions</Title>
          
          <Accordion variant="separated" radius="md">
            <Accordion.Item value="implementation-time">
              <Accordion.Control>How long does implementation typically take?</Accordion.Control>
              <Accordion.Panel>
                Most single-process automations are completed in 6-8 weeks. Multi-process implementations 
                typically take 8-12 weeks. Enterprise transformations can range from 3-6 months depending 
                on complexity and scope.
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="existing-systems">
              <Accordion.Control>Will this work with our existing systems?</Accordion.Control>
              <Accordion.Panel>
                Yes. We specialize in integrating with existing tech stacks. Our solutions work with 
                popular CRMs, ERPs, databases, and business applications. We&apos;ll assess your current 
                systems during the discovery phase and design compatible solutions.
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="roi-timeline">
              <Accordion.Control>What kind of ROI can we expect and when?</Accordion.Control>
              <Accordion.Panel>
                Most clients see initial ROI within 3-6 months, with full payback typically achieved 
                within 12 months. Our clients average 250-400% ROI over the first year, with many 
                seeing much higher returns on high-volume processes.
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="maintenance">
              <Accordion.Control>What ongoing maintenance is required?</Accordion.Control>
              <Accordion.Panel>
                Our automated systems are designed to be low-maintenance. We provide monitoring, 
                regular optimization, and support. Most day-to-day operations require no manual 
                intervention, with automated alerts for any issues.
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="security">
              <Accordion.Control>How do you handle security and compliance?</Accordion.Control>
              <Accordion.Panel>
                Security and compliance are built into every solution from day one. We follow 
                enterprise security standards, implement proper access controls, encryption, 
                and can meet specific regulatory requirements like GDPR, HIPAA, or SOX.
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="team-training">
              <Accordion.Control>Will our team need special training?</Accordion.Control>
              <Accordion.Panel>
                We provide comprehensive training as part of every implementation. Our solutions 
                are designed to be user-friendly, and we ensure your team is comfortable managing 
                and optimizing the automated processes before handoff.
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>

        {/* Final CTA */}
        <Paper shadow="md" p="xl" radius="md" withBorder className="text-center" bg="gradient-to-r from-blue-900/20 to-cyan-900/20">
          <Group justify="center" mb="md">
            <ThemeIcon size="xl" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
              <IconRocket size={28} />
            </ThemeIcon>
          </Group>
          <Title order={2} mb="md">Ready to Eliminate Manual Work Forever?</Title>
          <Text size="lg" c="dimmed" mb="lg" maw={700} mx="auto">
            Join the growing number of businesses that have transformed their operations with AI automation. 
            Get started with a free process audit and ROI analysis.
          </Text>
          
          <Group justify="center" gap="md" mb="lg">
            <Button
              size="xl"
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan' }}
              leftSection={<IconCalendar size={24} />}
            >
              Book Free Consultation
            </Button>
            <Button
              size="xl"
              variant="outline"
              leftSection={<IconMail size={24} />}
            >
              Get ROI Calculator
            </Button>
          </Group>

          <Paper p="md" radius="md" bg="blue.0" withBorder>
            <Group justify="center" gap="md">
              <Group gap="xs">
                <IconCheck size={16} />
                <Text size="sm" fw={600}>No upfront costs for audit</Text>
              </Group>
              <Group gap="xs">
                <IconCheck size={16} />
                <Text size="sm" fw={600}>ROI guarantee</Text>
              </Group>
              <Group gap="xs">
                <IconCheck size={16} />
                <Text size="sm" fw={600}>Free 30-day support</Text>
              </Group>
            </Group>
          </Paper>
        </Paper>
      </Stack>
    </Container>
  );
}