"use client";

import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Group,
  List,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "~/trpc/react";

interface SentrySettingsProps {
  workspace: { id: string; name: string };
  /** Only owners/admins may connect or remove (the server enforces this too). */
  canManage: boolean;
}

/**
 * Workspace-scoped Sentry webhook configuration.
 *
 * Lets an owner/admin pick a destination Product and generates a per-workspace
 * webhook URL + signing secret to paste into a Sentry internal integration. The
 * secret is shown exactly once (right after connecting) — it is never returned
 * again by the status query.
 */
export function SentrySettings({ workspace, canManage }: SentrySettingsProps) {
  const [setupOpened, { open: openSetup, close: closeSetup }] =
    useDisclosure(false);
  const [productId, setProductId] = useState<string | null>(null);
  // Populated once, from the create response — the only time we ever hold the
  // plaintext secret client-side.
  const [created, setCreated] = useState<{
    webhookUrl: string;
    webhookSecret: string;
  } | null>(null);

  const utils = api.useUtils();

  const statusQuery = api.integration.getWorkspaceSentryStatus.useQuery({
    workspaceId: workspace.id,
  });

  const productsQuery = api.product.product.list.useQuery(
    { workspaceId: workspace.id },
    { enabled: setupOpened },
  );

  const createMutation = api.integration.createSentryIntegration.useMutation({
    onSuccess: (data) => {
      void utils.integration.getWorkspaceSentryStatus.invalidate();
      setCreated({
        webhookUrl: data.webhookUrl,
        webhookSecret: data.webhookSecret,
      });
    },
  });

  const removeMutation = api.integration.removeWorkspaceSentry.useMutation({
    onSuccess: () => {
      void utils.integration.getWorkspaceSentryStatus.invalidate();
    },
  });

  function handleClose() {
    closeSetup();
    // Keep `created` cleared so the secret isn't lingering in state after close.
    setCreated(null);
    setProductId(null);
    createMutation.reset();
  }

  const status = statusQuery.data;

  // Connected state.
  if (status?.configured && !setupOpened) {
    return (
      <Stack gap="sm">
        <Group
          gap="sm"
          className="rounded-md border border-border-primary bg-surface-primary p-3"
        >
          <Badge color="green" variant="dot">
            Connected
          </Badge>
          {status.productName && (
            <Text size="sm" className="text-text-secondary">
              Bugs file to{" "}
              <span className="text-text-primary">{status.productName}</span>
            </Text>
          )}
          {canManage && (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              ml="auto"
              loading={removeMutation.isPending}
              onClick={() =>
                removeMutation.mutate({ workspaceId: workspace.id })
              }
            >
              Remove
            </Button>
          )}
        </Group>

        <WebhookField label="Webhook URL" value={status.webhookUrl} />
        <Text size="xs" className="text-text-muted">
          The signing secret is shown only once, when you connect. Remove and
          reconnect to generate a new one.
        </Text>
      </Stack>
    );
  }

  // Not configured (or mid-setup).
  return (
    <>
      {canManage ? (
        <Button variant="light" onClick={openSetup}>
          Connect Sentry
        </Button>
      ) : (
        <Text size="sm" className="text-text-muted">
          Sentry is not configured. Ask a workspace owner or admin to connect it.
        </Text>
      )}

      <Modal
        opened={setupOpened}
        onClose={handleClose}
        title="Connect Sentry"
        size="lg"
      >
        {created ? (
          // Post-create: show the URL + secret to copy into Sentry.
          <Stack gap="md">
            <Alert color="green" icon={<IconCheck size={16} />}>
              Sentry is connected. Copy these into a Sentry internal integration
              now — the secret won&apos;t be shown again.
            </Alert>

            <div>
              <Text size="sm" fw={600} className="text-text-primary" mb={4}>
                Set up in Sentry
              </Text>
              <List size="sm" spacing={4} className="text-text-secondary">
                <List.Item>
                  In Sentry: Settings &rarr; Developer Settings &rarr; New
                  Internal Integration.
                </List.Item>
                <List.Item>
                  Set the <b>Webhook URL</b> to the URL below and paste the{" "}
                  <b>secret</b> as the integration&apos;s Client Secret.
                </List.Item>
                <List.Item>
                  Under Webhooks, enable the <b>issue</b> resource (and
                  optionally <b>alert</b>).
                </List.Item>
              </List>
            </div>

            <WebhookField label="Webhook URL" value={created.webhookUrl} />
            <WebhookField
              label="Signing Secret"
              value={created.webhookSecret}
              secret
            />

            <Group justify="flex-end">
              <Button onClick={handleClose}>Done</Button>
            </Group>
          </Stack>
        ) : (
          // Pre-create: pick the destination product.
          <Stack gap="md">
            <Text size="sm" className="text-text-muted">
              Incoming Sentry issues will be filed as Bug tickets in the product
              you choose.
            </Text>

            <Select
              label="Destination product"
              placeholder="Select a product"
              required
              value={productId}
              onChange={setProductId}
              disabled={productsQuery.isLoading}
              data={
                productsQuery.data?.map((p) => ({
                  value: p.id,
                  label: p.name,
                })) ?? []
              }
              nothingFoundMessage="No products in this workspace"
              searchable
            />

            {createMutation.error && (
              <Alert color="red" icon={<IconX size={16} />}>
                {createMutation.error.message}
              </Alert>
            )}

            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                loading={createMutation.isPending}
                disabled={!productId}
                onClick={() => {
                  if (!productId) return;
                  createMutation.mutate({
                    workspaceId: workspace.id,
                    productId,
                  });
                }}
              >
                Connect
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}

/** Read-only field with a copy button, for a webhook URL or secret. */
function WebhookField({
  label,
  value,
  secret,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const inputProps = {
    label,
    value,
    readOnly: true,
    styles: { input: { fontFamily: "monospace" } },
    rightSection: (
      <CopyButton value={value} timeout={2000}>
        {({ copied, copy }) => (
          <Button
            size="compact-xs"
            variant="subtle"
            color={copied ? "teal" : "gray"}
            onClick={copy}
            leftSection={
              copied ? <IconCheck size={14} /> : <IconCopy size={14} />
            }
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </CopyButton>
    ),
    rightSectionWidth: 92,
  };

  return secret ? (
    <PasswordInput {...inputProps} />
  ) : (
    <TextInput {...inputProps} />
  );
}
