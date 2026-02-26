"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card,
  Text,
  Button,
  Group,
  Badge,
  Stack,
  Select,
  Loader,
} from "@mantine/core";
import { IconBrandTelegram } from "@tabler/icons-react";
import { api } from "~/trpc/react";

const AGENT_OPTIONS = [
  { value: "assistant", label: "Assistant (customizable)" },
  { value: "zoe", label: "Zoe (companion)" },
  { value: "paddy", label: "Paddy (project manager)" },
  { value: "pierre", label: "Pierre (crypto trading)" },
  { value: "ash", label: "Ash (lean startup)" },
  { value: "weather", label: "Weather Agent" },
];

interface TelegramGatewayCardProps {
  assistantSaved?: boolean;
  /** When true, renders without the outer Card wrapper (for use inside a Modal) */
  embedded?: boolean;
}

export function TelegramGatewayCard({ assistantSaved = false, embedded = false }: TelegramGatewayCardProps) {
  const [agentId, setAgentId] = useState("assistant");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = api.telegramGateway.getStatus.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });

  const initiatePairing = api.telegramGateway.initiatePairing.useMutation({
    onSuccess: () => {
      // Start polling for pairing completion
      pollRef.current = setInterval(() => {
        void status.refetch();
      }, 2500);
    },
  });

  const disconnect = api.telegramGateway.disconnect.useMutation({
    onSuccess: () => {
      void status.refetch();
    },
  });

  const updateSettings = api.telegramGateway.updateSettings.useMutation();

  // Stop polling when paired
  useEffect(() => {
    if (status.data?.paired && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status.data?.paired]);

  const isPaired = status.data?.paired;
  const isPairing = initiatePairing.isSuccess && !isPaired;

  const content = (
    <>
      {!embedded && (
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <IconBrandTelegram size={24} className="text-brand-primary" />
            <Text fw={600} className="text-text-primary">
              Telegram
            </Text>
          </Group>
          <Badge color={isPaired ? "green" : "gray"} variant="light">
            {isPaired ? "Connected" : "Not connected"}
          </Badge>
        </Group>
      )}

      {isPaired ? (
        <Stack gap="sm">
          <Text size="sm" className="text-text-secondary">
            Connected as <b>@{status.data?.telegramUsername}</b>
          </Text>

          <Select
            label="Default agent"
            data={AGENT_OPTIONS}
            value={status.data?.agentId ?? "assistant"}
            onChange={(value) => {
              if (value) updateSettings.mutate({ agentId: value });
            }}
            classNames={{
              input:
                "bg-surface-primary border-border-primary text-text-primary",
              label: "text-text-secondary",
            }}
          />

          <Button
            variant="light"
            color="red"
            onClick={() => disconnect.mutate()}
            loading={disconnect.isPending}
          >
            Disconnect Telegram
          </Button>
        </Stack>
      ) : isPairing ? (
        <Stack gap="sm" align="center">
          <Text size="sm" ta="center" className="text-text-secondary">
            Tap the link below to open Telegram and connect:
          </Text>

          <Button
            component="a"
            href={initiatePairing.data?.deepLink}
            target="_blank"
            rel="noopener"
            leftSection={<IconBrandTelegram size={18} />}
            size="md"
          >
            Open in Telegram
          </Button>

          <Group gap="xs">
            <Loader size="xs" />
            <Text size="xs" className="text-text-muted">
              Waiting for you to tap the link...
            </Text>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Text size="sm" className="text-text-secondary">
            Chat with your AI assistant directly from Telegram.
          </Text>

          <Select
            label="Default agent"
            data={AGENT_OPTIONS}
            value={agentId}
            onChange={(value) => setAgentId(value ?? "assistant")}
            classNames={{
              input:
                "bg-surface-primary border-border-primary text-text-primary",
              label: "text-text-secondary",
            }}
          />

          <Button
            onClick={() => initiatePairing.mutate({ agentId })}
            loading={initiatePairing.isPending}
            leftSection={<IconBrandTelegram size={18} />}
            disabled={!assistantSaved}
          >
            {assistantSaved ? 'Connect Telegram' : '1st - Click Update Assistant'}
          </Button>
        </Stack>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <Card className="bg-surface-secondary border-border-primary" withBorder radius="md" p="lg">
      {content}
    </Card>
  );
}
