"use client";

import { useState, useEffect } from "react";
import {
  SimpleGrid,
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  Modal,
  Title,
  Avatar,
  TextInput,
  Select,
  MultiSelect,
  Switch,
  NumberInput,
  Textarea,
  Loader,
  Alert,
  Divider,
  ActionIcon,
  Radio,
} from "@mantine/core";
import {
  IconGitBranch,
  IconBrandSlack,
  IconBrandNotion,
  IconMicrophone,
  IconBrandGithub,
  IconMail,
  IconBrandWhatsapp,
  IconCalendarTime,
  IconTarget,
  IconAlertCircle,
  IconCheck,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface ConfigurationField {
  type:
    | "text"
    | "select"
    | "multi-select"
    | "boolean"
    | "number"
    | "multi-number"
    | "time"
    | "multi-text";
  label?: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

interface ProjectWorkflowsTabProps {
  projectId: string;
}

export function ProjectWorkflowsTab({ projectId }: ProjectWorkflowsTabProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [configModalOpened, setConfigModalOpened] = useState(false);
  const [detailsModalOpened, setDetailsModalOpened] = useState(false);
  const [githubRepoModalOpened, setGithubRepoModalOpened] = useState(false);
  const [configuration, setConfiguration] = useState<Record<string, any>>({});
  const [workflowName, setWorkflowName] = useState("");
  const [githubAuthData, setGithubAuthData] = useState<any>(null);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<
    number | null
  >(null);
  const [isCreatingIntegration, setIsCreatingIntegration] = useState(false);

  // Fetch workflow templates from API
  const { data: templates, isLoading: templatesLoading } =
    api.projectWorkflow.getTemplates.useQuery();

  // Fetch existing project workflows
  const {
    data: projectWorkflows,
    isLoading: workflowsLoading,
    refetch: refetchWorkflows,
  } = api.projectWorkflow.getProjectWorkflows.useQuery({ projectId });

  // Fetch user integrations to check for existing GitHub integration
  const { data: userIntegrations } =
    api.integration.listIntegrations.useQuery();

  const { data: repositories } =
    api.integration.listGithubRepositories.useQuery({
      integrationIds: userIntegrations ? userIntegrations.map((i) => i.id) : [],
    });

  // Handle GitHub authentication result from URL parameters
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const githubAuth = urlParams.get("github_auth");

      if (githubAuth) {
        try {
          const authData = JSON.parse(atob(githubAuth));
          setGithubAuthData(authData);
          setGithubRepoModalOpened(true);

          // Clean URL
          const url = new URL(window.location.href);
          url.searchParams.delete("github_auth");
          window.history.replaceState({}, "", url.toString());
        } catch (error) {
          console.error("Failed to parse GitHub auth data:", error);
        }
      }
    }
  }, []);

  // Mutation to create workflow from template
  const createWorkflowMutation =
    api.projectWorkflow.createFromTemplate.useMutation({
      onSuccess: () => {
        notifications.show({
          title: "Workflow Created",
          message:
            "Your workflow has been successfully configured and is now active.",
          color: "green",
          icon: <IconCheck size={16} />,
        });
        setConfigModalOpened(false);
        setConfiguration({});
        setWorkflowName("");
        refetchWorkflows()
          .then((r) => {
            return r;
          })
          .catch((error) => console.error(error));
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message:
            error.message || "Failed to create workflow. Please try again.",
          color: "red",
          icon: <IconAlertCircle size={16} />,
        });
      },
    });

  // Mutation to delete workflow
  const deleteWorkflowMutation = api.projectWorkflow.delete.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Workflow Deleted",
        message: "The workflow has been successfully removed.",
        color: "orange",
      });
      refetchWorkflows()
        .then((r) => {
          return r;
        })
        .catch((error) => console.error(error));
    },
  });

  const handleConfigureWorkflow = (template: any) => {
    setSelectedTemplate(template);
    setWorkflowName(template.name);

    // Set up base configuration
    const baseConfig = template.defaultConfiguration || {};

    if (template.id === "github-pipeline") {
      // For GitHub pipeline, modify the configurationSchema to include repository options
      const updatedTemplate = {
        ...template,
        configurationSchema: {
          ...template.configurationSchema,
          repositoryFilter: {
            ...template.configurationSchema?.repositoryFilter,
            type: "multi-select",
            options: repositories?.repositories
              ? [...repositories.repositories, "Add New"]
              : ["Add New"],
          },
        },
      };
      setSelectedTemplate(updatedTemplate);

      // Initialize configuration with empty array for multi-select fields
      setConfiguration({
        ...baseConfig,
        repositoryFilter: [], // Initialize as empty array for MultiSelect
      });
    } else {
      setConfiguration(baseConfig);
    }

    setConfigModalOpened(true);
  };

  const handleGitHubAuth = (template: any) => {
    // Redirect to GitHub OAuth with project context
    const authUrl = `/api/auth/github/authorize?projectId=${projectId}`;
    window.location.href = authUrl;
  };

  const handleGitHubRepositorySelected = async () => {
    if (!selectedRepositoryId || !githubAuthData) return;

    setIsCreatingIntegration(true);

    try {
      const response = await fetch("/api/auth/github/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authToken: btoa(JSON.stringify(githubAuthData)),
          repositoryId: selectedRepositoryId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        notifications.show({
          title: "GitHub Connected",
          message:
            "Repository connected successfully! You can now create workflows.",
          color: "green",
          icon: <IconCheck size={16} />,
        });

        setGithubRepoModalOpened(false);
        setGithubAuthData(null);
        setSelectedRepositoryId(null);

        // Refresh integrations
        // TODO: Refresh integrations query if you have one

        // If we have a template selected, proceed with workflow creation
        if (selectedTemplate) {
          createWorkflowMutation.mutate({
            projectId,
            templateId: selectedTemplate.id,
            name: workflowName,
            configuration,
          });
        }
      } else {
        throw new Error(result.error || "Failed to connect repository");
      }
    } catch (error) {
      notifications.show({
        title: "Connection Failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to connect GitHub repository",
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setIsCreatingIntegration(false);
    }
  };

  const handleCreateWorkflow = () => {
    if (!selectedTemplate) return;

    // For GitHub pipeline, check if OAuth is needed
    if (selectedTemplate.id === "github-pipeline") {
      // Check if user has selected repositories or needs to add new ones
      const selectedRepos = configuration.repositoryFilter as string[];
      const needsNewAuth =
        selectedRepos?.includes("Add New") || !selectedRepos?.length;

      if (needsNewAuth) {
        // Need to authenticate with GitHub to get more repositories
        handleGitHubAuth(selectedTemplate);
        return;
      }
      // User has selected repositories, proceed with workflow creation
    }

    createWorkflowMutation.mutate({
      projectId,
      templateId: selectedTemplate.id,
      name: workflowName,
      configuration,
    });
  };

  const getIntegrationIcon = (integration: string) => {
    switch (integration.toLowerCase()) {
      case "slack":
        return <IconBrandSlack size={16} />;
      case "notion":
        return <IconBrandNotion size={16} />;
      case "github":
        return <IconBrandGithub size={16} />;
      case "fireflies":
        return <IconMicrophone size={16} />;
      case "whatsapp":
        return <IconBrandWhatsapp size={16} />;
      case "email":
        return <IconMail size={16} />;
      case "monday":
        return <IconCalendarTime size={16} />;
      default:
        return <IconTarget size={16} />;
    }
  };

  const getIntegrationColor = (integration: string) => {
    switch (integration.toLowerCase()) {
      case "slack":
        return "violet";
      case "notion":
        return "gray";
      case "github":
        return "dark";
      case "fireflies":
        return "blue";
      case "whatsapp":
        return "green";
      case "email":
        return "blue";
      case "monday":
        return "orange";
      default:
        return "gray";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Automation":
        return "blue";
      case "Integration":
        return "green";
      case "Communication":
        return "orange";
      case "Monitoring":
        return "red";
      case "Development":
        return "purple";
      default:
        return "gray";
    }
  };

  const renderConfigField = (
    fieldKey: string,
    field: ConfigurationField,
    value: any,
    onChange: (val: any) => void,
  ) => {
    const commonProps = {
      label: field.label || fieldKey,
      required: field.required,
      value: field.type === "multi-select" ? (Array.isArray(value) ? value : []) : (value || ""),
    };

    switch (field.type) {
      case "text":
        return (
          <TextInput
            {...commonProps}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "select":
        return (
          <Select
            {...commonProps}
            placeholder={field.placeholder}
            data={field.options || []}
            onChange={onChange}
          />
        );
      case "multi-select":
        return (
          <MultiSelect
            {...commonProps}
            placeholder={field.placeholder}
            data={field.options || []}
            onChange={onChange}
          />
        );
      case "boolean":
        return (
          <Switch
            label={field.label || fieldKey}
            checked={!!value}
            onChange={(e) => onChange(e.currentTarget.checked)}
          />
        );
      case "number":
        return (
          <NumberInput
            {...commonProps}
            placeholder={field.placeholder}
            onChange={onChange}
          />
        );
      case "multi-number":
        return (
          <TextInput
            {...commonProps}
            placeholder="Enter comma-separated numbers (e.g., 24,48,168)"
            onChange={(e) => {
              const numbers = e.target.value
                .split(",")
                .map((n) => parseInt(n.trim()))
                .filter((n) => !isNaN(n));
              onChange(numbers);
            }}
            value={Array.isArray(value) ? value.join(", ") : ""}
          />
        );
      case "time":
        return (
          <TextInput
            {...commonProps}
            placeholder="HH:MM (e.g., 09:00)"
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "multi-text":
        return (
          <Textarea
            {...commonProps}
            placeholder="Enter one item per line"
            onChange={(e) => {
              const items = e.target.value
                .split("\n")
                .filter((item) => item.trim());
              onChange(items);
            }}
            value={Array.isArray(value) ? value.join("\n") : ""}
          />
        );
      default:
        return (
          <TextInput
            {...commonProps}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  if (templatesLoading || workflowsLoading) {
    return (
      <Stack align="center" justify="center" h={300}>
        <Loader size="lg" />
        <Text size="sm" c="dimmed">
          Loading workflows...
        </Text>
      </Stack>
    );
  }

  return (
    <>
      <Stack gap="xl">
        {/* Existing Project Workflows */}
        {projectWorkflows && projectWorkflows.length > 0 && (
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Title order={4}>Active Workflows</Title>
                <Text size="sm" c="dimmed">
                  Workflows currently configured for this project
                </Text>
              </div>
              <Badge variant="light" color="green">
                {projectWorkflows.length} active
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {projectWorkflows.map((workflow: any) => (
                <Card
                  key={workflow.id}
                  withBorder
                  shadow="sm"
                  radius="md"
                  className="h-full transition-shadow hover:shadow-md"
                >
                  <Stack justify="space-between" h="100%">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <IconGitBranch size={24} className="text-green-500" />
                        <Group gap="xs">
                          <Badge
                            size="xs"
                            variant="light"
                            color={getCategoryColor(
                              workflow.template?.category || "Integration",
                            )}
                          >
                            {workflow.template?.category || "Integration"}
                          </Badge>
                          {workflow.isActive && (
                            <Badge size="xs" color="green">
                              Active
                            </Badge>
                          )}
                        </Group>
                      </Group>

                      <div>
                        <Text fw={600} size="sm" mb={4}>
                          {workflow.name}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {workflow.description}
                        </Text>
                      </div>

                      {workflow.runs && workflow.runs.length > 0 && (
                        <Text size="xs" c="dimmed">
                          Last run:{" "}
                          {new Date(
                            workflow.runs[0]?.startedAt || "",
                          ).toLocaleDateString()}
                          {workflow.runs[0]?.status && (
                            <Badge
                              size="xs"
                              ml="xs"
                              color={
                                workflow.runs[0].status === "completed"
                                  ? "green"
                                  : workflow.runs[0].status === "failed"
                                    ? "red"
                                    : "blue"
                              }
                            >
                              {workflow.runs[0].status}
                            </Badge>
                          )}
                        </Text>
                      )}
                    </Stack>

                    <Group justify="space-between" align="center">
                      <Avatar.Group spacing="xs">
                        {workflow.template?.integrations
                          ?.slice(0, 3)
                          .map((integration: string, index: number) => (
                            <Avatar
                              key={index}
                              size="sm"
                              radius="sm"
                              color={getIntegrationColor(integration)}
                            >
                              {getIntegrationIcon(integration)}
                            </Avatar>
                          ))}
                      </Avatar.Group>

                      <Group gap="xs">
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color="blue"
                          onClick={() => {
                            setSelectedTemplate(workflow);
                            setDetailsModalOpened(true);
                          }}
                        >
                          <IconSettings size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color="red"
                          onClick={() =>
                            deleteWorkflowMutation.mutate({ id: workflow.id })
                          }
                          loading={deleteWorkflowMutation.isPending}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>

            <Divider my="xl" />
          </Stack>
        )}

        {/* Available Workflow Templates */}
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4}>Available Workflow Templates</Title>
              <Text size="sm" c="dimmed">
                Choose from pre-built workflows to automate your project tasks
              </Text>
            </div>
            <Badge variant="light" color="blue">
              {templates?.length || 0} templates
            </Badge>
          </Group>

          {templates && templates.length > 0 ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  withBorder
                  shadow="sm"
                  radius="md"
                  className="h-full cursor-pointer transition-shadow hover:shadow-md"
                >
                  <Stack justify="space-between" h="100%">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <IconGitBranch
                          size={24}
                          className="text-brand-primary"
                        />
                        <Badge
                          size="xs"
                          variant="light"
                          color={getCategoryColor(template.category)}
                        >
                          {template.category}
                        </Badge>
                      </Group>

                      <div>
                        <Text fw={600} size="sm" mb={4}>
                          {template.name}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={3}>
                          {template.description}
                        </Text>
                      </div>
                    </Stack>

                    <Stack gap="sm">
                      <Group justify="space-between" align="center">
                        <Avatar.Group spacing="xs">
                          {template.integrations
                            ?.slice(0, 3)
                            .map((integration: string, index: number) => (
                              <Avatar
                                key={index}
                                size="sm"
                                radius="sm"
                                color={getIntegrationColor(integration)}
                              >
                                {getIntegrationIcon(integration)}
                              </Avatar>
                            ))}
                          {template.integrations &&
                            template.integrations.length > 3 && (
                              <Avatar size="sm" radius="sm" color="gray">
                                <Text size="xs">
                                  +{template.integrations.length - 3}
                                </Text>
                              </Avatar>
                            )}
                        </Avatar.Group>

                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => handleConfigureWorkflow(template)}
                        >
                          Use
                        </Button>
                      </Group>
                    </Stack>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          ) : (
            <Alert icon={<IconAlertCircle size={16} />} color="blue">
              No workflow templates are currently available.
            </Alert>
          )}
        </Stack>
      </Stack>

      {/* Workflow Configuration Modal */}
      <Modal
        opened={configModalOpened}
        onClose={() => setConfigModalOpened(false)}
        title={`Configure ${selectedTemplate?.name}`}
        size="lg"
      >
        {selectedTemplate && (
          <Stack gap="lg">
            <div>
              <Text size="sm" c="dimmed" mb="md">
                {selectedTemplate.description}
              </Text>

              <Group gap="xs" mb="md">
                <Badge
                  variant="light"
                  color={getCategoryColor(selectedTemplate.category)}
                >
                  {selectedTemplate.category}
                </Badge>
              </Group>
            </div>

            <TextInput
              label="Workflow Name"
              placeholder="Enter a name for this workflow"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              required
            />

            <div>
              <Text fw={600} size="sm" mb="xs">
                Required Integrations
              </Text>
              <Group gap="xs" mb="md">
                {selectedTemplate.integrations?.map(
                  (integration: string, index: number) => (
                    <Badge
                      key={index}
                      variant="outline"
                      leftSection={getIntegrationIcon(integration)}
                      color={getIntegrationColor(integration)}
                    >
                      {integration}
                    </Badge>
                  ),
                )}
              </Group>
            </div>

            {selectedTemplate.configurationSchema && (
              <div>
                <Text fw={600} size="sm" mb="md">
                  Configuration
                </Text>
                <Stack gap="md">
                  {Object.entries(selectedTemplate.configurationSchema).map(
                    ([fieldKey, field]) => (
                      <div key={fieldKey}>
                        {renderConfigField(
                          fieldKey,
                          field as ConfigurationField,
                          configuration[fieldKey],
                          (value) =>
                            setConfiguration((prev) => ({
                              ...prev,
                              [fieldKey]: value,
                            })),
                        )}
                      </div>
                    ),
                  )}
                </Stack>
              </div>
            )}

            <Group justify="flex-end" mt="lg">
              <Button
                variant="outline"
                onClick={() => setConfigModalOpened(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateWorkflow}
                loading={createWorkflowMutation.isPending}
                disabled={!workflowName.trim()}
              >
                Create Workflow
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* GitHub Repository Selection Modal */}
      <Modal
        opened={githubRepoModalOpened}
        onClose={() => setGithubRepoModalOpened(false)}
        title="Select GitHub Repository"
        size="md"
        closeOnClickOutside={false}
      >
        {githubAuthData && (
          <Stack gap="lg">
            <Alert icon={<IconBrandGithub size={16} />} color="blue">
              Choose which repository to connect to this project. Only
              repositories where you've installed our GitHub App are shown.
            </Alert>

            <div>
              <Text fw={600} size="sm" mb="md">
                Available Repositories (
                {githubAuthData.availableRepositories?.length || 0})
              </Text>

              {githubAuthData.availableRepositories &&
              githubAuthData.availableRepositories.length > 0 ? (
                <Stack gap="sm">
                  {githubAuthData.availableRepositories.map((repo: any) => (
                    <Card
                      key={repo.id}
                      withBorder
                      p="md"
                      className={`cursor-pointer transition-colors ${
                        selectedRepositoryId === repo.id
                          ? "bg-brand-primary/10 border-brand-primary"
                          : "hover:bg-surface-hover"
                      }`}
                      onClick={() => setSelectedRepositoryId(repo.id)}
                    >
                      <Group justify="space-between" align="center">
                        <Group gap="md" align="center">
                          <Radio
                            checked={selectedRepositoryId === repo.id}
                            onChange={() => setSelectedRepositoryId(repo.id)}
                          />
                          <Stack gap={4}>
                            <Text fw={600} size="sm">
                              {repo.full_name}
                            </Text>
                            <Group gap="xs">
                              <Badge
                                size="xs"
                                variant="light"
                                color={repo.private ? "orange" : "green"}
                              >
                                {repo.private ? "Private" : "Public"}
                              </Badge>
                              {repo.language && (
                                <Badge size="xs" variant="outline">
                                  {repo.language}
                                </Badge>
                              )}
                            </Group>
                            {repo.description && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {repo.description}
                              </Text>
                            )}
                          </Stack>
                        </Group>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Alert icon={<IconAlertCircle size={16} />} color="orange">
                  No repositories found. Please install our GitHub App on at
                  least one repository first.
                </Alert>
              )}
            </div>

            <Group justify="flex-end" mt="lg">
              <Button
                variant="outline"
                onClick={() => setGithubRepoModalOpened(false)}
                disabled={isCreatingIntegration}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGitHubRepositorySelected}
                loading={isCreatingIntegration}
                disabled={!selectedRepositoryId}
              >
                Connect Repository
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Workflow Details Modal (for existing workflows) */}
      <Modal
        opened={detailsModalOpened}
        onClose={() => setDetailsModalOpened(false)}
        title="Workflow Details"
        size="lg"
      >
        {selectedTemplate && (
          <Stack gap="lg">
            <div>
              <Text fw={600} size="lg" mb="xs">
                {selectedTemplate.name}
              </Text>
              <Text size="sm" c="dimmed" mb="md">
                {selectedTemplate.description}
              </Text>

              <Group gap="xs" mb="md">
                <Badge
                  variant="light"
                  color={getCategoryColor(
                    selectedTemplate.template?.category || "Integration",
                  )}
                >
                  {selectedTemplate.template?.category || "Integration"}
                </Badge>
                {selectedTemplate.isActive && (
                  <Badge color="green">Active</Badge>
                )}
              </Group>
            </div>

            <div>
              <Text fw={600} size="sm" mb="xs">
                Configuration
              </Text>
              <Card withBorder p="md" className="bg-surface-secondary">
                <Stack gap="xs">
                  {selectedTemplate.configuration &&
                    Object.entries(selectedTemplate.configuration).map(
                      ([key, value]) => (
                        <Group key={key} justify="space-between">
                          <Text size="sm" c="dimmed">
                            {key}:
                          </Text>
                          <Text size="sm">
                            {Array.isArray(value)
                              ? value.join(", ")
                              : String(value)}
                          </Text>
                        </Group>
                      ),
                    )}
                </Stack>
              </Card>
            </div>

            {selectedTemplate.runs && selectedTemplate.runs.length > 0 && (
              <div>
                <Text fw={600} size="sm" mb="xs">
                  Recent Executions
                </Text>
                <Stack gap="xs">
                  {selectedTemplate.runs.slice(0, 5).map((run: any) => (
                    <Card key={run.id} withBorder p="sm">
                      <Group justify="space-between" align="center">
                        <Text size="sm">
                          {new Date(run.startedAt).toLocaleString()}
                        </Text>
                        <Badge
                          color={
                            run.status === "completed"
                              ? "green"
                              : run.status === "failed"
                                ? "red"
                                : "blue"
                          }
                          size="sm"
                        >
                          {run.status}
                        </Badge>
                      </Group>
                      {run.duration && (
                        <Text size="xs" c="dimmed" mt="xs">
                          Duration: {run.duration}ms
                        </Text>
                      )}
                    </Card>
                  ))}
                </Stack>
              </div>
            )}

            <Group justify="flex-end" mt="lg">
              <Button
                variant="outline"
                onClick={() => setDetailsModalOpened(false)}
              >
                Close
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
