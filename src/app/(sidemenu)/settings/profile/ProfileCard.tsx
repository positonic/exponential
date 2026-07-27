'use client';

import { useState } from 'react';
import {
  Paper,
  Avatar,
  Group,
  Stack,
  Text,
  TextInput,
  ActionIcon,
  Skeleton,
  FileButton,
  Tooltip,
  Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconCheck, IconPencil, IconX } from '@tabler/icons-react';
import { api } from '~/trpc/react';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ProfileCard() {
  const utils = api.useUtils();
  const { data: profile, isLoading } = api.user.getProfile.useQuery();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.user.getProfile.invalidate();
      setIsEditingName(false);
      notifications.show({
        title: 'Profile updated',
        message: 'Your name has been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update your name. Please try again.',
        color: 'red',
      });
    },
  });

  const uploadProfileImage = api.user.uploadProfileImage.useMutation({
    onSuccess: async () => {
      await utils.user.getProfile.invalidate();
      notifications.show({
        title: 'Photo uploaded',
        message: 'Your profile photo has been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Upload failed',
        message: error.message || 'Failed to upload image. Please try again.',
        color: 'red',
      });
    },
  });

  const handleImageSelect = (file: File | null) => {
    if (!file) return;

    if (file.size > MAX_IMAGE_BYTES) {
      notifications.show({
        title: 'File too large',
        message: 'Please select an image under 5MB.',
        color: 'red',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      if (!base64) return;
      uploadProfileImage.mutate({ base64Data: base64 });
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return <Skeleton height={140} />;
  }

  const startEditingName = () => {
    setNameDraft(profile?.name ?? '');
    setIsEditingName(true);
  };

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    updateProfile.mutate({ name: trimmed });
  };

  return (
    <Paper p="lg" withBorder className="bg-surface-secondary">
      <Group gap="lg" align="flex-start">
        <div className="relative">
          <Avatar
            src={profile?.image}
            size={72}
            radius="xl"
            className="bg-brand-primary"
          >
            {profile?.name
              ?.split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase() ?? 'U'}
          </Avatar>
          <FileButton onChange={handleImageSelect} accept="image/*">
            {(props) => (
              <Tooltip label="Change photo">
                <ActionIcon
                  {...props}
                  variant="filled"
                  color="brand"
                  size="sm"
                  radius="xl"
                  className="absolute -bottom-1 -right-1"
                  disabled={uploadProfileImage.isPending}
                  aria-label="Upload profile photo"
                >
                  {uploadProfileImage.isPending ? (
                    <Loader size={12} color="white" />
                  ) : (
                    <IconCamera size={14} />
                  )}
                </ActionIcon>
              </Tooltip>
            )}
          </FileButton>
        </div>
        <Stack gap="sm" className="flex-1">
          <div>
            <Text size="xs" className="text-text-muted mb-1">
              Name
            </Text>
            {isEditingName ? (
              <Group gap="xs">
                <TextInput
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.currentTarget.value)}
                  maxLength={100}
                  autoFocus
                  className="flex-1"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveName();
                    if (event.key === 'Escape') setIsEditingName(false);
                  }}
                  aria-label="Display name"
                />
                <ActionIcon
                  variant="filled"
                  color="brand"
                  onClick={saveName}
                  loading={updateProfile.isPending}
                  disabled={!nameDraft.trim()}
                  aria-label="Save name"
                >
                  <IconCheck size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => setIsEditingName(false)}
                  disabled={updateProfile.isPending}
                  aria-label="Cancel editing"
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            ) : (
              <Group gap="xs">
                <Text size="lg" fw={500} className="text-text-primary">
                  {profile?.name ?? 'Unknown'}
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={startEditingName}
                  aria-label="Edit name"
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Group>
            )}
          </div>
          <div>
            <Text size="xs" className="text-text-muted mb-1">
              Email
            </Text>
            <Text className="text-text-secondary">
              {profile?.email ?? 'No email'}
            </Text>
          </div>
        </Stack>
      </Group>
    </Paper>
  );
}
