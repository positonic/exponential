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
  Loader
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

type OnboardingStep = 1 | 2 | 3;

interface OnboardingData {
  name: string;
  emailMarketingOptIn: boolean;
  selectedTools: string[];
  projectName: string;
  projectDescription: string;
  projectPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  template?: 'personal' | 'work' | 'learning' | 'scratch';
}

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
  const updateTools = api.onboarding.updateTools.useMutation();
  const completeOnboarding = api.onboarding.completeOnboarding.useMutation();

  // Set initial step based on current progress
  useEffect(() => {
    if (onboardingStatus && !onboardingStatus.isCompleted) {
      // Map old step numbers to new (1->1, 2->1, 3->2, 4->3)
      const step = onboardingStatus.onboardingStep;
      const mappedStep = step <= 2 ? 1 : step === 3 ? 2 : 3;
      setCurrentStep(mappedStep as OnboardingStep);
      setData(prev => ({
        ...prev,
        name: onboardingStatus.name ?? userName ?? '',
        emailMarketingOptIn: onboardingStatus.emailMarketingOptIn ?? true,
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      notifications.show({
        title: 'Invalid file',
        message: 'Please select an image file.',
        color: 'red'
      });
      return;
    }

    // Validate file size (max 5MB)
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
      // Convert to base64
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
        message: 'Let\'s see what tools you use.',
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

  const handleToolsSelection = async () => {
    setIsLoading(true);
    try {
      await updateTools.mutateAsync({ selectedTools: data.selectedTools });
      setCurrentStep(3);

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
            {/* Logo placeholder - replace with actual logo */}
            <div className="mb-12">
              <Title order={3} className="text-brand-primary font-bold">
                Exponential
              </Title>
            </div>

            {/* Welcome text */}
            <div className="mb-8">
              <Title order={1} className="text-3xl lg:text-4xl font-bold mb-2 text-text-primary">
                Welcome to Exponential!
              </Title>
              <Text className="text-text-secondary">
                You&apos;re signing up as {userEmail}.
              </Text>
            </div>

            {/* Profile photo and name form */}
            <div className="flex gap-6 mb-6">
              {/* Profile photo upload */}
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

              {/* Name input */}
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

            {/* Email opt-in */}
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

          {/* Bottom section */}
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

  // Steps 2 and 3: Standard layout with stepper
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
            <Stepper.Step label="Tools" description="What tools do you use?" />
            <Stepper.Step label="First Project" description="Create your first project" />
          </Stepper>

          {/* Step Content */}
          <Card shadow="sm" padding="lg" radius="md" className="border border-border-primary">

            {/* Step 2: Tool Selection */}
            {currentStep === 2 && (
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
                            {/* Check mark overlay */}
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

            {/* Step 3: First Project */}
            {currentStep === 3 && (
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
            Step {currentStep} of 3 • You can change these settings later in your profile
          </Text>
        </Stack>
      </div>
    </div>
  );
}
