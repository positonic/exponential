"use client";

import * as React from 'react';
import { api } from "~/trpc/react";
import { Paper, Badge } from '@mantine/core';
import Link from 'next/link';
import { VideoForm } from '../VideoForm';

export function VideosList() {
  const { data: videos, isLoading } = api.video.get.useQuery();

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
      <VideoForm />
    </div>
  );
} 