"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card,
  Text,
  Button,
  Group,
  Badge,
  Stack,
  TextInput,
  Code,
  Loader,
} from "@mantine/core";
import { IconMessageCircle } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface MatrixGatewayCardProps {
  assistantSaved?: boolean;
  /** When true, renders without the outer Card wrapper (for use inside a Modal) */
  embedded?: boolean;
}

/**
 * "Connect Matrix" card for /settings/assistant, mirroring TelegramGatewayCard.
 * Flow difference (ADR-0043): the user enters their Matrix ID, the BOT creates
 * an unencrypted DM and invites them, and they reply there with the pairing
 * code shown here — the bot cannot read user-created (encrypted) DMs.
 */
export function MatrixGatewayCard({
  assistantSaved = false,
  embedded = false,
}: MatrixGatewayCardProps) {
  const [mxid, setMxid] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = api.matrixGateway.getStatus.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });

  const initiatePairing = api.matrixGateway.initiatePairing.useMutation({
    onSuccess: () => {
      // Start polling for pairing completion
      pollRef.current = setInterval(() => {
        void status.refetch();
      }, 2500);
    },
  });

  const disconnect = api.matrixGateway.disconnect.useMutation({
    onSuccess: () => {
      void status.refetch();
    },
  });

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
            <IconMessageCircle size={24} className="text-brand-primary" />
            <Text fw={600} className="text-text-primary">
              Matrix
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
            Connected as <b>{status.data?.mxid}</b>
          </Text>
          <Text size="xs" className="text-text-muted">
            Switch agents from the chat with <Code>!agent NAME</Code>, or
            @mention one inline.
          </Text>

          <Button
            variant="light"
            color="red"
            onClick={() => disconnect.mutate()}
            loading={disconnect.isPending}
          >
            Disconnect Matrix
          </Button>
        </Stack>
      ) : isPairing ? (
        <Stack gap="sm" align="center">
          <Text size="sm" ta="center" className="text-text-secondary">
            <b>{initiatePairing.data?.botUserId}</b> has invited you to a chat.
            Accept the invite in your Matrix client, then send this code there:
          </Text>

          <Code fz="xl" px="md" py="xs">
            {initiatePairing.data?.pairingCode}
          </Code>

          <Group gap="xs">
            <Loader size="xs" />
            <Text size="xs" className="text-text-muted">
              Waiting for you to send the code... (expires in{" "}
              {Math.round((initiatePairing.data?.expiresInSeconds ?? 600) / 60)}{" "}
              minutes)
            </Text>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Text size="sm" className="text-text-secondary">
            Chat with your AI assistant from any Matrix client (Element, etc.).
          </Text>

          <TextInput
            label="Your Matrix ID"
            placeholder="@you:syntro.fi"
            value={mxid}
            onChange={(e) => setMxid(e.currentTarget.value)}
            error={
              initiatePairing.error ? initiatePairing.error.message : undefined
            }
            classNames={{
              input:
                "bg-surface-primary border-border-primary text-text-primary",
              label: "text-text-secondary",
            }}
          />

          <Button
            onClick={() => initiatePairing.mutate({ mxid: mxid.trim() })}
            loading={initiatePairing.isPending}
            leftSection={<IconMessageCircle size={18} />}
            disabled={!assistantSaved || !mxid.trim()}
          >
            {assistantSaved ? "Connect Matrix" : "1st - Click Update Assistant"}
          </Button>
        </Stack>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <Card
      className="bg-surface-secondary border-border-primary"
      withBorder
      radius="md"
      p="lg"
    >
      {content}
    </Card>
  );
}
