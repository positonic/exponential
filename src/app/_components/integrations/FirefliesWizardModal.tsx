"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  Stepper,
  Button,
  TextInput,
  Text,
  Anchor,
  Group,
  Stack,
  Alert,
  CopyButton,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  Loader,
  List,
  ThemeIcon,
  Box,
  Paper,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconAlertCircle,
  IconExternalLink,
  IconKey,
  IconSettings,
  IconWebhook,
  IconCircleCheck,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

type WizardStep =
  | "checking"
  | "existing"
  | "api-key"
  | "testing"
  | "configure"
  | "creating"
  | "webhook"
  | "complete";

interface FirefliesWizardModalProps {
  opened: boolean;
  onClose: () => void;
  teamId?: string;
}

export function FirefliesWizardModal({
  opened,
  onClose,
  teamId,
}: FirefliesWizardModalProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>("checking");
  const [apiKey, setApiKey] = useState("");
  const [integrationName, setIntegrationName] = useState("Fireflies");
  const [scope, setScope] = useState<"personal" | "team">("personal");
  const [error, setError] = useState<string | null>(null);

  // Created integration data (stored for potential future use)
  const [_createdIntegrationId, setCreatedIntegrationId] = useState<
    string | null
  >(null);
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  // Existing integration data
  const [existingIntegration, setExistingIntegration] = useState<{
    id: string;
    name: string;
    createdAt: string;
  } | null>(null);

  // tRPC queries and mutations
  const checkExisting = api.mastra.firefliesCheckExisting.useQuery(
    { teamId },
    {
      enabled: opened && step === "checking",
      retry: false,
    }
  );

  const testApiKey = api.mastra.firefliesTestApiKey.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setError(null);
        setStep("configure");
      } else {
        setError(result.error ?? "Failed to verify API key");
        setStep("api-key");
      }
    },
    onError: (err) => {
      setError(err.message);
      setStep("api-key");
    },
  });

  const createIntegration = api.mastra.firefliesCreateIntegration.useMutation({
    onSuccess: (result) => {
      setCreatedIntegrationId(result.integrationId);
      setError(null);
      // Now generate webhook token
      generateWebhookToken.mutate({
        integrationId: result.integrationId,
        expiresIn: "90d",
      });
    },
    onError: (err) => {
      setError(err.message);
      setStep("configure");
    },
  });

  const generateWebhookToken =
    api.mastra.firefliesGenerateWebhookToken.useMutation({
      onSuccess: (result) => {
        setWebhookToken(result.token);
        // Now get webhook URL
        void getWebhookUrl.refetch();
      },
      onError: (err) => {
        setError(err.message);
        setStep("configure");
      },
    });

  const getWebhookUrl = api.mastra.firefliesGetWebhookUrl.useQuery(undefined, {
    enabled: false,
  });

  // Handle webhook URL fetch success
  useEffect(() => {
    if (getWebhookUrl.data && webhookToken) {
      setWebhookUrl(getWebhookUrl.data.webhookUrl);
      setStep("webhook");
    }
  }, [getWebhookUrl.data, webhookToken]);

  // Handle initial check
  useEffect(() => {
    if (checkExisting.data) {
      if (checkExisting.data.exists && checkExisting.data.integrationId) {
        setExistingIntegration({
          id: checkExisting.data.integrationId,
          name: checkExisting.data.name ?? "Fireflies",
          createdAt: checkExisting.data.createdAt ?? "",
        });
        setStep("existing");
      } else {
        setStep("api-key");
      }
    } else if (checkExisting.error) {
      // If check fails, proceed to API key step
      setStep("api-key");
    }
  }, [checkExisting.data, checkExisting.error]);

  // Reset state when modal opens
  useEffect(() => {
    if (opened) {
      setStep("checking");
      setApiKey("");
      setIntegrationName("Fireflies");
      setScope("personal");
      setError(null);
      setCreatedIntegrationId(null);
      setWebhookToken(null);
      setWebhookUrl(null);
      setExistingIntegration(null);
    }
  }, [opened]);

  const handleTestApiKey = () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }
    setError(null);
    setStep("testing");
    testApiKey.mutate({ apiKey: apiKey.trim() });
  };

  const handleCreateIntegration = () => {
    if (!integrationName.trim()) {
      setError("Please enter a name for this integration");
      return;
    }
    setError(null);
    setStep("creating");
    createIntegration.mutate({
      name: integrationName.trim(),
      apiKey: apiKey.trim(),
      scope,
      teamId: scope === "team" ? teamId : undefined,
    });
  };

  const handleReconfigure = () => {
    setExistingIntegration(null);
    setStep("api-key");
  };

  const getActiveStep = (): number => {
    switch (step) {
      case "checking":
      case "existing":
      case "api-key":
      case "testing":
        return 0;
      case "configure":
      case "creating":
        return 1;
      case "webhook":
        return 2;
      case "complete":
        return 3;
      default:
        return 0;
    }
  };

  const renderContent = () => {
    switch (step) {
      case "checking":
        return (
          <Stack align="center" py="xl">
            <Loader size="lg" />
            <Text c="dimmed">Checking for existing Fireflies integration...</Text>
          </Stack>
        );

      case "existing":
        return (
          <Stack gap="lg">
            <Alert
              icon={<IconCircleCheck size={20} />}
              title="Fireflies Already Connected"
              color="green"
            >
              You already have a Fireflies integration configured:
              <Text fw={500} mt="xs">
                {existingIntegration?.name}
              </Text>
              {existingIntegration?.createdAt && (
                <Text size="sm" c="dimmed">
                  Connected on{" "}
                  {new Date(existingIntegration.createdAt).toLocaleDateString()}
                </Text>
              )}
            </Alert>
            <Text size="sm" c="dimmed">
              Would you like to reconfigure your Fireflies connection with a new
              API key?
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Keep Current
              </Button>
              <Button onClick={handleReconfigure}>Reconfigure</Button>
            </Group>
          </Stack>
        );

      case "api-key":
      case "testing":
        return (
          <Stack gap="lg">
            <Text>
              To connect Fireflies, you&apos;ll need your API key from the Fireflies
              dashboard.
            </Text>

            <Paper p="md" withBorder>
              <Group gap="xs" mb="sm">
                <ThemeIcon size="sm" variant="light" color="blue">
                  <IconKey size={14} />
                </ThemeIcon>
                <Text size="sm" fw={500}>
                  Where to find your API key
                </Text>
              </Group>
              <List size="sm" spacing="xs">
                <List.Item>
                  Open{" "}
                  <Anchor
                    href="https://app.fireflies.ai/settings"
                    target="_blank"
                    inline
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Fireflies Settings <IconExternalLink size={12} style={{ verticalAlign: "middle" }} />
                  </Anchor>
                </List.Item>
                <List.Item>Scroll down to <strong>Developer Settings</strong></List.Item>
                <List.Item>Copy your <strong>API Key</strong></List.Item>
              </List>
            </Paper>

            <TextInput
              label="Fireflies API Key"
              placeholder="Paste your API key here"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={step === "testing"}
              error={error}
              onKeyDown={(e) => {
                if (e.key === "Enter" && step !== "testing") {
                  handleTestApiKey();
                }
              }}
            />

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red">
                {error}
              </Alert>
            )}

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleTestApiKey}
                loading={step === "testing"}
                disabled={!apiKey.trim()}
              >
                {step === "testing" ? "Verifying..." : "Continue"}
              </Button>
            </Group>
          </Stack>
        );

      case "configure":
      case "creating":
        return (
          <Stack gap="lg">
            <Alert icon={<IconCheck size={16} />} color="green">
              API key verified successfully!
            </Alert>

            <TextInput
              label="Integration Name"
              description="A friendly name to identify this integration"
              placeholder="e.g., Work Meetings, Team Calls"
              value={integrationName}
              onChange={(e) => setIntegrationName(e.target.value)}
              disabled={step === "creating"}
            />

            <Box>
              <Text size="sm" fw={500} mb="xs">
                Integration Scope
              </Text>
              <SegmentedControl
                fullWidth
                value={scope}
                onChange={(value) => setScope(value as "personal" | "team")}
                disabled={step === "creating"}
                data={[
                  {
                    label: "Personal",
                    value: "personal",
                  },
                  {
                    label: "Team/Workspace",
                    value: "team",
                  },
                ]}
              />
              <Text size="xs" c="dimmed" mt="xs">
                {scope === "personal"
                  ? "Only you will have access to this integration"
                  : "All team members will be able to use this integration"}
              </Text>
            </Box>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red">
                {error}
              </Alert>
            )}

            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => setStep("api-key")}
                disabled={step === "creating"}
              >
                Back
              </Button>
              <Button
                onClick={handleCreateIntegration}
                loading={step === "creating"}
                disabled={!integrationName.trim()}
              >
                {step === "creating" ? "Creating..." : "Create Integration"}
              </Button>
            </Group>
          </Stack>
        );

      case "webhook":
        return (
          <Stack gap="lg">
            <Alert icon={<IconCheck size={16} />} color="green">
              Integration created successfully!
            </Alert>

            <Text>
              Now let&apos;s configure the webhook. This allows Fireflies to notify
              Exponential when a meeting has been transcribed, so we can automatically
              fetch the details and bring them to your account.
            </Text>

            <Paper p="md" withBorder>
              <Group gap="xs" mb="md">
                <ThemeIcon size="sm" variant="light" color="orange">
                  <IconSettings size={14} />
                </ThemeIcon>
                <Text size="sm" fw={500}>
                  Configure in Fireflies
                </Text>
              </Group>

              <List type="ordered" size="sm" spacing="xs">
                <List.Item>
                  Open{" "}
                  <Anchor
                    href="https://app.fireflies.ai/settings"
                    target="_blank"
                    inline
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Fireflies Settings <IconExternalLink size={12} style={{ verticalAlign: "middle" }} />
                  </Anchor>
                </List.Item>
                <List.Item>
                  Scroll to <strong>Developer Settings</strong> and find the Webhooks section
                </List.Item>
                <List.Item>Click <strong>Add Webhook</strong></List.Item>
                <List.Item>
                  Paste the <strong>Webhook URL</strong> from below
                </List.Item>
                <List.Item>
                  For authentication, select <strong>Signature</strong> and paste the <strong>Webhook Secret</strong>
                </List.Item>
                <List.Item>
                  Choose <strong>Transcription completed</strong> as the trigger event
                </List.Item>
                <List.Item>Save your webhook</List.Item>
              </List>
            </Paper>

            <Paper p="md" withBorder>
              <Group gap="xs" mb="md">
                <ThemeIcon size="sm" variant="light" color="blue">
                  <IconWebhook size={14} />
                </ThemeIcon>
                <Text size="sm" fw={500}>
                  Your Webhook Details
                </Text>
              </Group>

              <Stack gap="md">
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>
                    Webhook URL
                  </Text>
                  <Group gap="xs">
                    <TextInput
                      value={webhookUrl ?? ""}
                      readOnly
                      style={{ flex: 1 }}
                      styles={{
                        input: {
                          fontFamily: "monospace",
                          fontSize: "12px",
                        },
                      }}
                    />
                    <CopyButton value={webhookUrl ?? ""}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? "Copied!" : "Copy"}>
                          <ActionIcon
                            color={copied ? "green" : "gray"}
                            onClick={copy}
                            variant="subtle"
                          >
                            {copied ? (
                              <IconCheck size={16} />
                            ) : (
                              <IconCopy size={16} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Group>
                </Box>

                <Box>
                  <Text size="xs" c="dimmed" mb={4}>
                    Webhook Secret (for signature verification)
                  </Text>
                  <Group gap="xs">
                    <TextInput
                      value={webhookToken ?? ""}
                      readOnly
                      type="password"
                      style={{ flex: 1 }}
                      styles={{
                        input: {
                          fontFamily: "monospace",
                          fontSize: "12px",
                        },
                      }}
                    />
                    <CopyButton value={webhookToken ?? ""}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? "Copied!" : "Copy"}>
                          <ActionIcon
                            color={copied ? "green" : "gray"}
                            onClick={copy}
                            variant="subtle"
                          >
                            {copied ? (
                              <IconCheck size={16} />
                            ) : (
                              <IconCopy size={16} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Group>
                </Box>
              </Stack>
            </Paper>

            <Group justify="flex-end">
              <Button onClick={() => setStep("complete")}>
                I&apos;ve configured the webhook
              </Button>
            </Group>
          </Stack>
        );

      case "complete":
        return (
          <Stack gap="lg" align="center" py="xl">
            <ThemeIcon size={60} radius="xl" color="green">
              <IconCircleCheck size={36} />
            </ThemeIcon>

            <Text size="lg" fw={500} ta="center">
              Fireflies is now connected!
            </Text>

            <Text c="dimmed" ta="center">
              New meeting transcriptions will automatically appear in the app.
              You can ask the AI assistant about your meetings, search
              transcriptions, and extract insights.
            </Text>

            <Button onClick={onClose} mt="md">
              Done
            </Button>
          </Stack>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Connect Fireflies"
      size="lg"
      closeOnClickOutside={step === "complete"}
    >
      {step !== "checking" &&
        step !== "existing" &&
        step !== "complete" && (
          <Stepper
            active={getActiveStep()}
            mb="xl"
            size="sm"
            allowNextStepsSelect={false}
          >
            <Stepper.Step label="API Key" icon={<IconKey size={16} />} />
            <Stepper.Step label="Configure" icon={<IconSettings size={16} />} />
            <Stepper.Step label="Webhook" icon={<IconWebhook size={16} />} />
            <Stepper.Step label="Done" icon={<IconCheck size={16} />} />
          </Stepper>
        )}

      {renderContent()}
    </Modal>
  );
}
