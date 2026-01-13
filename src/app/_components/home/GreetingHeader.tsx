"use client";

import { Text } from "@mantine/core";
import { api } from "~/trpc/react";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function GreetingHeader() {
  const { data: currentUser } = api.user.getCurrentUser.useQuery();
  const greeting = getGreeting();
  const userName = currentUser?.name ?? "there";
  const firstName = userName.split(" ")[0] ?? userName;

  return (
    <div className="mb-6">
      <Text className="mb-1 text-3xl font-semibold text-text-primary">
        {greeting}, {firstName}
      </Text>
    </div>
  );
}
