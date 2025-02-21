"use client";

import * as React from 'react';
import { api } from "~/trpc/react";
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';
import { TextInput, Button, Box, Paper, Badge } from '@mantine/core';
import Link from 'next/link';

interface VideoFormValues {
  videoUrl: string;
}

export function VideosList() {
  const { data: videos, isLoading } = api.video.get.useQuery();
  const utils = api.useUtils();
  const addVideoMutation = api.video.create.useMutation({
    onSuccess: async () => {
      await utils.video.get.invalidate();
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

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
        {videos?.map((video) => (
          <Link 
            href={`/video/${video.slug}`} 
            key={video.id}
            className="block no-underline"
          >
            <Paper 
              className="bg-transparent p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              {video.title && <p className="text-sm mb-2">{video.title}</p>}
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  color={video.status === 'PROCESSING' ? 'yellow' : 
                         video.status === 'COMPLETED' ? 'green' : 
                         video.status === 'FAILED' ? 'red' : 'gray'}
                         variant="light">
                  {video.status}
                </Badge>
              </div>
              <p className="text-sm mb-2">URL: {video.videoUrl}</p>
              <p className="text-sm mb-2">Slug: {video.slug}</p>
              {video.createdAt && (
                <p className="text-sm text-gray-500">
                  Added: {new Date(video.createdAt).toLocaleString()}
                </p>
              )}
            </Paper>
          </Link>
        ))}
      </div>
      <Paper className="p-6" style={{ backgroundColor: 'transparent' }}>
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

      
    </div>
  );
} 