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
  IconCalendar,
  IconCamera,
  IconUser,
  IconX,
  IconPlus,
  IconList,
  IconPlayerPlay,
  IconClock,
  IconCalendarEvent
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { OnboardingIllustration } from './OnboardingIllustration';
import { OnboardingProjectIllustration } from './OnboardingProjectIllustration';
import { GoogleCalendarConnect } from './GoogleCalendarConnect';

// New flow: 1=Profile+Attribution, 2=Video, 3=Calendar, 4=WorkHours, 5=Project+Tasks
type OnboardingStep = 1 | 2 | 3 | 4 | 5;

interface TaskInput {
  id: string;
  name: string;
  dueDate: Date | null;
  durationMinutes: number | null;
}

interface OnboardingData {
  name: string;
  emailMarketingOptIn: boolean;
  attributionSource: string | null;
  projectName: string;
  // Work hours
  workHoursEnabled: boolean;
  workDays: string[];
  workHoursStart: string;
  workHoursEnd: string;
}

// Attribution options (how did you hear about us?)
const attributionOptions = [
  { value: 'google', label: 'Google Search' },
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'friend', label: 'Friend or colleague' },
  { value: 'article', label: 'Article or blog' },
  { value: 'other', label: 'Other' },
];

// Work days options
const workDayOptions = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

// Duration options for tasks
const durationOptions = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
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
  const [tasks, setTasks] = useState<TaskInput[]>([
    { id: '1', name: '', dueDate: null, durationMinutes: 30 },
    { id: '2', name: '', dueDate: null, durationMinutes: 30 },
    { id: '3', name: '', dueDate: null, durationMinutes: 30 },
  ]);

  const [data, setData] = useState<OnboardingData>({
    name: userName ?? '',
    emailMarketingOptIn: true,
    attributionSource: null,
    projectName: '',
    // Work hours defaults
    workHoursEnabled: true,
    workDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    workHoursStart: '09:00',
    workHoursEnd: '17:00',
  });

  // Get onboarding status
  const { data: onboardingStatus, isLoading: statusLoading } = api.onboarding.getStatus.useQuery();

  // Get calendar connection status
  const { data: calendarStatus } = api.calendar.getConnectionStatus.useQuery();

  // tRPC mutations
  const updateProfile = api.onboarding.updateProfile.useMutation();
  const uploadProfileImage = api.onboarding.uploadProfileImage.useMutation();
  const updateWorkHours = api.onboarding.updateWorkHours.useMutation();
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
        attributionSource: onboardingStatus.attributionSource ?? null,
        workHoursEnabled: onboardingStatus.workHoursEnabled ?? true,
        workDays: onboardingStatus.workDaysJson ? JSON.parse(onboardingStatus.workDaysJson) as string[] : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        workHoursStart: onboardingStatus.workHoursStart ?? '09:00',
        workHoursEnd: onboardingStatus.workHoursEnd ?? '17:00',
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

  // Step 1: Profile + Attribution -> Step 2
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
        emailMarketingOptIn: data.emailMarketingOptIn,
        attributionSource: data.attributionSource ?? undefined,
      });
      setCurrentStep(2);
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

  // Step 2: Video -> Step 3
  const handleVideoNext = () => {
    setCurrentStep(3);
  };

  // Step 3: Calendar -> Step 4
  const handleCalendarNext = () => {
    setCurrentStep(4);
  };

  // Step 4: Work Hours -> Step 5
  const handleWorkHoursSubmit = async () => {
    setIsLoading(true);
    try {
      await updateWorkHours.mutateAsync({
        workHoursEnabled: data.workHoursEnabled,
        workDays: data.workDays,
        workHoursStart: data.workHoursStart,
        workHoursEnd: data.workHoursEnd,
      });
      setCurrentStep(5);
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to save work hours. Please try again.',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTask = () => {
    setTasks(prev => [...prev, { id: Date.now().toString(), name: '', dueDate: null, durationMinutes: 30 }]);
  };

  const handleRemoveTask = (id: string) => {
    if (tasks.length > 1) {
      setTasks(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleTaskChange = (id: string, field: keyof TaskInput, value: string | Date | number | null) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  // Step 5: Complete onboarding
  const handleCompleteOnboarding = async () => {
    const projectName = data.projectName.trim() || 'My First Project';
    const validTasks = tasks.filter(t => t.name.trim().length > 0);

    setIsLoading(true);
    try {
      await completeOnboarding.mutateAsync({
        projectName,
        projectDescription: '',
        projectPriority: 'MEDIUM',
        tasks: validTasks.map(t => ({
          name: t.name.trim(),
          dueDate: t.dueDate ?? undefined,
          durationMinutes: t.durationMinutes ?? undefined,
        }))
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

  // Toggle work day selection
  const toggleWorkDay = (day: string) => {
    setData(prev => ({
      ...prev,
      workDays: prev.workDays.includes(day)
        ? prev.workDays.filter(d => d !== day)
        : [...prev.workDays, day]
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

            <Select
              label="How did you hear about us?"
              placeholder="Select an option"
              data={attributionOptions}
              value={data.attributionSource}
              onChange={(value) => setData(prev => ({ ...prev, attributionSource: value }))}
              size="md"
              clearable
              className="mb-6"
              classNames={{
                input: 'bg-background-primary border-border-primary'
              }}
            />

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

  // Step 2: Welcome Video (skippable)
  if (currentStep === 2) {
    return (
      <div className="min-h-screen flex">
        {/* Left column - Content */}
        <div className="w-full lg:w-[45%] bg-background-secondary flex flex-col justify-between p-8 lg:p-12">
          <div>
            <div className="mb-12">
              <Title order={3} className="text-brand-primary font-bold">
                Exponential
              </Title>
            </div>

            <div className="mb-8">
              <Group gap="xs" className="mb-4">
                <ActionIcon
                  variant="subtle"
                  onClick={() => setCurrentStep(1)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <IconArrowLeft size={20} />
                </ActionIcon>
                <Title order={1} className="text-3xl lg:text-4xl font-bold text-text-primary">
                  See how Exponential works
                </Title>
              </Group>
              <Text className="text-text-secondary">
                Watch this quick video to learn how Exponential can help you achieve more.
              </Text>
            </div>

            {/* Video placeholder */}
            <div className="bg-surface-secondary border border-border-primary rounded-xl p-8 mb-8">
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-20 h-20 rounded-full bg-brand-primary/10 flex items-center justify-center mb-4">
                  <IconPlayerPlay size={40} className="text-brand-primary" />
                </div>
                <Text className="text-text-secondary text-center">
                  Video coming soon
                </Text>
                <Text size="sm" className="text-text-muted text-center mt-2">
                  We&apos;re preparing a quick intro video for you
                </Text>
              </div>
            </div>
          </div>

          <div>
            <Button
              fullWidth
              size="lg"
              onClick={handleVideoNext}
              rightSection={<IconArrowRight size={18} />}
            >
              Continue
            </Button>
            <Anchor
              component="button"
              onClick={handleVideoNext}
              className="block text-center mt-4 text-text-muted hover:text-text-secondary"
            >
              Skip video
            </Anchor>
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

  // Step 3: Calendar Connection (optional)
  if (currentStep === 3) {
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
              <Group gap="xs" className="mb-4">
                <ActionIcon
                  variant="subtle"
                  onClick={() => setCurrentStep(2)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <IconArrowLeft size={20} />
                </ActionIcon>
                <Title order={1} className="text-3xl lg:text-4xl font-bold text-text-primary">
                  Connect your calendar
                </Title>
              </Group>
              <Text className="text-text-secondary">
                Connect your calendar to unlock smart scheduling features and see your day at a glance.
              </Text>
            </div>

            <div className="bg-surface-secondary border border-border-primary rounded-xl p-6 mb-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                  <IconCalendar size={24} className="text-brand-primary" />
                </div>
                <div>
                  <Text fw={500} className="text-text-primary">Google Calendar</Text>
                  <Text size="sm" className="text-text-secondary">
                    {calendarStatus?.isConnected ? 'Connected' : 'Not connected'}
                  </Text>
                </div>
              </div>
              <GoogleCalendarConnect isConnected={calendarStatus?.isConnected} />
            </div>

            <Text size="sm" className="text-text-muted">
              We&apos;ll never sell or share your calendar data. Your privacy is important to us.
            </Text>
          </div>

          <div>
            <Button
              fullWidth
              size="lg"
              onClick={handleCalendarNext}
              rightSection={<IconArrowRight size={18} />}
            >
              {calendarStatus?.isConnected ? 'Continue' : 'Continue without calendar'}
            </Button>
            {!calendarStatus?.isConnected && (
              <Anchor
                component="button"
                onClick={handleCalendarNext}
                className="block text-center mt-4 text-text-muted hover:text-text-secondary"
              >
                Skip for now
              </Anchor>
            )}
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

  // Step 4: Work Hours Setup
  if (currentStep === 4) {
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
              <Group gap="xs" className="mb-4">
                <ActionIcon
                  variant="subtle"
                  onClick={() => setCurrentStep(3)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <IconArrowLeft size={20} />
                </ActionIcon>
                <Title order={1} className="text-3xl lg:text-4xl font-bold text-text-primary">
                  Set your work hours
                </Title>
              </Group>
              <Text className="text-text-secondary">
                Help us understand when you work so we can optimize your schedule.
              </Text>
            </div>

            {/* Work days selection */}
            <div className="mb-6">
              <Text fw={500} className="mb-3 text-text-primary">Which days do you work?</Text>
              <div className="flex flex-wrap gap-2">
                {workDayOptions.map(day => (
                  <Button
                    key={day.value}
                    variant={data.workDays.includes(day.value) ? 'filled' : 'outline'}
                    onClick={() => toggleWorkDay(day.value)}
                    size="sm"
                    className={data.workDays.includes(day.value) ? '' : 'border-border-primary text-text-primary'}
                    color={data.workDays.includes(day.value) ? 'brand' : 'gray'}
                  >
                    {day.label.slice(0, 3)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Work hours */}
            <div className="mb-6">
              <Text fw={500} className="mb-3 text-text-primary">What are your typical work hours?</Text>
              <Group gap="md">
                <Select
                  label="Start time"
                  value={data.workHoursStart}
                  onChange={(value) => setData(prev => ({ ...prev, workHoursStart: value ?? '09:00' }))}
                  data={[
                    { value: '06:00', label: '6:00 AM' },
                    { value: '07:00', label: '7:00 AM' },
                    { value: '08:00', label: '8:00 AM' },
                    { value: '09:00', label: '9:00 AM' },
                    { value: '10:00', label: '10:00 AM' },
                    { value: '11:00', label: '11:00 AM' },
                  ]}
                  className="flex-1"
                  classNames={{ input: 'bg-background-primary border-border-primary' }}
                />
                <Select
                  label="End time"
                  value={data.workHoursEnd}
                  onChange={(value) => setData(prev => ({ ...prev, workHoursEnd: value ?? '17:00' }))}
                  data={[
                    { value: '15:00', label: '3:00 PM' },
                    { value: '16:00', label: '4:00 PM' },
                    { value: '17:00', label: '5:00 PM' },
                    { value: '18:00', label: '6:00 PM' },
                    { value: '19:00', label: '7:00 PM' },
                    { value: '20:00', label: '8:00 PM' },
                    { value: '21:00', label: '9:00 PM' },
                  ]}
                  className="flex-1"
                  classNames={{ input: 'bg-background-primary border-border-primary' }}
                />
              </Group>
            </div>

            <Text size="sm" className="text-text-muted">
              You can change these settings anytime in your profile.
            </Text>
          </div>

          <div className="mt-8">
            <Button
              fullWidth
              size="lg"
              onClick={handleWorkHoursSubmit}
              loading={isLoading}
              rightSection={<IconArrowRight size={18} />}
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
