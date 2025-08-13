'use client';

import { Container, Title, Text, Box, List, Stack, Divider, Paper, ThemeIcon, Group, Anchor, ScrollArea, Grid } from '@mantine/core';
import { IconCheck, IconBulb, IconTarget, IconCalendar, IconRefresh, IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function WeeklyReviewPage() {
  const [activeSection, setActiveSection] = useState('introduction');

  const sections = [
    { id: 'introduction', label: 'Introduction' },
    { id: 'what-is', label: 'What is the Weekly Review?' },
    { id: 'three-pillars', label: 'The Three Pillars' },
    { id: 'implementation', label: 'Implementation Guide' },
    { id: 'reflection-questions', label: 'Reflection Questions' },
    { id: 'practical-tips', label: 'Practical Tips' },
    { id: 'benefits', label: 'Why It Works' },
    { id: 'get-started', label: 'Get Started' },
  ];

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
  }, []);

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
            <Title order={1} mb="xl" className="text-text-primary">The Weekly Review: Your Strategic Productivity Ritual</Title>
            
            <Text size="lg" className="text-text-secondary mb-8 leading-relaxed">
              In our hyperconnected world, it's easy to lose sight of the forest for the trees. The Weekly Review 
              is your compass—a structured practice that transforms reactive task management into proactive strategic planning.
            </Text>
          </Box>

          <Box id="what-is" className="scroll-mt-20">
            <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary mb-8">
              <Text fw={500} size="lg" mb="md" className="text-text-primary">
                What is the Weekly Review?
              </Text>
              <Text className="text-text-secondary">
                Born from David Allen's Getting Things Done methodology, the Weekly Review is a dedicated hour each week 
                where you step back from the daily grind to gain perspective. It's your opportunity to ensure that your 
                daily actions align with your broader objectives and that nothing important falls through the cracks.
              </Text>
            </Paper>
          </Box>

          <Box id="three-pillars" className="scroll-mt-20">
            <Title order={2} mt="xl" mb="lg" className="text-text-primary">The Three Pillars of Weekly Review</Title>
            
            <Stack gap="lg" mb="xl">
              <Box>
                <Group gap="sm" mb="sm">
                  <ThemeIcon size="lg" radius="xl" className="bg-brand-primary">
                    <IconRefresh size={20} />
                  </ThemeIcon>
                  <Text fw={600} size="lg" className="text-text-primary">1. Get Clear</Text>
                </Group>
                <Text className="text-text-secondary pl-12">
                  Process all your loose ends. Empty your inboxes, capture stray thoughts, and ensure every commitment 
                  is tracked. This creates mental space and prevents important items from being forgotten.
                </Text>
              </Box>

              <Box>
                <Group gap="sm" mb="sm">
                  <ThemeIcon size="lg" radius="xl" className="bg-brand-primary">
                    <IconTarget size={20} />
                  </ThemeIcon>
                  <Text fw={600} size="lg" className="text-text-primary">2. Get Current</Text>
                </Group>
                <Text className="text-text-secondary pl-12">
                  Review your projects, update task statuses, and reassess priorities. Look at your calendar, 
                  check project progress, and ensure your system reflects current reality.
                </Text>
              </Box>

              <Box>
                <Group gap="sm" mb="sm">
                  <ThemeIcon size="lg" radius="xl" className="bg-brand-primary">
                    <IconBulb size={20} />
                  </ThemeIcon>
                  <Text fw={600} size="lg" className="text-text-primary">3. Get Creative</Text>
                </Group>
                <Text className="text-text-secondary pl-12">
                  Generate new ideas and possibilities. With a clear mind and current perspective, you're positioned 
                  to identify opportunities and innovative approaches to your challenges.
                </Text>
              </Box>
            </Stack>
          </Box>

          <Divider my="xl" />

          <Box id="implementation" className="scroll-mt-20">
            <Title order={2} mb="lg" className="text-text-primary">Implementing Your Weekly Review</Title>
            
            <Title order={3} size="h4" mb="md" className="text-text-primary">Essential Steps</Title>
            
            <List spacing="md" className="text-text-secondary mb-xl">
              <List.Item icon={<IconCheck size={16} className="text-brand-primary" />}>
                <strong>Schedule It Sacred:</strong> Choose a consistent day and time. Many prefer Friday afternoons 
                to close the week or Sunday evenings to prepare for the week ahead.
              </List.Item>
              <List.Item icon={<IconCheck size={16} className="text-brand-primary" />}>
                <strong>Create Your Ritual:</strong> Develop a personalized checklist that guides you through each review. 
                This ensures consistency and completeness.
              </List.Item>
              <List.Item icon={<IconCheck size={16} className="text-brand-primary" />}>
                <strong>Review All Horizons:</strong> Examine not just immediate tasks but also ongoing projects, 
                quarterly goals, and annual objectives.
              </List.Item>
              <List.Item icon={<IconCheck size={16} className="text-brand-primary" />}>
                <strong>Capture Metrics:</strong> Track key performance indicators that matter to you—completed tasks, 
                project progress, or time spent on strategic work.
              </List.Item>
            </List>
          </Box>

          <Box id="reflection-questions" className="scroll-mt-20">
            <Title order={3} size="h4" mb="md" className="text-text-primary">Powerful Reflection Questions</Title>
            
            <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary mb-xl">
              <Stack gap="md">
                <Text className="text-text-secondary">• What were my biggest wins this week?</Text>
                <Text className="text-text-secondary">• What obstacles prevented me from achieving my goals?</Text>
                <Text className="text-text-secondary">• How aligned were my actions with my priorities?</Text>
                <Text className="text-text-secondary">• What can I delegate or eliminate next week?</Text>
                <Text className="text-text-secondary">• What one change would make next week more effective?</Text>
              </Stack>
            </Paper>
          </Box>

          <Box id="practical-tips" className="scroll-mt-20">
            <Title order={2} mb="lg" className="text-text-primary">Making It Work in Practice</Title>
            
            <Stack gap="lg" className="text-text-secondary mb-xl">
              <Box>
                <Text fw={500} mb="xs" className="text-text-primary">Be Ruthlessly Honest</Text>
                <Text>
                  The review is for you. Acknowledge both successes and shortcomings without judgment. 
                  This objectivity is what drives continuous improvement.
                </Text>
              </Box>
              
              <Box>
                <Text fw={500} mb="xs" className="text-text-primary">Keep It Time-Boxed</Text>
                <Text>
                  Aim for 30-60 minutes. The review should be thorough but not exhausting. 
                  Efficiency prevents it from becoming a burden.
                </Text>
              </Box>
              
              <Box>
                <Text fw={500} mb="xs" className="text-text-primary">Iterate and Evolve</Text>
                <Text>
                  Your review process should grow with you. Regularly assess what's working and adjust 
                  your approach as your responsibilities and goals change.
                </Text>
              </Box>
            </Stack>
          </Box>

          <Divider my="xl" />

          <Box id="benefits" className="scroll-mt-20">
            <Title order={2} mb="lg" className="text-text-primary">Why It Transforms Your Productivity</Title>
            
            <Text className="text-text-secondary mb-md">
              The Weekly Review creates a rhythm of reflection and planning that compounds over time. 
              Each review builds on the last, creating momentum and clarity that daily task management alone cannot achieve.
            </Text>
            
            <List spacing="md" className="text-text-secondary mb-xl">
              <List.Item>
                <strong>Strategic Alignment:</strong> Ensures daily actions support long-term objectives
              </List.Item>
              <List.Item>
                <strong>Proactive Planning:</strong> Shifts from reactive firefighting to intentional progress
              </List.Item>
              <List.Item>
                <strong>Continuous Learning:</strong> Creates 52 opportunities annually to refine your approach
              </List.Item>
              <List.Item>
                <strong>Mental Clarity:</strong> Reduces anxiety by ensuring nothing is forgotten or overlooked
              </List.Item>
            </List>
          </Box>

          <Box id="get-started" className="scroll-mt-20">
            <Paper p="xl" radius="md" className="bg-surface-secondary text-center">
              <IconCalendar size={48} className="mx-auto mb-4 text-brand-primary" />
              <Title order={3} mb="md" className="text-text-primary">Ready to Transform Your Productivity?</Title>
              <Text className="text-text-secondary mb-lg">
                Start your Weekly Review practice today. Set aside one hour this week to step back, 
                reflect, and plan. Your future self will thank you.
              </Text>
              <Link href="/weekly-review" className="text-brand-primary hover:text-brand-primary-hover underline font-medium">
                Try our Weekly Review Dashboard →
              </Link>
            </Paper>
          </Box>
        </Grid.Col>
      </Grid>
    </Container>
  );
}