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
      variant="filled"
      color="dark"
      leftSection="+"
      onClick={handleTodayClick}
    >
      Today 🗺️
    </Button>
  );
} 