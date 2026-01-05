'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Title,
  Text,
  Button,
  Stack,
  Group,
  Stepper,
  Card,
  Select,
  TextInput,
  SimpleGrid,
  Textarea,
  Box,
  Progress,
  Anchor,
  ThemeIcon,
  Checkbox,
  Avatar,
  ActionIcon,
  Loader,
  MultiSelect
} from '@mantine/core';
import {
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
  IconTargetArrow,
  IconCamera,
  IconUser
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { OnboardingIllustration } from './OnboardingIllustration';
import { OnboardingWorkIllustration } from './OnboardingWorkIllustration';

type OnboardingStep = 1 | 2 | 3 | 4;

interface OnboardingData {
  name: string;
  emailMarketingOptIn: boolean;
  workRole: string | null;
  workFunction: string[];
  usagePurposes: string[];
  selectedTools: string[];
  projectName: string;
  projectDescription: string;
  projectPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  template?: 'personal' | 'work' | 'learning' | 'scratch';
}

// Work role options (single select)
const workRoleOptions = [
  { value: 'team_member', label: 'Team member / Individual contributor' },
  { value: 'manager', label: 'Manager' },
  { value: 'director', label: 'Director' },
  { value: 'executive', label: 'Executive (e.g. VP or C-suite)' },
  { value: 'business_owner', label: 'Business owner' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

// Work function options (multi-select)
const workFunctionOptions = [
  { value: 'administrative_assistant', label: 'Administrative Assistant' },
  { value: 'communications', label: 'Communications' },
  { value: 'customer_experience', label: 'Customer Experience' },
  { value: 'data_analytics', label: 'Data or Analytics' },
  { value: 'design', label: 'Design' },
  { value: 'education_professional', label: 'Education Professional' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'finance_accounting', label: 'Finance or Accounting' },
  { value: 'fundraising', label: 'Fundraising' },
  { value: 'healthcare_professional', label: 'Healthcare Professional' },
  { value: 'human_resources', label: 'Human Resources' },
  { value: 'information_technology', label: 'Information Technology (IT)' },
  { value: 'legal', label: 'Legal' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operations' },
  { value: 'product_management', label: 'Product Management' },
  { value: 'project_program_management', label: 'Project or Program Management' },
  { value: 'research_development', label: 'Research and Development' },
  { value: 'sales', label: 'Sales' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

// Usage purpose options (multi-select)
const usagePurposeOptions = [
  { value: 'feature_development', label: 'Feature development' },
  { value: 'performance_optimization', label: 'Performance optimization' },
  { value: 'roadmap_planning', label: 'Roadmap planning' },
  { value: 'sprint_management', label: 'Sprint management' },
  { value: 'bug_tracking', label: 'Bug intake and tracking' },
  { value: 'employee_onboarding', label: 'Employee onboarding' },
  { value: 'project_management', label: 'Project management' },
  { value: 'portfolio_management', label: 'Portfolio management' },
  { value: 'workload_management', label: 'Workload management' },
  { value: 'goal_management', label: 'Goal management' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
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

interface OnboardingComponentProps {
  userName: string;
  userEmail: string;
}

export default function OnboardingPageComponent({ userName, userEmail }: OnboardingComponentProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  const [data, setData] = useState<OnboardingData>({
    name: userName ?? '',
    emailMarketingOptIn: true,
    workRole: null,
    workFunction: [],
    usagePurposes: [],
    selectedTools: [],
    projectName: '',
    projectDescription: '',
    projectPriority: 'MEDIUM'
  });

  // Get onboarding status
  const { data: onboardingStatus, isLoading: statusLoading } = api.onboarding.getStatus.useQuery();

  // tRPC mutations
  const updateProfile = api.onboarding.updateProfile.useMutation();
  const uploadProfileImage = api.onboarding.uploadProfileImage.useMutation();
  const updateWorkProfile = api.onboarding.updateWorkProfile.useMutation();
  const updateTools = api.onboarding.updateTools.useMutation();
  const completeOnboarding = api.onboarding.completeOnboarding.useMutation();

  // Set initial step based on current progress
  useEffect(() => {
    if (onboardingStatus && !onboardingStatus.isCompleted) {
      const step = onboardingStatus.onboardingStep;
      setCurrentStep(step as OnboardingStep);
      setData(prev => ({
        ...prev,
        name: onboardingStatus.name ?? userName ?? '',
        emailMarketingOptIn: onboardingStatus.emailMarketingOptIn ?? true,
        workRole: onboardingStatus.workRole ?? null,
        workFunction: onboardingStatus.workFunction ?? [],
        usagePurposes: onboardingStatus.usagePurposes ?? [],
        selectedTools: onboardingStatus.selectedTools ?? []
      }));
      if (onboardingStatus.image) {
        setProfileImageUrl(onboardingStatus.image);
      }
    } else if (onboardingStatus?.isCompleted) {
      router.push('/home');
    }
  }, [onboardingStatus, router, userName]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      notifications.show({
        title: 'Invalid file',
        message: 'Please select an image file.',
        color: 'red'
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notifications.show({
        title: 'File too large',
        message: 'Please select an image under 5MB.',
        color: 'red'
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        if (!base64) return;

        const result = await uploadProfileImage.mutateAsync({ base64Data: base64 });
        setProfileImageUrl(result.imageUrl);
        notifications.show({
          title: 'Photo uploaded!',
          message: 'Your profile photo has been saved.',
          color: 'green',
          icon: <IconCheck size={16} />
        });
        setIsUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch {
      notifications.show({
        title: 'Upload failed',
        message: 'Failed to upload image. Please try again.',
        color: 'red'
      });
      setIsUploadingImage(false);
    }
  };

  const handleProfileSubmit = async () => {
    if (!data.name.trim()) {
      notifications.show({
        title: 'Name required',
        message: 'Please enter your full name.',
        color: 'orange'
      });
      return;
    }

    setIsLoading(true);
    try {
      await updateProfile.mutateAsync({
        name: data.name,
        emailMarketingOptIn: data.emailMarketingOptIn
      });
      setCurrentStep(2);

      notifications.show({
        title: 'Profile saved!',
        message: 'Tell us about your work.',
        color: 'green',
        icon: <IconCheck size={16} />
      });
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to save your profile. Please try again.',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWorkProfileSubmit = async () => {
    setIsLoading(true);
    try {
      await updateWorkProfile.mutateAsync({
        workRole: data.workRole ?? undefined,
        workFunction: data.workFunction,
        usagePurposes: data.usagePurposes
      });
      setCurrentStep(3);

      notifications.show({
        title: 'Work profile saved!',
        message: 'Now let\'s see what tools you use.',
        color: 'green',
        icon: <IconCheck size={16} />
      });
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to save your work profile. Please try again.',
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
    } catch {
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
        title: 'Welcome to Exponential!',
        message: 'Your onboarding is complete. Let\'s get started!',
        color: 'green',
        icon: <IconCheck size={16} />,
        autoClose: 3000
      });

      setTimeout(() => {
        router.push('/project-setup');
      }, 2000);

    } catch {
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
      <div className="min-h-screen flex items-center justify-center bg-background-primary">
        <Box className="text-center">
          <Title order={3}>Loading...</Title>
          <Progress value={50} animated mt="md" className="w-48" />
        </Box>
      </div>
    );
  }

  // Step 1: Profile Setup - Asana-style two-column layout
  if (currentStep === 1) {
    return (
      <div className="min-h-screen flex">
        {/* Left column - Form */}
        <div className="w-full lg:w-[45%] bg-background-secondary flex flex-col justify-between p-8 lg:p-12">
          <div>
            <div className="mb-12">
              <Title order={3} className="text-brand-primary font-bold">
                Exponential
              </Title>
            </div>

            <div className="mb-8">
              <Title order={1} className="text-3xl lg:text-4xl font-bold mb-2 text-text-primary">
                Welcome to Exponential!
              </Title>
              <Text className="text-text-secondary">
                You&apos;re signing up as {userEmail}.
              </Text>
            </div>

            <div className="flex gap-6 mb-6">
              <div className="relative">
                <Avatar
                  src={profileImageUrl}
                  size={100}
                  radius="50%"
                  className="border-2 border-dashed border-border-primary"
                >
                  {isUploadingImage ? (
                    <Loader size="sm" />
                  ) : (
                    <IconUser size={40} className="text-text-muted" />
                  )}
                </Avatar>
                <ActionIcon
                  size="sm"
                  radius="xl"
                  variant="filled"
                  className="absolute bottom-0 right-0 bg-surface-primary border border-border-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                >
                  <IconCamera size={14} className="text-text-secondary" />
                </ActionIcon>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>

              <div className="flex-1">
                <Text fw={500} className="mb-2 text-text-primary">
                  What&apos;s your full name?
                </Text>
                <TextInput
                  placeholder="Your full name"
                  value={data.name}
                  onChange={(e) => setData(prev => ({ ...prev, name: e.target.value }))}
                  size="md"
                  classNames={{
                    input: 'bg-background-primary border-border-primary'
                  }}
                />
              </div>
            </div>

            <Checkbox
              label="Get feature updates and tips via email (recommended)."
              checked={data.emailMarketingOptIn}
              onChange={(e) => setData(prev => ({ ...prev, emailMarketingOptIn: e.currentTarget.checked }))}
              className="mb-8"
              classNames={{
                label: 'text-text-secondary'
              }}
            />
          </div>

          <div>
            <Text size="sm" className="text-text-muted mb-6">
              Wrong account?{' '}
              <Anchor href="/api/auth/signout" className="text-text-secondary hover:text-text-primary">
                Log in
              </Anchor>
              {' '}instead.
            </Text>

            <Button
              fullWidth
              size="lg"
              onClick={handleProfileSubmit}
              loading={isLoading}
              disabled={!data.name.trim()}
            >
              Continue
            </Button>
          </div>
        </div>

        {/* Right column - Illustration */}
        <div
          className="hidden lg:flex w-[55%] items-center justify-center p-12"
          style={{ backgroundColor: 'var(--color-onboarding-illustration-bg)' }}
        >
          <OnboardingIllustration />
        </div>
      </div>
    );
  }

  // Step 2: Tell us about your work - Asana-style two-column layout
  if (currentStep === 2) {
    return (
      <div className="min-h-screen flex">
        {/* Left column - Form */}
        <div className="w-full lg:w-[45%] bg-background-secondary flex flex-col justify-between p-8 lg:p-12">
          <div>
            <div className="mb-12">
              <Title order={3} className="text-brand-primary font-bold">
                Exponential
              </Title>
            </div>

            <div className="mb-8">
              <Title order={1} className="text-3xl lg:text-4xl font-bold mb-2 text-text-primary">
                Tell us about your work
              </Title>
              <Text className="text-text-secondary">
                This will help us tailor Exponential for you.
              </Text>
            </div>

            <Stack gap="lg">
              <Select
                label="What's your role?"
                placeholder="Select your role"
                data={workRoleOptions}
                value={data.workRole}
                onChange={(value) => setData(prev => ({ ...prev, workRole: value }))}
                size="md"
                clearable
                classNames={{
                  input: 'bg-background-primary border-border-primary'
                }}
              />

              <MultiSelect
                label="Which function best describes your work?"
                placeholder="Select all that apply"
                data={workFunctionOptions}
                value={data.workFunction}
                onChange={(value) => setData(prev => ({ ...prev, workFunction: value }))}
                size="md"
                clearable
                searchable
                classNames={{
                  input: 'bg-background-primary border-border-primary'
                }}
              />

              <MultiSelect
                label="What do you want to use Exponential for?"
                placeholder="Select all that apply"
                data={usagePurposeOptions}
                value={data.usagePurposes}
                onChange={(value) => setData(prev => ({ ...prev, usagePurposes: value }))}
                size="md"
                clearable
                searchable
                classNames={{
                  input: 'bg-background-primary border-border-primary'
                }}
              />
            </Stack>
          </div>

          <div className="mt-8">
            <Button
              fullWidth
              size="lg"
              onClick={handleWorkProfileSubmit}
              loading={isLoading}
            >
              Continue
            </Button>
          </div>
        </div>

        {/* Right column - Illustration */}
        <div
          className="hidden lg:flex w-[55%] items-center justify-center p-12"
          style={{ backgroundColor: 'var(--color-onboarding-illustration-bg)' }}
        >
          <OnboardingWorkIllustration />
        </div>
      </div>
    );
  }

  // Steps 3 and 4: Standard layout with stepper
  return (
    <div className="min-h-screen bg-background-primary py-12">
      <div className="max-w-3xl mx-auto px-4">
        <Stack gap="xl">
          {/* Header */}
          <div className="text-center">
            <Title order={1} size="h1" className="text-3xl font-bold mb-2">
              Almost there, {data.name || userName}!
            </Title>
            <Text size="lg" className="text-text-secondary max-w-2xl mx-auto">
              Just a couple more steps to personalize your experience.
            </Text>
          </div>

          {/* Progress Stepper */}
          <Stepper
            active={currentStep - 1}
            color="brand"
            className="mb-8"
          >
            <Stepper.Step label="Profile" description="Set up your profile" />
            <Stepper.Step label="Work" description="Tell us about your work" />
            <Stepper.Step label="Tools" description="What tools do you use?" />
            <Stepper.Step label="First Project" description="Create your first project" />
          </Stepper>

          {/* Step Content */}
          <Card shadow="sm" padding="lg" radius="md" className="border border-border-primary">

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
                                ? 'border-brand-primary bg-surface-secondary'
                                : 'border-border-primary hover:border-border-focus'
                            }`}
                            onClick={() => toggleTool(tool.name)}
                          >
                            {data.selectedTools.includes(tool.name) && (
                              <div className="absolute -top-1 -right-1 bg-brand-primary text-text-inverse rounded-full p-1 z-10">
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
                      projectPriority: (value as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'MEDIUM'
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
      </div>
    </div>
  );
}
