"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  TextInput,
  NumberInput,
  Select,
  Textarea,
  Button,
  Group,
  Stack,
  Input,
} from "@mantine/core";
import { UnifiedDatePicker } from "~/app/_components/UnifiedDatePicker";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  type: string;
}

interface PipelineOption {
  id: string;
  name: string;
  pipelineStages: PipelineStage[];
}

interface CreateDealModalProps {
  opened: boolean;
  onClose: () => void;
  /** Every pipeline in the workspace the deal can be created on. */
  pipelines: PipelineOption[];
  /** The pipeline selected on the page — the modal's default destination. */
  defaultProjectId: string;
  workspaceId: string;
}

export function CreateDealModal({
  opened,
  onClose,
  pipelines,
  defaultProjectId,
  workspaceId,
}: CreateDealModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState<number | undefined>();
  const [probability, setProbability] = useState<number | undefined>();
  const [projectId, setProjectId] = useState<string>(defaultProjectId);
  const [stageId, setStageId] = useState<string>("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [expectedCloseDate, setExpectedCloseDate] = useState<Date | null>(null);

  // Stages of the currently-selected pipeline (ordered, so [0] is "Lead").
  const selectedPipeline =
    pipelines.find((p) => p.id === projectId) ?? pipelines[0];
  const stages = selectedPipeline?.pipelineStages ?? [];

  // Each time the modal opens, default the destination to the pipeline the page
  // is showing.
  useEffect(() => {
    if (opened) setProjectId(defaultProjectId);
  }, [opened, defaultProjectId]);

  // Keep the stage valid: default to the first stage ("Lead") whenever the
  // pipeline changes or the current stage isn't part of the selected pipeline.
  useEffect(() => {
    if (!stages.some((s) => s.id === stageId)) {
      setStageId(stages[0]?.id ?? "");
    }
  }, [stages, stageId]);

  const utils = api.useUtils();

  // Fetch contacts for selector
  const { data: contactsData } = api.crmContact.getAll.useQuery(
    {
      workspaceId,
      limit: 100,
    },
    { enabled: opened },
  );

  // Fetch organizations for selector
  const { data: orgsData } = api.crmOrganization.getAll.useQuery(
    {
      workspaceId,
      limit: 100,
    },
    { enabled: opened },
  );

  const createDealMutation = api.pipeline.createDeal.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Deal created",
        message: "New deal has been added to the pipeline",
        color: "green",
      });
      void utils.pipeline.getDeals.invalidate({ projectId });
      void utils.pipeline.getStats.invalidate({ projectId });
      resetForm();
      onClose();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to create deal",
        color: "red",
      });
    },
  });

  function resetForm() {
    setTitle("");
    setDescription("");
    setValue(undefined);
    setProbability(undefined);
    setProjectId(defaultProjectId);
    // stageId re-defaults to the first stage via the stages effect.
    setContactId(null);
    setOrganizationId(null);
    setExpectedCloseDate(null);
  }

  function handleSubmit() {
    if (!title.trim()) return;

    createDealMutation.mutate({
      projectId,
      workspaceId,
      stageId,
      title: title.trim(),
      description: description.trim() || undefined,
      value,
      probability,
      contactId: contactId ?? undefined,
      organizationId: organizationId ?? undefined,
      expectedCloseDate: expectedCloseDate ?? undefined,
    });
  }

  const contactOptions = (contactsData?.contacts ?? []).map((c) => ({
    value: c.id,
    label: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed",
  }));

  const orgOptions = (orgsData?.organizations ?? []).map((o) => ({
    value: o.id,
    label: o.name,
  }));

  const pipelineOptions = pipelines.map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const stageOptions = stages.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create Deal"
      size="md"
    >
      <Stack gap="md">
        <TextInput
          label="Title"
          placeholder="Deal name"
          required
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />

        <Textarea
          label="Description"
          placeholder="Deal description (optional)"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          minRows={2}
        />

        <Group grow>
          <NumberInput
            label="Value"
            placeholder="Deal value"
            prefix="$"
            min={0}
            thousandSeparator=","
            value={value ?? ""}
            onChange={(val) => setValue(typeof val === "number" ? val : undefined)}
          />
          <NumberInput
            label="Probability"
            placeholder="Win %"
            suffix="%"
            min={0}
            max={100}
            value={probability ?? ""}
            onChange={(val) => setProbability(typeof val === "number" ? val : undefined)}
          />
        </Group>

        {pipelines.length > 1 && (
          <Select
            label="Pipeline"
            data={pipelineOptions}
            value={projectId}
            onChange={(val) => val && setProjectId(val)}
            allowDeselect={false}
          />
        )}

        <Select
          label="Stage"
          data={stageOptions}
          value={stageId}
          onChange={(val) => val && setStageId(val)}
        />

        <Select
          label="Contact"
          placeholder="Link to a contact"
          data={contactOptions}
          value={contactId}
          onChange={setContactId}
          searchable
          clearable
        />

        <Select
          label="Organization"
          placeholder="Link to an organization"
          data={orgOptions}
          value={organizationId}
          onChange={setOrganizationId}
          searchable
          clearable
        />

        <Input.Wrapper label="Expected Close Date">
          <div>
            <UnifiedDatePicker
              value={expectedCloseDate}
              onChange={setExpectedCloseDate}
              placeholder="Select date"
              notificationContext="deal"
            />
          </div>
        </Input.Wrapper>

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={createDealMutation.isPending}
            disabled={!title.trim()}
          >
            Create Deal
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
