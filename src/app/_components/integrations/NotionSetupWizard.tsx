"use client";

import { useState, useMemo } from "react";
import {
  Modal,
  Stepper,
  Button,
  Text,
  Group,
  Stack,
  Alert,
  Loader,
  Paper,
  Select,
  Avatar,
  ThemeIcon,
  Badge,
} from "@mantine/core";
import {
  IconCheck,
  IconAlertCircle,
  IconBrandNotion,
  IconDatabase,
  IconSettings,
  IconCircleCheck,
  IconPlus,
  IconExternalLink,
  IconArrowDown,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import type { ConfigSource } from "~/server/services/notion-config-resolver";

interface NotionSetupWizardProps {
  opened: boolean;
  onClose: () => void;
  project: {
    id: string;
    name: string;
    taskManagementTool?: string | null;
    taskManagementConfig?: Record<string, unknown> | null;
    notionProjectId?: string | null;
  };
  /** If true, opens in edit mode with existing config pre-selected */
  editMode?: boolean;
}

const SOURCE_LABELS: Record<ConfigSource, string> = {
  project: "Project override",
  workspace: "Workspace default",
  app: "App default",
};

const SOURCE_COLORS: Record<ConfigSource, string> = {
  project: "blue",
  workspace: "violet",
  app: "gray",
};

function SourceBadge({ source }: { source: ConfigSource }) {
  return (
    <Badge
      size="xs"
      variant="light"
      color={SOURCE_COLORS[source]}
      leftSection={source === "workspace" ? <IconArrowDown size={10} /> : undefined}
    >
      {SOURCE_LABELS[source]}
    </Badge>
  );
}

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties?: Record<string, { id: string; name: string; type: string }>;
}

export function NotionSetupWizard({
  opened,
  onClose,
  project,
  editMode = false,
}: NotionSetupWizardProps) {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();

  // Wizard state
  const [activeStep, setActiveStep] = useState(editMode ? 1 : 0);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<
    string | null
  >(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
    null,
  );
  const [syncDirection, setSyncDirection] = useState<
    "pull" | "push" | "bidirectional"
  >("pull");
  const [syncFrequency, setSyncFrequency] = useState<
    "manual" | "hourly" | "daily"
  >("manual");

  // Queries
  const {
    data: notionConnections = [],
    isLoading: isLoadingConnections,
  } = api.integration.listNotionConnections.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: opened },
  );

  const {
    data: databases = [],
    isLoading: isLoadingDatabases,
  } = api.integration.getNotionDatabases.useQuery(
    { integrationId: selectedIntegrationId ?? "" },
    { enabled: !!selectedIntegrationId },
  );

  // Resolved config with inheritance info
  const { data: resolvedConfig } = api.project.getResolvedNotionConfig.useQuery(
    { projectId: project.id },
    { enabled: opened && editMode },
  );

  // Mutations
  const createFromWizard = api.workflow.createFromWizard.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Notion Configured",
        message: `Notion sync has been configured for ${project.name}.`,
        color: "green",
      });
      void utils.project.getById.invalidate({ id: project.id });
      void utils.workflow.list.invalidate();
      handleClose();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to configure Notion integration",
        color: "red",
      });
    },
  });

  // Selected connection metadata for display
  const selectedConnection = useMemo(
    () => notionConnections.find((c) => c.id === selectedIntegrationId),
    [notionConnections, selectedIntegrationId],
  );

  // Selected database for display
  const selectedDatabase = useMemo(
    () => databases.find((d: NotionDatabase) => d.id === selectedDatabaseId),
    [databases, selectedDatabaseId],
  );

  const handleClose = () => {
    setActiveStep(0);
    setSelectedIntegrationId(null);
    setSelectedDatabaseId(null);
    setSyncDirection("pull");
    setSyncFrequency("manual");
    onClose();
  };

  const handleConnectNewAccount = () => {
    // Build OAuth URL with workspace context and return URL
    const params = new URLSearchParams();
    if (workspaceId) params.set("workspaceId", workspaceId);
    params.set("redirectUrl", window.location.href);
    window.location.href = `/api/auth/notion/authorize?${params.toString()}`;
  };

  const handleSave = () => {
    if (!selectedIntegrationId || !selectedDatabaseId) return;

    createFromWizard.mutate({
      projectId: project.id,
      integrationId: selectedIntegrationId,
      databaseId: selectedDatabaseId,
      syncDirection,
      syncFrequency,
    });
  };

  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case 0:
        return !!selectedIntegrationId;
      case 1:
        return !!selectedDatabaseId;
      case 2:
        return true;
      default:
        return false;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <ThemeIcon size="md" variant="light" color="violet">
            <IconBrandNotion size={18} />
          </ThemeIcon>
          <Text fw={600}>
            {editMode ? "Configure Notion Sync" : "Set Up Notion Sync"}
          </Text>
        </Group>
      }
      size="lg"
    >
      <Stepper
        active={activeStep}
        onStepClick={(step) => {
          // Only allow clicking completed steps or current step
          if (step <= activeStep) setActiveStep(step);
        }}
        size="sm"
      >
        {/* Step 1: Select Notion Account */}
        <Stepper.Step
          label="Account"
          description="Select Notion workspace"
          icon={<IconBrandNotion size={18} />}
        >
          <Stack gap="md" mt="md">
            <Text size="sm" c="dimmed">
              Choose which Notion workspace to sync with this project.
            </Text>

            {isLoadingConnections ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Loading connected accounts...
                </Text>
              </Group>
            ) : notionConnections.length > 0 ? (
              <Stack gap="xs">
                {notionConnections.map((connection) => (
                  <Paper
                    key={connection.id}
                    p="sm"
                    radius="md"
                    withBorder
                    className={`cursor-pointer transition-colors ${
                      selectedIntegrationId === connection.id
                        ? "border-brand-primary bg-surface-hover"
                        : "hover:bg-surface-hover"
                    }`}
                    onClick={() => {
                      setSelectedIntegrationId(connection.id);
                      setSelectedDatabaseId(null); // Reset database when switching account
                    }}
                  >
                    <Group justify="space-between">
                      <Group gap="sm">
                        {connection.notionWorkspaceIcon ? (
                          <Avatar
                            src={connection.notionWorkspaceIcon}
                            size="sm"
                            radius="sm"
                          />
                        ) : (
                          <ThemeIcon
                            size="sm"
                            variant="light"
                            color="violet"
                          >
                            <IconBrandNotion size={14} />
                          </ThemeIcon>
                        )}
                        <div>
                          <Text size="sm" fw={500}>
                            {connection.notionWorkspaceName ??
                              connection.name}
                          </Text>
                          {connection.notionWorkspaceId && (
                            <Text size="xs" c="dimmed">
                              {connection.notionWorkspaceId}
                            </Text>
                          )}
                        </div>
                      </Group>
                      <Group gap="xs">
                        <Badge
                          size="xs"
                          color={
                            connection.status === "ACTIVE" ? "green" : "gray"
                          }
                          variant="light"
                        >
                          {connection.status}
                        </Badge>
                        {selectedIntegrationId === connection.id && (
                          <ThemeIcon
                            size="sm"
                            variant="filled"
                            color="green"
                            radius="xl"
                          >
                            <IconCheck size={12} />
                          </ThemeIcon>
                        )}
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="No Notion Accounts Connected"
                color="blue"
                variant="light"
              >
                Connect your Notion workspace to get started.
              </Alert>
            )}

            <Button
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={handleConnectNewAccount}
              fullWidth
            >
              Connect New Notion Workspace
            </Button>
          </Stack>
        </Stepper.Step>

        {/* Step 2: Select Database */}
        <Stepper.Step
          label="Database"
          description="Choose Notion database"
          icon={<IconDatabase size={18} />}
        >
          <Stack gap="md" mt="md">
            {selectedConnection && (
              <Paper p="xs" radius="sm" className="bg-surface-secondary">
                <Group gap="xs">
                  <IconBrandNotion size={14} />
                  <Text size="xs" c="dimmed">
                    Connected to:{" "}
                    <Text span fw={500}>
                      {selectedConnection.notionWorkspaceName}
                    </Text>
                  </Text>
                </Group>
              </Paper>
            )}

            <Text size="sm" c="dimmed">
              Select the Notion database to sync tasks with this project.
            </Text>

            {isLoadingDatabases ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Loading databases...
                </Text>
              </Group>
            ) : databases.length > 0 ? (
              <Select
                label="Notion Database"
                placeholder="Select a database"
                data={databases.map((db: NotionDatabase) => ({
                  value: db.id,
                  label: db.title,
                }))}
                value={selectedDatabaseId}
                onChange={setSelectedDatabaseId}
                searchable
              />
            ) : (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="No Databases Found"
                color="orange"
                variant="light"
              >
                No databases were found in this Notion workspace. Make sure the
                integration has access to your databases.
              </Alert>
            )}

            {selectedDatabase && (
              <Paper p="sm" radius="sm" withBorder>
                <Group gap="xs">
                  <IconDatabase size={14} />
                  <Text size="sm" fw={500}>
                    {selectedDatabase.title}
                  </Text>
                </Group>
                {selectedDatabase.properties && (
                  <Text size="xs" c="dimmed" mt="xs">
                    {Object.keys(selectedDatabase.properties).length} properties
                    available for mapping
                  </Text>
                )}
                {selectedDatabase.url && (
                  <Button
                    component="a"
                    href={selectedDatabase.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="subtle"
                    size="xs"
                    mt="xs"
                    leftSection={<IconExternalLink size={12} />}
                  >
                    Open in Notion
                  </Button>
                )}
              </Paper>
            )}
          </Stack>
        </Stepper.Step>

        {/* Step 3: Configure Sync */}
        <Stepper.Step
          label="Sync"
          description="Configure sync settings"
          icon={<IconSettings size={18} />}
        >
          <Stack gap="md" mt="md">
            <Text size="sm" c="dimmed">
              Configure how tasks should be synced between Exponential and
              Notion.
            </Text>

            <Stack gap={4}>
              <Group gap="xs">
                <Text size="sm" fw={500}>Sync Direction</Text>
                {resolvedConfig && (
                  <SourceBadge source={resolvedConfig.syncDirection.source} />
                )}
              </Group>
              <Select
                description="Which direction should tasks flow?"
                data={[
                  {
                    value: "pull",
                    label: "Pull from Notion (Notion is source of truth)",
                  },
                  {
                    value: "push",
                    label: "Push to Notion (Exponential is source of truth)",
                  },
                  {
                    value: "bidirectional",
                    label: "Bidirectional (sync both ways)",
                  },
                ]}
                value={syncDirection}
                onChange={(v) =>
                  setSyncDirection(
                    (v as "pull" | "push" | "bidirectional") ?? "pull",
                  )
                }
                placeholder={
                  resolvedConfig
                    ? `Using ${SOURCE_LABELS[resolvedConfig.syncDirection.source].toLowerCase()}: ${resolvedConfig.syncDirection.value}`
                    : undefined
                }
              />
            </Stack>

            <Stack gap={4}>
              <Group gap="xs">
                <Text size="sm" fw={500}>Sync Frequency</Text>
                {resolvedConfig && (
                  <SourceBadge source={resolvedConfig.syncFrequency.source} />
                )}
              </Group>
              <Select
                description="How often should sync run?"
                data={[
                  { value: "manual", label: "Manual (sync on demand)" },
                  { value: "hourly", label: "Hourly" },
                  { value: "daily", label: "Daily" },
                ]}
                value={syncFrequency}
                onChange={(v) =>
                  setSyncFrequency(
                    (v as "manual" | "hourly" | "daily") ?? "manual",
                  )
                }
                placeholder={
                  resolvedConfig
                    ? `Using ${SOURCE_LABELS[resolvedConfig.syncFrequency.source].toLowerCase()}: ${resolvedConfig.syncFrequency.value}`
                    : undefined
                }
              />
            </Stack>

            {syncDirection === "bidirectional" && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="orange"
                variant="light"
              >
                Bidirectional sync is experimental. If conflicts occur, the most
                recently modified version will be kept.
              </Alert>
            )}
          </Stack>
        </Stepper.Step>

        {/* Step 4: Confirm */}
        <Stepper.Completed>
          <Stack gap="md" mt="md">
            <Alert
              icon={<IconCircleCheck size={16} />}
              title="Ready to Configure"
              color="green"
              variant="light"
            >
              Review your configuration below and click Save to activate the
              Notion sync.
            </Alert>

            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Project
                  </Text>
                  <Text size="sm" fw={500}>
                    {project.name}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Notion Workspace
                  </Text>
                  <Text size="sm" fw={500}>
                    {selectedConnection?.notionWorkspaceName ?? "—"}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Database
                  </Text>
                  <Text size="sm" fw={500}>
                    {selectedDatabase?.title ?? "—"}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Sync Direction
                  </Text>
                  <Group gap="xs">
                    <Badge variant="light" color="blue">
                      {syncDirection}
                    </Badge>
                    {resolvedConfig && (
                      <SourceBadge source={resolvedConfig.syncDirection.source} />
                    )}
                  </Group>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Sync Frequency
                  </Text>
                  <Group gap="xs">
                    <Badge variant="light" color="gray">
                      {syncFrequency}
                    </Badge>
                    {resolvedConfig && (
                      <SourceBadge source={resolvedConfig.syncFrequency.source} />
                    )}
                  </Group>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </Stepper.Completed>
      </Stepper>

      {/* Navigation buttons */}
      <Group justify="space-between" mt="xl">
        <Button
          variant="light"
          onClick={() => {
            if (activeStep === 0) {
              handleClose();
            } else {
              setActiveStep((s) => s - 1);
            }
          }}
        >
          {activeStep === 0 ? "Cancel" : "Back"}
        </Button>

        {activeStep < 3 ? (
          <Button
            onClick={() => setActiveStep((s) => s + 1)}
            disabled={!canProceedFromStep(activeStep)}
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            loading={createFromWizard.isPending}
            leftSection={<IconCheck size={16} />}
            color="green"
          >
            Save Configuration
          </Button>
        )}
      </Group>
    </Modal>
  );
}
