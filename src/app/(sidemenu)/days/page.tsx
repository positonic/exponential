"use client";
import { Container, Title, Button } from "@mantine/core";
import { DaysTable } from "~/app/_components/DaysTable";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { api } from "~/trpc/react";

export default function Days() {
  const router = useRouter();
  const { mutate } = api.day.createUserDay.useMutation({
    onError: (error) => {
      // Handle error - maybe show toast
      console.error(error);
    }
  });

  const handleTodayClick = async () => {
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
    <Container size="xl" className="py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Title
          order={1}
          className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent"
        >
          🌻 Daily tracking
        </Title>
        <Button 
            variant="filled" 
            color="dark"
            leftSection="+"
            onClick={handleTodayClick}
          >
            Today
          </Button>
      </div>

      {/* Content */}
      <DaysTable />
    </Container>
  );
} 