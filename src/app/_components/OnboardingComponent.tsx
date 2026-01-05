'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Title,
  Text,
  Button,
  Stack,
  Group,
  Select,
  TextInput,
  Box,
  Progress,
  Anchor,
  Checkbox,
  Avatar,
  ActionIcon,
  Loader,
  MultiSelect
} from '@mantine/core';
import {
  IconCheck,
  IconArrowRight,
  IconArrowLeft,
  IconBrandSlack,
  IconBrandDiscord,
  IconBrandGithub,
  IconBrandGitlab,
  IconCalendar,
  IconTargetArrow,
  IconTimeline,
  IconCalendarWeek,
  IconSeedling,
  IconSparkles,
  IconDots,
  IconCamera,
  IconUser,
  IconX,
  IconPlus,
  IconList
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { OnboardingIllustration } from './OnboardingIllustration';
import { OnboardingWorkIllustration } from './OnboardingWorkIllustration';
import { OnboardingToolsIllustration } from './OnboardingToolsIllustration';
import { OnboardingProjectIllustration } from './OnboardingProjectIllustration';

type OnboardingStep = 1 | 2 | 3 | 4 | 5;

interface TaskInput {
  id: string;
  name: string;
}

interface OnboardingData {
  name: string;
  emailMarketingOptIn: boolean;
  workRole: string | null;
  workFunction: string[];
  usagePurposes: string[];
  selectedTools: string[];
  projectName: string;
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

// Flat list of tools for Step 3 (Asana-style chips)
const TOOLS = [
  { name: 'Slack', icon: IconBrandSlack },
  { name: 'Discord', icon: IconBrandDiscord },
  { name: 'Asana', icon: IconTargetArrow },
  { name: 'Monday', icon: IconCalendarWeek },
  { name: 'GitHub', icon: IconBrandGithub },
  { name: 'Linear', icon: IconTimeline },
  { name: 'GitLab', icon: IconBrandGitlab },
  { name: 'Google Calendar', icon: IconCalendar },
  { name: 'Granola', icon: IconSeedling },
  { name: 'Fireflies', icon: IconSparkles },
];

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
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [customToolInput, setCustomToolInput] = useState('');
  const [tasks, setTasks] = useState<TaskInput[]>([
    { id: '1', name: '' },
    { id: '2', name: '' },
    { id: '3', name: '' },
  ]);

  const [data, setData] = useState<OnboardingData>({
    name: userName ?? '',
    emailMarketingOptIn: true,
    workRole: null,
    workFunction: [],
    usagePurposes: [],
    selectedTools: [],
    projectName: ''
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

  const handleProjectNameContinue = () => {
    if (!data.projectName.trim()) {
      notifications.show({
        title: 'Project name required',
        message: 'Please enter a name for your project.',
        color: 'orange'
      });
      return;
    }
    setCurrentStep(5);
  };

  const handleAddTask = () => {
    setTasks(prev => [...prev, { id: Date.now().toString(), name: '' }]);
  };

  const handleRemoveTask = (id: string) => {
    if (tasks.length > 1) {
      setTasks(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleTaskChange = (id: string, name: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  };

  const handleCompleteOnboarding = async () => {
    const projectName = data.projectName.trim() || 'My First Project';
    const validTasks = tasks.filter(t => t.name.trim().length > 0);

    setIsLoading(true);
    try {
      await completeOnboarding.mutateAsync({
        projectName,
        projectDescription: '',
        projectPriority: 'MEDIUM',
        tasks: validTasks.map(t => ({ name: t.name.trim() }))
      });

      notifications.show({
        title: 'Welcome to Exponential!',
        message: 'Your project is ready. Let\'s get started!',
        color: 'green',
        icon: <IconCheck size={16} />,
        autoClose: 3000
      });

      setTimeout(() => {
        router.push('/home');
      }, 1500);

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

  const handleSkipOnboarding = async () => {
    setIsLoading(true);
    try {
      await completeOnboarding.mutateAsync({
        projectName: data.projectName.trim() || 'My First Project',
        projectDescription: '',
        projectPriority: 'MEDIUM',
        tasks: []
      });
      router.push('/home');
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
    if (tool === 'Other') {
      setShowOtherInput(!showOtherInput);
      return;
    }
    setData(prev => ({
      ...prev,
      selectedTools: prev.selectedTools.includes(tool)
        ? prev.selectedTools.filter(t => t !== tool)
        : [...prev.selectedTools, tool]
    }));
  };

  const addCustomTool = () => {
    const trimmed = customToolInput.trim();
    if (trimmed && !data.selectedTools.includes(trimmed)) {
      setData(prev => ({
        ...prev,
        selectedTools: [...prev.selectedTools, trimmed]
      }));
      setCustomToolInput('');
    }
  };

  const removeCustomTool = (tool: string) => {
    setData(prev => ({
      ...prev,
      selectedTools: prev.selectedTools.filter(t => t !== tool)
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

  // Step 3: Tools Selection - Asana-style two-column layout
  if (currentStep === 3) {
    // Get custom tools (tools that are selected but not in the TOOLS list)
    const standardToolNames = TOOLS.map(t => t.name);
    const customTools = data.selectedTools.filter(t => !standardToolNames.includes(t));

    return (
      <div className="min-h-screen flex">
        {/* Left column - Form */}
        <div className="w-full lg:w-[45%] bg-background-secondary flex flex-col justify-between p-8 lg:p-12">
          <div>
            <div className="mb-8">
              <Title order={3} className="text-brand-primary font-bold">
                Exponential
              </Title>
            </div>

            <div className="mb-8">
              <Group gap="xs" className="mb-4">
                <ActionIcon
                  variant="subtle"
                  onClick={() => setCurrentStep(2)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <IconArrowLeft size={20} />
                </ActionIcon>
                <Title order={1} className="text-3xl lg:text-4xl font-bold text-text-primary">
                  What tools do you use?
                </Title>
              </Group>
              <Text className="text-text-secondary">
                Exponential connects to tools your team uses every day. Understanding your tools will help us tailor Exponential for you.
              </Text>
            </div>

            {/* Tool chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              {TOOLS.map(tool => (
                <Button
                  key={tool.name}
                  variant={data.selectedTools.includes(tool.name) ? 'filled' : 'outline'}
                  leftSection={<tool.icon size={16} />}
                  onClick={() => toggleTool(tool.name)}
                  className={`transition-all ${
                    data.selectedTools.includes(tool.name)
                      ? ''
                      : 'border-border-primary text-text-primary hover:bg-surface-hover'
                  }`}
                  color={data.selectedTools.includes(tool.name) ? 'brand' : 'gray'}
                >
                  {tool.name}
                </Button>
              ))}
              {/* Other button */}
              <Button
                variant={showOtherInput ? 'filled' : 'outline'}
                leftSection={<IconDots size={16} />}
                onClick={() => toggleTool('Other')}
                className={`transition-all ${
                  showOtherInput
                    ? ''
                    : 'border-border-primary text-text-primary hover:bg-surface-hover'
                }`}
                color={showOtherInput ? 'brand' : 'gray'}
              >
                Other
              </Button>
            </div>

            {/* Other input */}
            {showOtherInput && (
              <div className="mb-6">
                <TextInput
                  placeholder="Enter tool name and press Enter"
                  value={customToolInput}
                  onChange={(e) => setCustomToolInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomTool();
                    }
                  }}
                  rightSection={
                    <ActionIcon onClick={addCustomTool} variant="subtle">
                      <IconArrowRight size={16} />
                    </ActionIcon>
                  }
                  classNames={{
                    input: 'bg-background-primary border-border-primary'
                  }}
                />
              </div>
            )}

            {/* Custom tools display */}
            {customTools.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {customTools.map(tool => (
                  <Button
                    key={tool}
                    variant="filled"
                    color="brand"
                    rightSection={
                      <ActionIcon
                        size="xs"
                        variant="transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCustomTool(tool);
                        }}
                      >
                        <IconX size={12} className="text-text-inverse" />
                      </ActionIcon>
                    }
                  >
                    {tool}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Button
              fullWidth
              size="lg"
              onClick={handleToolsSelection}
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
          <OnboardingToolsIllustration />
        </div>
      </div>
    );
  }

  // Step 4: Project Name - Asana-style two-column layout
  if (currentStep === 4) {
    return (
      <div className="min-h-screen flex">
        {/* Left column - Form */}
        <div className="w-full lg:w-[45%] bg-background-secondary flex flex-col justify-between p-8 lg:p-12">
          <div>
            <div className="mb-8">
              <Title order={3} className="text-brand-primary font-bold">
                Exponential
              </Title>
            </div>

            <div className="mb-8">
              <Group gap="xs" className="mb-4">
                <ActionIcon
                  variant="subtle"
                  onClick={() => setCurrentStep(3)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <IconArrowLeft size={20} />
                </ActionIcon>
                <Title order={1} className="text-3xl lg:text-4xl font-bold text-text-primary">
                  Let&apos;s set up your first project
                </Title>
              </Group>
              <Text className="text-text-secondary">
                What&apos;s something you and your team are currently working on?
              </Text>
            </div>

            <TextInput
              placeholder="e.g., Website Redesign, Q1 Marketing Campaign"
              value={data.projectName}
              onChange={(e) => setData(prev => ({ ...prev, projectName: e.target.value }))}
              size="lg"
              classNames={{
                input: 'bg-background-primary border-border-primary text-xl'
              }}
              styles={{
                input: {
                  fontSize: '1.25rem',
                  padding: '1rem',
                }
              }}
              autoFocus
            />
          </div>

          <div className="mt-8">
            <Button
              fullWidth
              size="lg"
              onClick={handleProjectNameContinue}
              loading={isLoading}
              disabled={!data.projectName.trim()}
              rightSection={<IconArrowRight size={18} />}
            >
              Continue
            </Button>

            <Anchor
              component="button"
              onClick={handleSkipOnboarding}
              className="block text-center mt-4 text-text-muted hover:text-text-secondary"
              disabled={isLoading}
            >
              Skip for now
            </Anchor>
          </div>
        </div>

        {/* Right column - Illustration */}
        <div
          className="hidden lg:flex w-[55%] items-center justify-center p-12"
          style={{ backgroundColor: 'var(--color-onboarding-illustration-bg)' }}
        >
          <OnboardingProjectIllustration />
        </div>
      </div>
    );
  }

  // Step 5: Tasks - Asana-style two-column layout
  const previewTasks = tasks.filter(t => t.name.trim().length > 0);

  return (
    <div className="min-h-screen flex">
      {/* Left column - Form */}
      <div className="w-full lg:w-[45%] bg-background-secondary flex flex-col justify-between p-8 lg:p-12">
        <div>
          <div className="mb-8">
            <Title order={3} className="text-brand-primary font-bold">
              Exponential
            </Title>
          </div>

          <div className="mb-8">
            <Group gap="xs" className="mb-4">
              <ActionIcon
                variant="subtle"
                onClick={() => setCurrentStep(4)}
                className="text-text-secondary hover:text-text-primary"
              >
                <IconArrowLeft size={20} />
              </ActionIcon>
              <Title order={1} className="text-3xl lg:text-4xl font-bold text-text-primary">
                What are a few tasks you need to do?
              </Title>
            </Group>
            <Text className="text-text-secondary">
              Add some initial tasks for {data.projectName || 'your project'}. You can always add more later.
            </Text>
          </div>

          <Stack gap="md">
            {tasks.map((task, index) => (
              <Group key={task.id} gap="sm">
                <TextInput
                  placeholder={
                    index === 0
                      ? 'e.g., Research competitors'
                      : index === 1
                        ? 'e.g., Create wireframes'
                        : 'e.g., Review with team'
                  }
                  value={task.name}
                  onChange={(e) => handleTaskChange(task.id, e.target.value)}
                  className="flex-1"
                  size="md"
                  classNames={{
                    input: 'bg-background-primary border-border-primary'
                  }}
                />
                {tasks.length > 1 && (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => handleRemoveTask(task.id)}
                    disabled={isLoading}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                )}
              </Group>
            ))}

            <Button
              variant="subtle"
              leftSection={<IconPlus size={16} />}
              onClick={handleAddTask}
              className="w-fit"
              disabled={isLoading}
            >
              Add another task
            </Button>
          </Stack>
        </div>

        <div className="mt-8">
          <Button
            fullWidth
            size="lg"
            onClick={handleCompleteOnboarding}
            loading={isLoading}
            rightSection={<IconCheck size={18} />}
          >
            Complete Setup
          </Button>

          <Anchor
            component="button"
            onClick={handleSkipOnboarding}
            className="block text-center mt-4 text-text-muted hover:text-text-secondary"
            disabled={isLoading}
          >
            Skip for now
          </Anchor>
        </div>
      </div>

      {/* Right column - Preview */}
      <div
        className="hidden lg:flex w-[55%] items-center justify-center p-12"
        style={{ backgroundColor: 'var(--color-onboarding-illustration-bg)' }}
      >
        <div className="w-full max-w-md">
          <div className="bg-surface-secondary border border-border-primary rounded-xl p-6 shadow-lg">
            {/* Preview Header */}
            <Group gap="sm" className="mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/20">
                <IconList size={20} className="text-brand-primary" />
              </div>
              <Title order={3} className="text-xl font-semibold text-text-primary">
                {data.projectName || 'Your Project'}
              </Title>
            </Group>

            {/* Preview Tasks */}
            <Stack gap="sm">
              {previewTasks.length > 0 ? (
                previewTasks.map(task => (
                  <Group key={task.id} gap="sm" className="py-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-border-secondary" />
                    <Text className="text-text-primary">{task.name}</Text>
                  </Group>
                ))
              ) : (
                <>
                  {[1, 2, 3, 4, 5].map(i => (
                    <Group key={i} gap="sm" className="py-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-border-secondary" />
                      <div
                        className="h-4 rounded bg-surface-tertiary"
                        style={{ width: `${60 + Math.random() * 80}px` }}
                      />
                    </Group>
                  ))}
                </>
              )}
            </Stack>
          </div>
        </div>
      </div>
    </div>
  );
}
