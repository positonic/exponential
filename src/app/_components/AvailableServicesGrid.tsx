"use client";

import { useState } from "react";
import { Title, Text, Stack, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { ServiceCard } from "./ServiceCard";

interface ProviderOption {
  value: string;
  label: string;
  disabled: boolean;
  oauth: boolean;
}

interface Integration {
  id: string;
  provider: string;
}

interface AvailableServicesGridProps {
  providerOptions: ProviderOption[];
  connectedIntegrations: Integration[];
  onServiceClick: (provider: string) => void;
}

export function AvailableServicesGrid({
  providerOptions,
  connectedIntegrations: _connectedIntegrations,
  onServiceClick,
}: AvailableServicesGridProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter services based on search query
  const filteredServices = providerOptions
    .filter((option) => !option.disabled)
    .filter((option) =>
      option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      option.value.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <Stack gap="lg">
      <div>
        <Title order={2} size="h3">
          Available Services
        </Title>
        <Text c="dimmed" size="sm">
          Connect new external services to expand your automation capabilities
        </Text>
      </div>

      {/* Search Bar */}
      <TextInput
        placeholder="Search for services..."
        leftSection={<IconSearch size={16} />}
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        styles={{
          root: { maxWidth: "400px", width: "100%" },
        }}
      />

      <div className="flex flex-wrap gap-3">
        {filteredServices.length > 0 ? (
          filteredServices.map((option) => (
            <ServiceCard
              key={option.value}
              variant="available"
              serviceName={option.label}
              provider={option.value}
              onCardClick={() => onServiceClick(option.value)}
            />
          ))
        ) : (
          <div className="w-full text-center py-8">
            <Text c="dimmed" size="sm">
              No services found matching &ldquo;{searchQuery}&rdquo;
            </Text>
          </div>
        )}
      </div>
    </Stack>
  );
}
