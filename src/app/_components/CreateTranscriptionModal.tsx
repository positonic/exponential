"use client";

import {
  ActionIcon,
  FileButton,
  Image,
  Modal,
  Button,
  Group,
  TextInput,
  Textarea,
  Stack,
  Input,
  InputBase,
  Pill,
  Text,
  Combobox,
} from "@mantine/core";
import { UnifiedDatePicker } from "~/app/_components/UnifiedDatePicker";
import { useDisclosure } from "@mantine/hooks";
import { useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import {
  IconBulb,
  IconPhoto,
  IconPlus,
  IconUpload,
  IconUserPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import {
  ParticipantPicker,
  type PendingParticipant,
} from "~/app/_components/meeting/ParticipantPicker";
import { MeetingProjectPicker } from "~/app/_components/meeting/MeetingProjectPicker";
import {
  MeetingOccurrencePicker,
  formatOccurrenceWhen,
  type MeetingOccurrenceOption,
} from "~/app/_components/meeting/MeetingOccurrencePicker";
import {
  MeetingFeaturePicker,
  type MeetingFeatureOption,
} from "~/app/_components/meeting/MeetingFeaturePicker";
import {
  isImageFile,
  readMeetingImages,
  type PendingMeetingImage,
} from "~/lib/meetings/meetingImages";
import { reportHandledError } from "~/lib/reportHandledError";
import { useFileDrop } from "~/hooks/useFileDrop";

interface CreateTranscriptionModalProps {
  projectId?: string;
  workspaceId?: string;
  trigger?: React.ReactNode;
}

export function CreateTranscriptionModal({
  projectId,
  workspaceId,
  trigger,
}: CreateTranscriptionModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [transcription, setTranscription] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingDate, setMeetingDate] = useState<Date | null>(null);
  const [pendingParticipants, setPendingParticipants] = useState<
    PendingParticipant[]
  >([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [images, setImages] = useState<PendingMeetingImage[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const resetFileRef = useRef<() => void>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectId ?? null,
  );
  const [occurrence, setOccurrence] = useState<MeetingOccurrenceOption | null>(
    null,
  );
  const [featureIds, setFeatureIds] = useState<string[]>([]);

  // Placement is project-authoritative (CONTEXT.md → Meeting↔Workspace): the
  // picked project's workspace wins. Opened from a workspace, the list is
  // narrowed to that workspace so the meeting can't wander out of it.
  const { data: assignableProjects = [] } = api.project.getAssignable.useQuery(
    undefined,
    { enabled: opened },
  );
  const projectOptions = useMemo(
    () =>
      workspaceId
        ? assignableProjects.filter((p) => p.workspaceId === workspaceId)
        : assignableProjects,
    [assignableProjects, workspaceId],
  );
  const selectedProject = assignableProjects.find(
    (p) => p.id === selectedProjectId,
  );
  const effectiveWorkspaceId =
    workspaceId ?? selectedProject?.workspaceId ?? null;

  // Ceremony occurrences a week either side of the meeting date (or now), as on
  // the meeting page's "Part of" row.
  const occurrenceWindow = useMemo(() => {
    const day = 86_400_000;
    const anchor = meetingDate ?? new Date();
    return {
      from: new Date(anchor.getTime() - 7 * day),
      to: new Date(anchor.getTime() + 7 * day),
    };
    // `opened` re-anchors "now" each time the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingDate, opened]);
  const { data: occurrenceRows = [] } = api.ceremony.listOccurrences.useQuery(
    {
      workspaceId: effectiveWorkspaceId ?? "",
      from: occurrenceWindow.from,
      to: occurrenceWindow.to,
    },
    { enabled: opened && Boolean(effectiveWorkspaceId) },
  );
  const occurrenceOptions = useMemo<MeetingOccurrenceOption[]>(
    () =>
      occurrenceRows.map((o) => ({
        id: o.id,
        ceremonyId: o.ceremonyId,
        ceremonyName: o.ceremony.name,
        scheduledStart: new Date(o.scheduledStart),
      })),
    [occurrenceRows],
  );

  const { data: workspaceFeatures = [] } =
    api.product.feature.listForWorkspace.useQuery(
      { workspaceId: effectiveWorkspaceId ?? "" },
      { enabled: opened && Boolean(effectiveWorkspaceId) },
    );
  const featureOptions = useMemo<MeetingFeatureOption[]>(
    () =>
      workspaceFeatures.map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status,
        productName: f.product.name,
      })),
    [workspaceFeatures],
  );
  const selectedFeatures = featureIds
    .map((id) => featureOptions.find((f) => f.id === id))
    .filter((f): f is MeetingFeatureOption => Boolean(f));

  const utils = api.useUtils();
  const uploadScreenshot = api.transcription.uploadScreenshot.useMutation();

  const createTranscription =
    api.transcription.createManualTranscription.useMutation({
      onSuccess: () => {
        if (selectedProjectId) {
          // Invalidate without input — query may be keyed by slug or id, so match all variants
          void utils.project.getById.invalidate();
        }
        void utils.transcription.getAllTranscriptions.invalidate({
          workspaceId,
        });
        void utils.transcription.getMeetingCards.invalidate({ workspaceId });
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to create meeting",
          color: "red",
        });
      },
    });

  function handleProjectChange(nextProjectId: string | null) {
    const next = assignableProjects.find((p) => p.id === nextProjectId);
    const nextWorkspaceId = workspaceId ?? next?.workspaceId ?? null;
    // Ceremonies, features and participants are all workspace-scoped — a
    // project in another workspace strands whatever was picked for this one.
    if (nextWorkspaceId !== effectiveWorkspaceId) {
      setOccurrence(null);
      setFeatureIds([]);
      setPendingParticipants([]);
    }
    setSelectedProjectId(nextProjectId);
  }

  function handleOccurrenceChange(occurrenceId: string | null) {
    const picked = occurrenceOptions.find((o) => o.id === occurrenceId) ?? null;
    setOccurrence(picked);
    // An undated meeting takes its date from the occurrence it captured.
    if (picked && !meetingDate) setMeetingDate(picked.scheduledStart);
  }

  function handleFeatureToggle(featureId: string, linked: boolean) {
    setFeatureIds((prev) =>
      linked
        ? prev.includes(featureId)
          ? prev
          : [...prev, featureId]
        : prev.filter((id) => id !== featureId),
    );
  }

  function handleAddPending(person: PendingParticipant) {
    setPendingParticipants((prev) =>
      prev.some((p) => p.key === person.key) ? prev : [...prev, person],
    );
  }

  function handleRemovePending(key: string) {
    setPendingParticipants((prev) => prev.filter((p) => p.key !== key));
  }

  async function addImageFiles(files: File[]) {
    const { images: read, errors, skippedCount } =
      await readMeetingImages(files);
    if (skippedCount > 0) {
      notifications.show({
        title: "Not an image",
        message: "Only image files can be attached to a meeting.",
        color: "yellow",
      });
    }
    for (const message of errors) {
      notifications.show({
        title: "Couldn't attach image",
        message,
        color: "red",
      });
    }
    if (read.length > 0) setImages((prev) => [...prev, ...read]);
  }

  const fileDrop = useFileDrop((files) => void addImageFiles(files));

  function handleRemoveImage(id: string) {
    setImages((prev) => prev.filter((image) => image.id !== id));
  }

  // Pasting a screenshot anywhere in the form attaches it; text pastes as usual.
  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files).filter(isImageFile);
    if (files.length === 0) return;
    e.preventDefault();
    void addImageFiles(files);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setTranscription("");
    setNotes("");
    setMeetingDate(null);
    setPendingParticipants([]);
    setImages([]);
    setSelectedProjectId(projectId ?? null);
    setOccurrence(null);
    setFeatureIds([]);
  }

  function handleClose() {
    setPickerOpen(false);
    setPendingParticipants([]);
    setImages([]);
    fileDrop.reset();
    close();
  }

  // Upload one at a time: the Screenshots tab orders by creation time, so this
  // keeps the images in the order they were added.
  async function uploadImages(transcriptionSessionId: string) {
    let failed = 0;
    for (const image of images) {
      try {
        await uploadScreenshot.mutateAsync({
          transcriptionSessionId,
          base64Data: image.base64,
          contentType: image.contentType,
        });
      } catch (error) {
        failed += 1;
        reportHandledError(error, {
          area: "meeting-image-upload",
          context: { transcriptionSessionId, contentType: image.contentType },
        });
      }
    }
    return failed;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !transcription.trim()) return;

    let meetingId: string;
    try {
      const created = await createTranscription.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        transcription: transcription.trim(),
        notes: notes.trim() || undefined,
        meetingDate: meetingDate ?? undefined,
        projectId: selectedProjectId ?? undefined,
        workspaceId: effectiveWorkspaceId ?? undefined,
        occurrenceId: occurrence?.id,
        featureIds: featureIds.length > 0 ? featureIds : undefined,
        participants:
          pendingParticipants.length > 0
            ? pendingParticipants.map((p) => p.payload)
            : undefined,
      });
      meetingId = created.id;
    } catch {
      // onError already told the user; keep the modal open so they can retry.
      return;
    }

    const imageCount = images.length;
    let failedImages = 0;
    if (imageCount > 0) {
      setIsUploadingImages(true);
      failedImages = await uploadImages(meetingId);
      setIsUploadingImages(false);
    }

    resetForm();
    close();

    if (failedImages > 0) {
      // The meeting exists now, so resubmitting would duplicate it — say which
      // part failed instead of keeping the modal open.
      notifications.show({
        title: "Meeting created",
        message: `${failedImages} of ${imageCount} image${imageCount === 1 ? "" : "s"} couldn't be uploaded.`,
        color: "yellow",
      });
      return;
    }

    notifications.show({
      title: "Meeting Created",
      message:
        imageCount > 0
          ? `Your meeting has been added with ${imageCount} image${imageCount === 1 ? "" : "s"}.`
          : "Your meeting has been added successfully.",
      color: "green",
    });
  };

  const isValid = title.trim() && transcription.trim();
  // Hide already-staged people from the picker — by their identity key and by
  // email, so a staged team member also masks a matching CRM contact. Memoized
  // so its Set identity is stable across renders (the picker's members memo
  // depends on it and would otherwise recompute every render).
  const existingParticipants = useMemo(() => {
    const keys = new Set<string>();
    for (const p of pendingParticipants) {
      keys.add(p.key);
      if (p.email) keys.add(`email:${p.email.toLowerCase()}`);
    }
    return keys;
  }, [pendingParticipants]);

  return (
    <>
      {trigger ? (
        <div onClick={open}>{trigger}</div>
      ) : (
        <Button
          leftSection={<IconPlus size={16} />}
          variant="light"
          size="xs"
          onClick={open}
        >
          Add Meeting
        </Button>
      )}

      <Modal
        opened={opened}
        onClose={handleClose}
        size="lg"
        radius="md"
        padding="lg"
        title="Add Meeting"
        {...fileDrop.handlers}
      >
        <form
          onSubmit={(e) => void handleSubmit(e)}
          onPaste={handlePaste}
          className="relative"
        >
          {fileDrop.isDragging && (
            <div className="pointer-events-none absolute -inset-2 z-10 rounded-md border-2 border-dashed border-border-focus bg-surface-primary">
              <div className="sticky top-1/3 flex flex-col items-center gap-2 py-16 text-text-primary">
                <IconPhoto size={32} className="text-brand-primary" />
                <Text fw={500}>Drop images to attach to this meeting</Text>
                <Text size="xs" c="dimmed">
                  They&apos;ll appear on the meeting&apos;s Screenshots tab
                </Text>
              </div>
            </div>
          )}
          <Stack gap="md">
            <TextInput
              label="Title"
              placeholder="Meeting title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <TextInput
              label="Description"
              placeholder="Brief description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Input.Wrapper label="Meeting Date">
              <div>
                <UnifiedDatePicker
                  value={meetingDate}
                  onChange={setMeetingDate}
                  placeholder="When did the meeting occur?"
                  notificationContext="meeting"
                />
              </div>
            </Input.Wrapper>

            <Group grow align="flex-start">
              <Input.Wrapper label="Project">
                <MeetingProjectPicker
                  projects={projectOptions}
                  value={selectedProjectId}
                  onChange={handleProjectChange}
                  noneLabel={workspaceId ? "No project" : "Personal / no project"}
                  dropdownWidth="target"
                >
                  {() => (
                    <InputBase
                      component="button"
                      type="button"
                      pointer
                      rightSection={<Combobox.Chevron />}
                      rightSectionPointerEvents="none"
                      aria-label="Project"
                    >
                      {selectedProject ? (
                        selectedProject.name
                      ) : (
                        <Input.Placeholder>No project</Input.Placeholder>
                      )}
                    </InputBase>
                  )}
                </MeetingProjectPicker>
              </Input.Wrapper>

              <Input.Wrapper label="Ceremony">
                <MeetingOccurrencePicker
                  occurrences={occurrenceOptions}
                  value={occurrence?.id ?? null}
                  onChange={handleOccurrenceChange}
                  disabled={!effectiveWorkspaceId}
                  dropdownWidth="target"
                >
                  {() => (
                    <InputBase
                      component="button"
                      type="button"
                      pointer
                      disabled={!effectiveWorkspaceId}
                      rightSection={<Combobox.Chevron />}
                      rightSectionPointerEvents="none"
                      aria-label="Ceremony"
                    >
                      {occurrence ? (
                        `${occurrence.ceremonyName} · ${formatOccurrenceWhen(occurrence.scheduledStart)}`
                      ) : (
                        <Input.Placeholder>
                          {effectiveWorkspaceId
                            ? "Not part of a ceremony"
                            : "Pick a project first"}
                        </Input.Placeholder>
                      )}
                    </InputBase>
                  )}
                </MeetingOccurrencePicker>
              </Input.Wrapper>
            </Group>

            <Input.Wrapper
              label="Features"
              description="Features this meeting discussed."
            >
              <Stack gap="xs" mt={4}>
                {selectedFeatures.length > 0 && (
                  <Pill.Group>
                    {selectedFeatures.map((f) => (
                      <Pill
                        key={f.id}
                        withRemoveButton
                        onRemove={() => handleFeatureToggle(f.id, false)}
                        title={`${f.name} · ${f.productName}`}
                      >
                        {f.name}
                      </Pill>
                    ))}
                  </Pill.Group>
                )}
                <div style={{ alignSelf: "flex-start" }}>
                  <MeetingFeaturePicker
                    features={featureOptions}
                    value={featureIds}
                    onToggle={handleFeatureToggle}
                    disabled={!effectiveWorkspaceId}
                    position="bottom-start"
                  >
                    {() => (
                      <Button
                        variant="light"
                        size="xs"
                        leftSection={<IconBulb size={14} />}
                        disabled={!effectiveWorkspaceId}
                      >
                        Link feature
                      </Button>
                    )}
                  </MeetingFeaturePicker>
                </div>
              </Stack>
            </Input.Wrapper>

            <Input.Wrapper
              label="Participants"
              description="Add teammates, link CRM contacts, or add new people by name and email."
            >
              <Stack gap="xs" mt={4}>
                {pendingParticipants.length > 0 && (
                  <Pill.Group>
                    {pendingParticipants.map((p) => (
                      <Pill
                        key={p.key}
                        withRemoveButton
                        onRemove={() => handleRemovePending(p.key)}
                        title={
                          p.kind === "member"
                            ? `${p.email} · team member`
                            : p.email
                        }
                      >
                        <span className="inline-flex items-center gap-1">
                          {p.kind === "member" && <IconUsers size={11} />}
                          {p.name}
                        </span>
                      </Pill>
                    ))}
                  </Pill.Group>
                )}
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconUserPlus size={14} />}
                  onClick={() => setPickerOpen(true)}
                  disabled={!effectiveWorkspaceId}
                  style={{ alignSelf: "flex-start" }}
                >
                  Add participant
                </Button>
                {!effectiveWorkspaceId && (
                  <Text size="xs" c="dimmed">
                    Pick a project in a workspace to add participants.
                  </Text>
                )}
              </Stack>
            </Input.Wrapper>

            <Textarea
              label="Transcript"
              placeholder="Paste or type the meeting transcript..."
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              required
              minRows={8}
              autosize
              maxRows={20}
            />

            <Textarea
              label="Notes"
              placeholder="Add meeting notes or a summary..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              minRows={4}
              autosize
              maxRows={12}
            />

            <Input.Wrapper
              label="Images"
              description="Screenshots or photos from the meeting — shown on its Screenshots tab."
            >
              <Stack gap="xs" mt={4}>
                <FileButton
                  multiple
                  accept="image/*"
                  resetRef={resetFileRef}
                  onChange={(files) => {
                    resetFileRef.current?.();
                    if (files.length > 0) void addImageFiles(files);
                  }}
                >
                  {(buttonProps) => (
                    <div
                      {...buttonProps}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          buttonProps.onClick();
                        }
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border-strong p-3 transition-colors hover:border-border-focus hover:bg-surface-secondary"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-brand-primary">
                        <IconUpload size={17} />
                      </span>
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          Drag images anywhere onto this dialog
                        </div>
                        <div className="text-xs text-text-muted">
                          Or click to browse, or paste a screenshot
                        </div>
                      </div>
                    </div>
                  )}
                </FileButton>

                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {images.map((image) => (
                      <div key={image.id} className="group relative">
                        <Image
                          src={image.previewUrl}
                          alt={image.name}
                          title={image.name}
                          h={72}
                          w="auto"
                          radius="sm"
                          className="border border-border-primary"
                        />
                        <ActionIcon
                          size="xs"
                          variant="filled"
                          color="red"
                          radius="xl"
                          className="absolute -right-1 -top-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                          aria-label={`Remove ${image.name}`}
                          onClick={() => handleRemoveImage(image.id)}
                          disabled={isUploadingImages}
                        >
                          <IconX size={10} />
                        </ActionIcon>
                      </div>
                    ))}
                  </div>
                )}
              </Stack>
            </Input.Wrapper>

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" color="gray" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createTranscription.isPending || isUploadingImages}
                disabled={!isValid}
              >
                Add Meeting
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <ParticipantPicker
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        workspaceId={effectiveWorkspaceId}
        existing={existingParticipants}
        onAdd={handleAddPending}
      />
    </>
  );
}
