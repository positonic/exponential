"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Stack,
  Text,
  Button,
  Group,
  Loader,
  Image,
  Badge,
  Alert,
  Progress,
  Paper,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconBrandWhatsapp,
  IconRefresh,
  IconCheck,
  IconX,
  IconPhone,
  IconTrash,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface WhatsAppGatewayModalProps {
  opened: boolean;
  onClose: () => void;
}

interface GatewaySession {
  id: string;
  sessionId: string;
  phoneNumber: string | null;
  status: string;
  connectedAt?: string;
  createdAt: string;
}

type ViewState = "list" | "connecting" | "connected";

export function WhatsAppGatewayModal({
  opened,
  onClose,
}: WhatsAppGatewayModalProps) {
  const [viewState, setViewState] = useState<ViewState>("list");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [qrRefreshCountdown, setQrRefreshCountdown] = useState(15);

  // Check if gateway is configured
  const { data: configData } = api.whatsappGateway.isConfigured.useQuery(
    undefined,
    {
      enabled: opened,
    }
  );

  // Queries
  const {
    data: sessions,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
  } = api.whatsappGateway.listSessions.useQuery(undefined, {
    enabled: opened && configData?.configured,
  });

  const {
    data: qrData,
    refetch: refetchQr,
    isLoading: qrLoading,
  } = api.whatsappGateway.getQrCode.useQuery(
    { sessionId: currentSessionId! },
    {
      enabled:
        !!currentSessionId &&
        viewState === "connecting" &&
        configData?.configured,
      refetchInterval: false, // Manual refresh
    }
  );

  const { data: statusData } = api.whatsappGateway.getSessionStatus.useQuery(
    { sessionId: currentSessionId! },
    {
      enabled:
        !!currentSessionId &&
        viewState === "connecting" &&
        configData?.configured,
      refetchInterval: 2500, // Poll every 2.5s
    }
  );

  // Mutations
  const initiateLoginMutation = api.whatsappGateway.initiateLogin.useMutation({
    onSuccess: (data) => {
      setCurrentSessionId(data.sessionId);
      setViewState("connecting");
      setQrRefreshCountdown(15);
    },
    onError: (error) => {
      console.error("[WhatsAppGateway] Login failed:", error);
    },
  });

  const disconnectMutation = api.whatsappGateway.disconnectSession.useMutation({
    onSuccess: () => {
      void refetchSessions();
    },
  });

  const deleteMutation = api.whatsappGateway.deleteSession.useMutation({
    onSuccess: () => {
      void refetchSessions();
    },
  });

  // Handle connection success
  useEffect(() => {
    if (statusData?.connected) {
      setViewState("connected");
      void refetchSessions();
    }
  }, [statusData?.connected, refetchSessions]);

  // QR code refresh countdown
  useEffect(() => {
    if (viewState !== "connecting") return;

    const interval = setInterval(() => {
      setQrRefreshCountdown((prev) => {
        if (prev <= 1) {
          void refetchQr();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [viewState, refetchQr]);

  // Reset state when modal closes
  useEffect(() => {
    if (!opened) {
      setViewState("list");
      setCurrentSessionId(null);
      setQrRefreshCountdown(15);
    }
  }, [opened]);

  const handleConnect = useCallback(() => {
    initiateLoginMutation.mutate();
  }, [initiateLoginMutation]);

  const handleDisconnect = useCallback(
    (sessionId: string) => {
      disconnectMutation.mutate({ sessionId });
    },
    [disconnectMutation]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate({ id });
    },
    [deleteMutation]
  );

  const handleBackToList = useCallback(() => {
    setViewState("list");
    setCurrentSessionId(null);
    void refetchSessions();
  }, [refetchSessions]);

  const connectedSessions =
    sessions?.filter((s: GatewaySession) => s.status === "CONNECTED") ?? [];
  // Show all non-connected sessions (PENDING, DISCONNECTED, ERROR, etc.) so users can clean them up
  const otherSessions = sessions?.filter((s: GatewaySession) => s.status !== "CONNECTED") ?? [];

  // If gateway is not configured, show setup message
  if (opened && configData && !configData.configured) {
    return (
      <Modal
        opened={opened}
        onClose={onClose}
        title={
          <Group>
            <IconBrandWhatsapp size={24} className="text-brand-success" />
            <Text fw={600}>WhatsApp Connection</Text>
          </Group>
        }
        size="md"
      >
        <Stack align="center" py="xl" gap="md">
          <IconBrandWhatsapp size={48} className="text-text-muted" />
          <Text c="dimmed" ta="center">
            WhatsApp Gateway is not configured.
            <br />
            Please set the WHATSAPP_GATEWAY_URL environment variable.
          </Text>
        </Stack>
      </Modal>
    );
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconBrandWhatsapp size={24} className="text-brand-success" />
          <Text fw={600}>WhatsApp Connection</Text>
        </Group>
      }
      size="md"
    >
      <Stack gap="md">
        {/* List View */}
        {viewState === "list" && (
          <>
            {sessionsLoading ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Loading sessions...
                </Text>
              </Group>
            ) : connectedSessions.length === 0 && otherSessions.length === 0 ? (
              <Stack align="center" py="xl" gap="md">
                <IconBrandWhatsapp size={48} className="text-text-muted" />
                <Text c="dimmed" ta="center">
                  No WhatsApp accounts connected.
                  <br />
                  Connect your WhatsApp to interact with agents.
                </Text>
                <Button
                  onClick={handleConnect}
                  loading={initiateLoginMutation.isPending}
                  leftSection={<IconBrandWhatsapp size={16} />}
                  color="green"
                >
                  Connect WhatsApp
                </Button>
              </Stack>
            ) : (
              <>
                {connectedSessions.map((session: GatewaySession) => (
                  <Paper
                    key={session.id}
                    p="md"
                    withBorder
                    className="bg-surface-secondary"
                  >
                    <Group justify="space-between">
                      <Group>
                        <IconPhone size={20} />
                        <div>
                          <Text fw={500}>{session.phoneNumber ?? "Unknown"}</Text>
                          <Text size="xs" c="dimmed">
                            Connected{" "}
                            {session.connectedAt
                              ? new Date(session.connectedAt).toLocaleDateString()
                              : ""}
                          </Text>
                        </div>
                      </Group>
                      <Group>
                        <Badge color="green" variant="light">
                          Connected
                        </Badge>
                        <Tooltip label="Disconnect">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDisconnect(session.sessionId)}
                            loading={disconnectMutation.isPending}
                          >
                            <IconX size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>
                  </Paper>
                ))}

                {/* Show other sessions that can be cleaned up */}
                {otherSessions.length > 0 && (
                  <div className="mt-4">
                    <Text size="sm" c="dimmed" mb="xs">
                      Other sessions:
                    </Text>
                    {otherSessions.map((session: GatewaySession) => (
                      <Paper
                        key={session.id}
                        p="sm"
                        withBorder
                        className="bg-surface-secondary mb-2"
                      >
                        <Group justify="space-between">
                          <Group gap="xs">
                            <Badge size="xs" color="gray" variant="light">
                              {session.status}
                            </Badge>
                            <Text size="sm" c="dimmed">
                              {new Date(session.createdAt).toLocaleString()}
                            </Text>
                          </Group>
                          <Tooltip label="Delete">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="sm"
                              onClick={() => handleDelete(session.id)}
                              loading={deleteMutation.isPending}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Paper>
                    ))}
                  </div>
                )}

                <Button
                  onClick={handleConnect}
                  loading={initiateLoginMutation.isPending}
                  leftSection={<IconBrandWhatsapp size={16} />}
                  variant="light"
                  color="green"
                  fullWidth
                >
                  Connect Another Account
                </Button>
              </>
            )}
          </>
        )}

        {/* Connecting View - QR Code */}
        {viewState === "connecting" && (
          <Stack align="center" gap="md">
            <Text ta="center" c="dimmed" size="sm">
              Scan this QR code with WhatsApp on your phone
            </Text>

            <Paper
              p="md"
              withBorder
              className="bg-surface-primary"
              style={{ position: "relative" }}
            >
              {qrLoading ? (
                <Stack align="center" justify="center" h={256} w={256}>
                  <Loader size="lg" />
                </Stack>
              ) : qrData?.qrCode ? (
                <Image
                  src={qrData.qrCode}
                  alt="WhatsApp QR Code"
                  w={256}
                  h={256}
                />
              ) : (
                <Stack align="center" justify="center" h={256} w={256}>
                  <Text c="dimmed">QR code expired</Text>
                  <Button
                    onClick={() => void refetchQr()}
                    leftSection={<IconRefresh size={16} />}
                    variant="light"
                  >
                    Refresh
                  </Button>
                </Stack>
              )}
            </Paper>

            {/* Refresh countdown */}
            <Stack gap="xs" w="100%">
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  QR code refreshes in {qrRefreshCountdown}s
                </Text>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    void refetchQr();
                    setQrRefreshCountdown(15);
                  }}
                >
                  <IconRefresh size={14} />
                </ActionIcon>
              </Group>
              <Progress value={(qrRefreshCountdown / 15) * 100} size="xs" />
            </Stack>

            <Alert color="blue" variant="light">
              <Text size="sm">
                Open WhatsApp on your phone, go to Settings &gt; Linked Devices
                &gt; Link a Device, then scan the QR code.
              </Text>
            </Alert>

            <Button variant="subtle" onClick={handleBackToList}>
              Cancel
            </Button>
          </Stack>
        )}

        {/* Connected View */}
        {viewState === "connected" && (
          <Stack align="center" gap="md" py="xl">
            <IconCheck size={48} className="text-brand-success" />
            <Text fw={600} size="lg">
              WhatsApp Connected!
            </Text>
            <Text c="dimmed" ta="center">
              Phone: {statusData?.phoneNumber ?? "Unknown"}
            </Text>
            <Button onClick={handleBackToList} variant="light">
              Done
            </Button>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
