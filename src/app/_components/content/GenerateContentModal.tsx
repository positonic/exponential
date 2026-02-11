"use client";

import { useState } from "react";
import {
  Modal,
  TextInput,
  NumberInput,
  Button,
  Stack,
  Checkbox,
  Group,
  Text,
  Alert,
  Stepper,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconRocket, IconInfoCircle } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface GenerateContentModalProps {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
}

const PLATFORMS = [
  { value: "BLOG", label: "Blog Post" },
  { value: "TWITTER", label: "Twitter/X Thread" },
  { value: "LINKEDIN", label: "LinkedIn Post" },
  { value: "YOUTUBE_SCRIPT", label: "YouTube Script" },
] as const;

export function GenerateContentModal({
  opened,
  onClose,
  workspaceId,
}: GenerateContentModalProps) {
  const [owner, setOwner] = useState("positonic");
  const [repo, setRepo] = useState("exponential");
  const [branch, setBranch] = useState("main");
  const [dayRange, setDayRange] = useState<number>(7);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "BLOG",
  ]);
  const [tone, setTone] = useState("");
  const [activeStep, setActiveStep] = useState(0);

  const utils = api.useUtils();

  const seedMutation = api.workflowPipeline.seedTemplates.useMutation();

  const createDefinition =
    api.workflowPipeline.createDefinition.useMutation();

  const executeMutation = api.workflowPipeline.execute.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Content generated!",
        message: "Your content drafts are ready for review.",
        color: "green",
      });
      void utils.content.listDrafts.invalidate();
      void utils.workflowPipeline.listRuns.invalidate();
      onClose();
      resetForm();
    },
    onError: (error) => {
      notifications.show({
        title: "Generation failed",
        message: error.message,
        color: "red",
      });
    },
  });

  const isRunning =
    seedMutation.isPending ||
    createDefinition.isPending ||
    executeMutation.isPending;

  const handleGenerate = async () => {
    if (selectedPlatforms.length === 0) {
      notifications.show({
        title: "Select platforms",
        message: "Please select at least one content platform.",
        color: "yellow",
      });
      return;
    }

    // 1. Ensure templates exist
    await seedMutation.mutateAsync();

    // 2. Create a workflow definition
    const definition = await createDefinition.mutateAsync({
      workspaceId,
      templateSlug: "content-generation",
      name: `Content for ${repo} (${new Date().toLocaleDateString()})`,
      config: {
        owner,
        repo,
        branch,
        dayRange,
        platforms: selectedPlatforms,
        tone: tone || undefined,
      },
    });

    // 3. Execute it
    await executeMutation.mutateAsync({
      definitionId: definition.id,
    });
  };

  const resetForm = () => {
    setActiveStep(0);
    setSelectedPlatforms(["BLOG"]);
    setTone("");
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform],
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Generate Content from Commits"
      size="lg"
    >
      <Stepper
        active={activeStep}
        onStepClick={setActiveStep}
        size="sm"
        mb="lg"
      >
        <Stepper.Step label="Source" description="GitHub repo">
          <Stack gap="md" mt="md">
            <Group grow>
              <TextInput
                label="GitHub Owner"
                placeholder="positonic"
                value={owner}
                onChange={(e) => setOwner(e.currentTarget.value)}
                required
              />
              <TextInput
                label="Repository"
                placeholder="exponential"
                value={repo}
                onChange={(e) => setRepo(e.currentTarget.value)}
                required
              />
            </Group>
            <Group grow>
              <TextInput
                label="Branch"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.currentTarget.value)}
              />
              <NumberInput
                label="Days to look back"
                value={dayRange}
                onChange={(val) => setDayRange(Number(val) || 7)}
                min={1}
                max={90}
              />
            </Group>
            <Button onClick={() => setActiveStep(1)}>Next</Button>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Platforms" description="Where to publish">
          <Stack gap="md" mt="md">
            <Text size="sm" className="text-text-secondary">
              Select which platforms to generate content for:
            </Text>
            {PLATFORMS.map((platform) => (
              <Checkbox
                key={platform.value}
                label={platform.label}
                checked={selectedPlatforms.includes(platform.value)}
                onChange={() => togglePlatform(platform.value)}
              />
            ))}
            <TextInput
              label="Tone (optional)"
              placeholder="e.g. professional, casual, technical, excited"
              value={tone}
              onChange={(e) => setTone(e.currentTarget.value)}
            />
            <Group>
              <Button variant="default" onClick={() => setActiveStep(0)}>
                Back
              </Button>
              <Button onClick={() => setActiveStep(2)}>Next</Button>
            </Group>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Generate" description="Review & run">
          <Stack gap="md" mt="md">
            <Alert
              icon={<IconInfoCircle size={16} />}
              title="Ready to generate"
              color="blue"
            >
              <Text size="sm">
                Will analyze commits from{" "}
                <strong>
                  {owner}/{repo}
                </strong>{" "}
                ({branch}) over the last <strong>{dayRange} days</strong> and
                generate {selectedPlatforms.length} content draft
                {selectedPlatforms.length !== 1 ? "s" : ""}:
              </Text>
              <Group gap="xs" mt="xs">
                {selectedPlatforms.map((p) => (
                  <Text
                    key={p}
                    size="xs"
                    className="rounded-md bg-surface-secondary px-2 py-1"
                  >
                    {PLATFORMS.find((pl) => pl.value === p)?.label ?? p}
                  </Text>
                ))}
              </Group>
              {tone && (
                <Text size="xs" mt="xs" c="dimmed">
                  Tone: {tone}
                </Text>
              )}
            </Alert>
            <Group>
              <Button variant="default" onClick={() => setActiveStep(1)}>
                Back
              </Button>
              <Button
                leftSection={<IconRocket size={16} />}
                onClick={() => void handleGenerate()}
                loading={isRunning}
                color="brand"
              >
                {isRunning ? "Generating..." : "Generate Content"}
              </Button>
            </Group>
          </Stack>
        </Stepper.Step>
      </Stepper>
    </Modal>
  );
}
