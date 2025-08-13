'use client';

import { useState, useEffect } from 'react';
import { 
  Container, 
  Title, 
  Text, 
  Button, 
  Stack, 
  Group,
  Stepper,
  Card,
  Grid,
  Select,
  TextInput,
  SimpleGrid,
  Textarea,
  Box,
  Progress,
  Anchor,
  ThemeIcon
} from '@mantine/core';
import { 
  IconBriefcase, 
  IconHome, 
  IconCheck,
  IconArrowRight,
  IconBrandSlack,
  IconBrandDiscord,
  IconBrandGithub,
  IconBrandFigma,
  IconBrandNotion,
  IconCalendar,
  IconCode,
  IconPalette,
  IconMail,
  IconNotes,
  IconTargetArrow
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

type UsageType = 'work' | 'personal' | null;
type OnboardingStep = 1 | 2 | 3 | 4;

interface OnboardingData {
  usageType: UsageType;
  userRole?: string;
  selectedTools: string[];
  projectName: string;
  projectDescription: string;
  projectPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  template?: 'personal' | 'work' | 'learning' | 'scratch';
}

const predefinedRoles = [
  'Executive/C-Level',
  'Manager/Team Lead',
  'Project Manager',
  'Developer/Engineer',
  'Designer',
  'Marketing/Sales',
  'Operations',
  'Consultant',
  'Other'
];

const toolCategories = {
  'Productivity': [
    { name: 'Notion', icon: IconBrandNotion, color: 'gray' },
    { name: 'Obsidian', icon: IconNotes, color: 'violet' },
    { name: 'Roam Research', icon: IconTargetArrow, color: 'blue' }
  ],
  'Communication': [
    { name: 'Slack', icon: IconBrandSlack, color: 'green' },
    { name: 'Discord', icon: IconBrandDiscord, color: 'indigo' },
    { name: 'Microsoft Teams', icon: IconMail, color: 'blue' }
  ],
  'Project Management': [
    { name: 'Asana', icon: IconTargetArrow, color: 'red' },
    { name: 'Trello', icon: IconTargetArrow, color: 'blue' },
    { name: 'Jira', icon: IconCode, color: 'blue' },
    { name: 'Monday.com', icon: IconTargetArrow, color: 'orange' }
  ],
  'Development': [
    { name: 'GitHub', icon: IconBrandGithub, color: 'dark' },
    { name: 'GitLab', icon: IconCode, color: 'orange' },
    { name: 'Linear', icon: IconTargetArrow, color: 'gray' }
  ],
  'Calendar': [
    { name: 'Google Calendar', icon: IconCalendar, color: 'blue' },
    { name: 'Outlook', icon: IconCalendar, color: 'blue' },
    { name: 'Apple Calendar', icon: IconCalendar, color: 'gray' }
  ],
  'Note-taking': [
    { name: 'Evernote', icon: IconNotes, color: 'green' },
    { name: 'OneNote', icon: IconNotes, color: 'blue' },
    { name: 'Apple Notes', icon: IconNotes, color: 'yellow' }
  ],
  'Design': [
    { name: 'Figma', icon: IconBrandFigma, color: 'pink' },
    { name: 'Adobe Creative Suite', icon: IconPalette, color: 'red' }
  ]
};

export default function OnboardingPageComponent({userName}: {userName: string}) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showOtherRole, setShowOtherRole] = useState(false);
  
  const [data, setData] = useState<OnboardingData>({
    usageType: null,
    selectedTools: [],
    projectName: '',
    projectDescription: '',
    projectPriority: 'MEDIUM'
  });

  // Get onboarding status
  const { data: onboardingStatus, isLoading: statusLoading } = api.onboarding.getStatus.useQuery();
  
  // tRPC mutations
  const updateUsageType = api.onboarding.updateUsageType.useMutation();
  const updateRole = api.onboarding.updateRole.useMutation();
  const updateTools = api.onboarding.updateTools.useMutation();
  const completeOnboarding = api.onboarding.completeOnboarding.useMutation();

  // Set initial step based on current progress
  useEffect(() => {
    if (onboardingStatus && !onboardingStatus.isCompleted) {
      setCurrentStep(onboardingStatus.onboardingStep as OnboardingStep);
      setData(prev => ({
        ...prev,
        usageType: onboardingStatus.usageType as UsageType,
        userRole: onboardingStatus.userRole || undefined,
        selectedTools: onboardingStatus.selectedTools || []
      }));
    } else if (onboardingStatus?.isCompleted) {
      // If already completed, redirect to home
      router.push('/home');
    }
  }, [onboardingStatus, router]);

  const handleUsageTypeSelection = async (usageType: UsageType) => {
    if (!usageType) return;
    
    setIsLoading(true);
    try {
      await updateUsageType.mutateAsync({ usageType });
      setData(prev => ({ ...prev, usageType }));
      
      // Skip to step 3 if personal, step 2 if work
      const nextStep = usageType === 'work' ? 2 : 3;
      setCurrentStep(nextStep as OnboardingStep);
      
      notifications.show({
        title: 'Great!',
        message: `We'll tailor Exponential for your ${usageType} needs.`,
        color: 'green',
        icon: <IconCheck size={16} />
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save your selection. Please try again.',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleSelection = async () => {
    setIsLoading(true);
    try {
      await updateRole.mutateAsync({ userRole: data.userRole });
      setCurrentStep(3);
      
      notifications.show({
        title: 'Role saved!',
        message: 'Let\'s see what tools you use.',
        color: 'green',
        icon: <IconCheck size={16} />
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save your role. Please try again.',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipRole = async () => {
    setIsLoading(true);
    try {
      await updateRole.mutateAsync({ userRole: undefined });
      setCurrentStep(3);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to skip role selection. Please try again.',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToolsSelection = async () => {
    setIsLoading(true);
    try {
      await updateTools.mutateAsync({ selectedTools: data.selectedTools });
      setCurrentStep(4);
      
      notifications.show({
        title: 'Tools saved!',
        message: 'Now let\'s create your first project.',
        color: 'green',
        icon: <IconCheck size={16} />
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save your tools. Please try again.',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!data.projectName.trim()) {
      notifications.show({
        title: 'Project name required',
        message: 'Please enter a name for your first project.',
        color: 'orange'
      });
      return;
    }

    setIsLoading(true);
    try {
      await completeOnboarding.mutateAsync({
        projectName: data.projectName,
        projectDescription: data.projectDescription,
        projectPriority: data.projectPriority,
        template: data.template
      });
      
      notifications.show({
        title: 'Welcome to Exponential! 🎉',
        message: 'Your onboarding is complete. Let\'s get started!',
        color: 'green',
        icon: <IconCheck size={16} />,
        autoClose: 3000
      });
      
      // Redirect to home after a brief delay
      setTimeout(() => {
        router.push('/home');
      }, 2000);
      
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to complete onboarding. Please try again.',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTool = (tool: string) => {
    setData(prev => ({
      ...prev,
      selectedTools: prev.selectedTools.includes(tool)
        ? prev.selectedTools.filter(t => t !== tool)
        : [...prev.selectedTools, tool]
    }));
  };

  if (statusLoading) {
    return (
      <Container size="sm" py="xl">
        <Box className="text-center">
          <Title order={3}>Loading...</Title>
          <Progress value={50} animated mt="md" />
        </Box>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div className="text-center">
          <Title order={1} size="h1" className="text-3xl font-bold mb-2">
            Welcome to Exponential, {userName}! 👋
          </Title>
          <Text size="lg" className="text-text-secondary max-w-2xl mx-auto">
            Let&apos;s get you set up in just a few quick steps. This will help us personalize your experience.
          </Text>
        </div>

        {/* Progress Stepper */}
        <Stepper 
          active={currentStep - 1} 
          color="brand"
          className="mb-8"
        >
          <Stepper.Step label="Usage Type" description="How will you use Exponential?" />
          <Stepper.Step label="Role" description="What's your role?" />
          <Stepper.Step label="Tools" description="What tools do you use?" />
          <Stepper.Step label="First Project" description="Create your first project" />
        </Stepper>

        {/* Step Content */}
        <Card shadow="sm" padding="lg" radius="md" className="border-border-primary">
          
          {/* Step 1: Usage Type */}
          {currentStep === 1 && (
            <Stack gap="lg">
              <div className="text-center">
                <Title order={2} className="text-2xl font-semibold mb-2">
                  How will you be using Exponential?
                </Title>
                <Text className="text-text-secondary">
                  This helps us customize the experience for your needs.
                </Text>
              </div>

              <Grid gutter="md">
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Card 
                    shadow="sm" 
                    padding="xl" 
                    radius="md" 
                    className={`cursor-pointer transition-all border-2 hover:border-brand-primary ${
                      data.usageType === 'work' ? 'border-brand-primary bg-brand-light' : 'border-border-primary'
                    }`}
                    onClick={() => handleUsageTypeSelection('work')}
                  >
                    <Stack align="center" gap="md">
                      <IconBriefcase size={48} className="text-brand-primary" />
                      <Title order={3} className="text-xl font-semibold">Work</Title>
                      <Text className="text-center text-text-secondary">
                        Manage projects, collaborate with teams, and track professional goals.
                      </Text>
                    </Stack>
                  </Card>
                </Grid.Col>

                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Card 
                    shadow="sm" 
                    padding="xl" 
                    radius="md" 
                    className={`cursor-pointer transition-all border-2 hover:border-brand-primary ${
                      data.usageType === 'personal' ? 'border-brand-primary bg-brand-light' : 'border-border-primary'
                    }`}
                    onClick={() => handleUsageTypeSelection('personal')}
                  >
                    <Stack align="center" gap="md">
                      <IconHome size={48} className="text-brand-primary" />
                      <Title order={3} className="text-xl font-semibold">Personal</Title>
                      <Text className="text-center text-text-secondary">
                        Organize personal projects, hobbies, and life goals.
                      </Text>
                    </Stack>
                  </Card>
                </Grid.Col>
              </Grid>
            </Stack>
          )}

          {/* Step 2: Role Selection (Work only) */}
          {currentStep === 2 && data.usageType === 'work' && (
            <Stack gap="lg">
              <div className="text-center">
                <Title order={2} className="text-2xl font-semibold mb-2">
                  What&apos;s your role?
                </Title>
                <Text className="text-text-secondary">
                  This helps us suggest relevant features and workflows.
                </Text>
              </div>

              <Stack gap="md">
                <Select
                  label="Select your role"
                  placeholder="Choose your role"
                  data={predefinedRoles}
                  value={data.userRole}
                  onChange={(value) => {
                    setData(prev => ({ ...prev, userRole: value || undefined }));
                    setShowOtherRole(value === 'Other');
                  }}
                  size="md"
                />

                {showOtherRole && (
                  <TextInput
                    label="Please specify your role"
                    placeholder="Enter your role"
                    value={data.userRole === 'Other' ? '' : data.userRole}
                    onChange={(e) => setData(prev => ({ ...prev, userRole: e.target.value }))}
                    size="md"
                  />
                )}

                <Group justify="space-between" mt="md">
                  <Anchor 
                    component="button" 
                    onClick={handleSkipRole}
                    className="text-text-secondary hover:text-text-primary"
                  >
                    Skip for now
                  </Anchor>
                  
                  <Button 
                    onClick={handleRoleSelection}
                    loading={isLoading}
                    disabled={!data.userRole}
                    rightSection={<IconArrowRight size={16} />}
                  >
                    Continue
                  </Button>
                </Group>
              </Stack>
            </Stack>
          )}

          {/* Step 3: Tool Selection */}
          {currentStep === 3 && (
            <Stack gap="lg">
              <div className="text-center">
                <Title order={2} className="text-2xl font-semibold mb-2">
                  What tools do you use?
                </Title>
                <Text className="text-text-secondary">
                  Select all that apply. We&apos;ll help you integrate them later.
                </Text>
              </div>

              <Stack gap="md">
                {Object.entries(toolCategories).map(([category, tools]) => (
                  <div key={category}>
                    <Title order={4} className="text-lg font-medium mb-2">
                      {category}
                    </Title>
                    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
                      {tools.map(tool => (
                        <Card
                          key={tool.name}
                          shadow="sm"
                          radius="md"
                          padding="md"
                          className={`cursor-pointer transition-all border-2 relative ${
                            data.selectedTools.includes(tool.name)
                              ? 'border-brand bg-surface-secondary'
                              : 'border-border-primary hover:border-border-focus'
                          }`}
                          onClick={() => toggleTool(tool.name)}
                        >
                          {/* Check mark overlay */}
                          {data.selectedTools.includes(tool.name) && (
                            <div className="absolute -top-1 -right-1 bg-brand text-text-inverse rounded-full p-1 z-10">
                              <IconCheck size={12} />
                            </div>
                          )}
                          
                          <Stack align="center" gap="xs">
                            <ThemeIcon size={40} radius="md" variant="light" color={tool.color}>
                              <tool.icon size={20} />
                            </ThemeIcon>
                            <Text size="xs" fw={500} className="text-center leading-tight">
                              {tool.name}
                            </Text>
                          </Stack>
                        </Card>
                      ))}
                    </SimpleGrid>
                  </div>
                ))}

                <Group justify="space-between" mt="md">
                  <Anchor 
                    component="button" 
                    onClick={handleToolsSelection}
                    className="text-text-secondary hover:text-text-primary"
                  >
                    Skip for now
                  </Anchor>
                  
                  <Button 
                    onClick={handleToolsSelection}
                    loading={isLoading}
                    rightSection={<IconArrowRight size={16} />}
                  >
                    Continue ({data.selectedTools.length} selected)
                  </Button>
                </Group>
              </Stack>
            </Stack>
          )}

          {/* Step 4: First Project */}
          {currentStep === 4 && (
            <Stack gap="lg">
              <div className="text-center">
                <Title order={2} className="text-2xl font-semibold mb-2">
                  Create your first project
                </Title>
                <Text className="text-text-secondary">
                  Let&apos;s start with a project to get you going.
                </Text>
              </div>

              <Stack gap="md">
                <TextInput
                  label="Project Name"
                  placeholder="My awesome project"
                  value={data.projectName}
                  onChange={(e) => setData(prev => ({ ...prev, projectName: e.target.value }))}
                  size="md"
                  required
                />

                <Textarea
                  label="Description (optional)"
                  placeholder="What is this project about?"
                  value={data.projectDescription}
                  onChange={(e) => setData(prev => ({ ...prev, projectDescription: e.target.value }))}
                  minRows={3}
                />

                <Select
                  label="Priority"
                  value={data.projectPriority}
                  onChange={(value) => setData(prev => ({ 
                    ...prev, 
                    projectPriority: (value as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM' 
                  }))}
                  data={[
                    { value: 'LOW', label: 'Low' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'HIGH', label: 'High' }
                  ]}
                  size="md"
                />

                <Button 
                  onClick={handleCompleteOnboarding}
                  loading={isLoading}
                  size="lg"
                  rightSection={<IconCheck size={16} />}
                  className="mt-4"
                  disabled={!data.projectName.trim()}
                >
                  Complete Setup
                </Button>
              </Stack>
            </Stack>
          )}
        </Card>

        {/* Footer */}
        <Text size="sm" className="text-center text-text-muted">
          Step {currentStep} of 4 • You can change these settings later in your profile
        </Text>
      </Stack>
    </Container>
  );
}