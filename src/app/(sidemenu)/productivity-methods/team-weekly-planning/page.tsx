'use client';

import { Container, Title, Text, Box, List, Stack, Divider, Paper, ThemeIcon, Group, Anchor, Grid, Badge, Alert } from '@mantine/core';
import { IconUsers, IconCalendarWeek, IconBulb, IconTrendingUp, IconCheck, IconInfoCircle } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';

export default function TeamWeeklyPlanningPage() {
  const [activeSection, setActiveSection] = useState('introduction');

  const sections = useMemo(() => [
    { id: 'introduction', label: 'Introduction' },
    { id: 'strategic-positioning', label: 'Strategic Positioning' },
    { id: 'dual-approach', label: 'The Dual Approach' },
    { id: 'member-centric', label: 'Member-Centric View' },
    { id: 'outcome-centric', label: 'Outcome-Centric View' },
    { id: 'agile-comparison', label: 'Agile Framework Integration' },
    { id: 'implementation', label: 'Implementation Guide' },
    { id: 'team-dynamics', label: 'Team Dynamics' },
    { id: 'benefits', label: 'Why It Works' },
    { id: 'get-started', label: 'Get Started' },
  ], []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100;
      
      sections.forEach(section => {
        const element = document.getElementById(section.id);
        if (element) {
          const { top, bottom } = element.getBoundingClientRect();
          const elementTop = top + window.scrollY;
          const elementBottom = bottom + window.scrollY;
          
          if (scrollPosition >= elementTop && scrollPosition <= elementBottom) {
            setActiveSection(section.id);
          }
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <Container size="xl" py="xl">
      <Grid>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Box 
            className="sticky top-20 hidden md:block"
            style={{ maxHeight: 'calc(100vh - 100px)' }}
          >
            <Paper p="md" radius="md" className="bg-surface-secondary border border-border-primary">
              <Text fw={600} size="sm" mb="md" className="text-text-primary">
                Table of Contents
              </Text>
              <Stack gap="xs">
                {sections.map((section) => (
                  <Anchor
                    key={section.id}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection(section.id);
                    }}
                    className={`text-sm no-underline transition-colors cursor-pointer ${
                      activeSection === section.id 
                        ? 'text-brand-primary font-medium' 
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {section.label}
                  </Anchor>
                ))}
              </Stack>
            </Paper>
          </Box>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Box id="introduction" className="scroll-mt-20">
            <Group gap="sm" mb="md">
              <Badge variant="gradient" gradient={{ from: 'blue', to: 'teal' }} size="lg">
                Team Methodology
              </Badge>
              <Badge variant="light" color="orange" size="sm">
                Hybrid Approach
              </Badge>
            </Group>
            
            <Title order={1} mb="xl" className="text-text-primary">
              Team Weekly Planning: Hybrid Collaborative Methodology
            </Title>
            
            <Text size="lg" className="text-text-secondary mb-8 leading-relaxed">
              While individual weekly reviews focus on personal productivity, team weekly planning addresses the unique 
              challenges of collaborative work. Our hybrid methodology combines the best elements of Scrum, Kanban, and 
              traditional weekly review practices to create a flexible framework that adapts to your team&apos;s needs.
            </Text>

            <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />} mb="xl">
              <Text size="sm">
                <strong>Evolution from Individual Practice:</strong> This methodology extends David Allen&apos;s weekly review 
                concept from personal productivity to team collaboration, maintaining the core principle of regular 
                reflection while adding collaborative planning and outcome alignment.
              </Text>
            </Alert>
          </Box>

          <Box id="strategic-positioning" className="scroll-mt-20">
            <Title order={2} mb="lg" className="text-text-primary">Strategic Positioning: The Perfect Middle Ground</Title>
            
            <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary mb-xl">
              <Text size="lg" fw={500} mb="md" className="text-text-primary">
                Our Unique Position in the Agile Ecosystem
              </Text>
              <Text className="text-text-secondary mb-lg">
                This methodology occupies a strategic middle ground in the project management landscape, 
                offering structure without overhead and flexibility without chaos.
              </Text>

              <Stack gap="lg">
                <Box>
                  <Group gap="sm" mb="xs">
                    <ThemeIcon size="sm" radius="xl" className="bg-green-500">
                      <IconCheck size={12} />
                    </ThemeIcon>
                    <Text fw={500} size="sm" className="text-text-primary">Less Heavy than Full Scrum</Text>
                  </Group>
                  <Text size="sm" className="text-text-secondary pl-6">
                    No complex ceremonies, rigid roles, or heavy artifacts. Perfect for teams that want structure 
                    without the overhead of formal Scrum implementation.
                  </Text>
                </Box>

                <Box>
                  <Group gap="sm" mb="xs">
                    <ThemeIcon size="sm" radius="xl" className="bg-blue-500">
                      <IconTrendingUp size={12} />
                    </ThemeIcon>
                    <Text fw={500} size="sm" className="text-text-primary">More Structured than Pure Kanban</Text>
                  </Group>
                  <Text size="sm" className="text-text-secondary pl-6">
                    Defined weekly outcomes and planning cycles provide rhythm and alignment that pure flow-based 
                    systems sometimes lack.
                  </Text>
                </Box>

                <Box>
                  <Group gap="sm" mb="xs">
                    <ThemeIcon size="sm" radius="xl" className="bg-purple-500">
                      <IconUsers size={12} />
                    </ThemeIcon>
                    <Text fw={500} size="sm" className="text-text-primary">More Collaborative than Individual Reviews</Text>
                  </Group>
                  <Text size="sm" className="text-text-secondary pl-6">
                    Built for team alignment and shared accountability while maintaining individual clarity 
                    and responsibility.
                  </Text>
                </Box>

                <Box>
                  <Group gap="sm" mb="xs">
                    <ThemeIcon size="sm" radius="xl" className="bg-orange-500">
                      <IconBulb size={12} />
                    </ThemeIcon>
                    <Text fw={500} size="sm" className="text-text-primary">More Flexible than Rigid Frameworks</Text>
                  </Group>
                  <Text size="sm" className="text-text-secondary pl-6">
                    Adaptable to different team sizes, project types, and organizational contexts. 
                    Evolves with your team&apos;s maturity.
                  </Text>
                </Box>
              </Stack>
            </Paper>

            <Title order={3} size="h4" mb="md" className="text-text-primary">Ideal for These Team Contexts</Title>
            <List spacing="sm" className="text-text-secondary mb-xl">
              <List.Item><strong>Small to Medium Teams (2-8 people)</strong> who want structure without bureaucracy</List.Item>
              <List.Item><strong>Cross-functional Projects</strong> requiring both technical execution and business alignment</List.Item>
              <List.Item><strong>Remote/Distributed Teams</strong> needing async collaboration and clear communication</List.Item>
              <List.Item><strong>Agile-Curious Organizations</strong> exploring structured methodologies without full commitment</List.Item>
              <List.Item><strong>Innovation Teams</strong> balancing creative work with delivery accountability</List.Item>
              <List.Item><strong>Startup Environments</strong> requiring rapid iteration with team coordination</List.Item>
            </List>
          </Box>

          <Divider my="xl" />

          <Box id="get-started" className="scroll-mt-20">
            <Paper p="xl" radius="md" className="bg-gradient-to-r from-blue-50 to-teal-50 dark:from-blue-950 dark:to-teal-950 text-center border border-border-primary">
              <IconCalendarWeek size={48} className="mx-auto mb-4 text-brand-primary" />
              <Title order={3} mb="md" className="text-text-primary">Ready to Transform Your Team&apos;s Productivity?</Title>
              <Text className="text-text-secondary mb-lg">
                Experience the power of dual-perspective team planning. Start with your next project that has a team 
                and discover which view resonates with your collaboration style.
              </Text>
              <Group justify="center" gap="md">
                <Link href="/projects" className="text-brand-primary hover:text-brand-primary-hover underline font-medium">
                  Try with Your Team Project →
                </Link>
                <Text size="sm" className="text-text-muted">•</Text>
                <Link href="/productivity-methods/weekly-review" className="text-text-secondary hover:text-text-primary underline">
                  Learn Individual Weekly Review
                </Link>
              </Group>
            </Paper>
          </Box>
        </Grid.Col>
      </Grid>
    </Container>
  );
}