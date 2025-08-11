'use client';

import { Button } from "@mantine/core";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

export function TodayButton() {
  const router = useRouter();
  const { mutate } = api.day.createUserDay.useMutation({
    onError: (error) => {
      // Handle error - maybe show toast
      console.error('Error creating user day:', error);
    }
  });

  const handleTodayClick = () => {
    const today = new Date();
    const formattedDate = format(today, "yyyy-MM-dd");

    // Navigate immediately
    router.push(`/days/${formattedDate}`);

    // Create record in background - the server will handle week creation/linking
    mutate({
      date: today,
    });
  };

  return (
    <Button
      variant="subtle"
      leftSection="+"
      onClick={handleTodayClick}
      styles={{
        root: {
          color: 'rgba(147, 197, 253, 0.9)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          '&:hover': {
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
          }
        }
      }}
    >
      Today 🗺️
    </Button>
  );
} 