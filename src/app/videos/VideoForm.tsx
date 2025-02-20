'use client';

import * as React from 'react';
import { api } from "~/trpc/react";
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';
import { TextInput, Button, Box, Paper } from '@mantine/core';

interface VideoFormValues {
  videoUrl: string;
}

export function VideoForm() {
  const utils = api.useUtils();
  const addVideoMutation = api.video.create.useMutation({
    onSuccess: () => {
      utils.video.get.invalidate();
    },
  });

  const form = useForm<VideoFormValues>({
    initialValues: {
      videoUrl: '',
    },
    validate: {
      videoUrl: (value) => {
        if (!value) return 'Video URL is required';
        try {
          new URL(value);
          return null;
        } catch {
          return 'Please enter a valid URL';
        }
      },
    },
  });

  const handleSubmit = async (values: VideoFormValues) => {
    const notificationId = notifications.show({
      id: 'adding-video',
      title: 'Adding Video',
      message: 'Please wait while we process the video...',
      loading: true,
      autoClose: false,
      withCloseButton: false,
    });

    try {
      await addVideoMutation.mutateAsync({ url: values.videoUrl });
      notifications.update({
        id: notificationId,
        title: 'Success',
        message: 'Video added successfully',
        color: 'green',
        icon: <IconCheck size="1rem" />,
        autoClose: 2000,
      });
      form.reset();
    } catch (error) {
      notifications.update({
        id: notificationId,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to add video',
        color: 'red',
        icon: <IconX size="1rem" />,
        autoClose: 2000,
      });
    }
  };

  return (
    <Paper className="p-6">
      <h2 className="text-lg font-semibold mb-4">Add New Video</h2>
      <Box className="max-w-2xl">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput
            label="Video URL"
            placeholder="Enter YouTube or other video URL"
            className="mb-4"
            {...form.getInputProps('videoUrl')}
          />
          <Button type="submit">Add Video</Button>
        </form>
      </Box>
    </Paper>
  );
} 