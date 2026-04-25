"use client";

import { useState } from "react";
import {
  Modal,
  TextInput,
  NumberInput,
  Select,
  Textarea,
  Button,
  Group,
  Stack,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  type: string;
}

interface CreateDealModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  workspaceId: string;
  stages: PipelineStage[];
}

export function CreateDealModal({
  opened,
  onClose,
  projectId,
  workspaceId,
  stages,
}: CreateDealModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState<number | undefined>();
  const [probability, setProbability] = useState<number | undefined>();
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? "");
  const [contactId, setContactId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [expectedCloseDate, setExpectedCloseDate] = useState<Date | null>(null);

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
    setStageId(stages[0]?.id ?? "");
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

        <DateInput
          label="Expected Close Date"
          placeholder="Select date"
          value={expectedCloseDate}
          onChange={setExpectedCloseDate}
          clearable
        />

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
