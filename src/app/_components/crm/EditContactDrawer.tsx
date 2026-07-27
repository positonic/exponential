'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer,
  TextInput,
  Select,
  Chip,
  Button,
  ActionIcon,
  Avatar,
  FileButton,
  Image,
  Modal,
  Tooltip,
  Text,
  Badge,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconUser,
  IconMail,
  IconPhone,
  IconShare3,
  IconBrandLinkedin,
  IconBrandTelegram,
  IconBrandTwitter,
  IconBrandGithub,
  IconBrandBluesky,
  IconFileText,
  IconPhoto,
  IconUpload,
  IconX,
  IconMaximize,
  IconMinimize,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { MarkdownInput } from '~/app/_components/shared/MarkdownInput';
import { EnrichContactButton } from '~/app/_components/crm/EnrichContactButton';
import type { PastedScreenshot } from '~/app/_components/ActionModalForm';

const PROFILE_TYPES = [
  'Developer',
  'Designer',
  'Founder',
  'Product Manager',
  'Investor',
  'Marketing',
  'Sales',
  'Other',
];

export interface EditContactDrawerContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  linkedIn: string | null;
  telegram: string | null;
  twitter: string | null;
  github: string | null;
  bluesky: string | null;
  about: string | null;
  profileType: string | null;
  organizationId: string | null;
  /** Field keys whose current value came from AI enrichment (see ADR-0036). */
  aiSourcedFields?: string[];
}

interface EditContactDrawerProps {
  opened: boolean;
  onClose: () => void;
  contact: EditContactDrawerContact;
  workspaceId: string;
  /** Called after a successful save (e.g. to close the drawer). */
  onSaved?: () => void;
}

/** Read an image File into a PastedScreenshot (base64 + preview data URL). */
function readImageFile(file: File): Promise<PastedScreenshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve({
        id: `screenshot-${Date.now()}-${Math.round(file.size)}`,
        base64: dataUrl.split(',')[1] ?? '',
        previewUrl: dataUrl,
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedIn: string;
  telegram: string;
  twitter: string;
  github: string;
  bluesky: string;
  about: string;
  profileType: string;
  organizationId: string;
}

function toFormState(contact: EditContactDrawerContact): FormState {
  return {
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    linkedIn: contact.linkedIn ?? '',
    telegram: contact.telegram ?? '',
    twitter: contact.twitter ?? '',
    github: contact.github ?? '',
    bluesky: contact.bluesky ?? '',
    about: contact.about ?? '',
    profileType: contact.profileType ?? '',
    organizationId: contact.organizationId ?? '',
  };
}

/** Uppercase section header with a leading icon and a trailing hairline rule. */
function GroupLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-text-faint">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {children}
      </span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

/**
 * Small badge marking a field whose value came from AI enrichment (ADR-0036).
 * The agent can confidently pick the wrong same-named person, so enriched
 * fields are flagged for a human to verify.
 */
function AiFieldBadge() {
  return (
    <Badge size="xs" variant="light" color="grape">
      AI · verify
    </Badge>
  );
}

/** Label + optional "AI · verify" badge for a field, rendered inline. */
function FieldLabel({ label, ai }: { label: string; ai: boolean }) {
  if (!ai) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <AiFieldBadge />
    </span>
  );
}

export function EditContactDrawer({
  opened,
  onClose,
  contact,
  workspaceId,
  onSaved,
}: EditContactDrawerProps) {
  const utils = api.useUtils();
  const [form, setForm] = useState<FormState>(() => toFormState(contact));
  const [wide, setWide] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Newly added images (paste/drop/click) held until Save, then uploaded.
  const [pastedScreenshots, setPastedScreenshots] = useState<PastedScreenshot[]>([]);
  const resetFileRef = useRef<() => void>(null);

  // Re-seed the form + clear pending images each time the drawer opens.
  useEffect(() => {
    if (opened) {
      setForm(toFormState(contact));
      setPastedScreenshots([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, contact.id]);

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  // Field keys whose value came from AI enrichment — badge them "AI · verify".
  const aiFields = useMemo(
    () => new Set(contact.aiSourcedFields ?? []),
    [contact.aiSourcedFields],
  );

  const { data: organizations } = api.crmOrganization.getAll.useQuery(
    { workspaceId, limit: 100 },
    { enabled: opened && !!workspaceId },
  );

  const { data: existingScreenshots } = api.crmContact.listScreenshots.useQuery(
    { contactId: contact.id },
    { enabled: opened && !!contact.id },
  );

  const updateContact = api.crmContact.update.useMutation();
  const uploadImage = api.crmContact.uploadImage.useMutation();
  const removeScreenshot = api.crmContact.removeScreenshot.useMutation({
    onSuccess: () => {
      void utils.crmContact.listScreenshots.invalidate({ contactId: contact.id });
    },
    onError: (error) => {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
    },
  });

  // Combined gallery: persisted images (from DB) + pending ones (this session).
  const galleryImages = useMemo(
    () => [
      ...(existingScreenshots ?? []).map((s) => ({
        id: s.id,
        previewUrl: s.url,
        persisted: true as const,
      })),
      ...pastedScreenshots.map((s) => ({
        id: s.id,
        previewUrl: s.previewUrl,
        persisted: false as const,
      })),
    ],
    [existingScreenshots, pastedScreenshots],
  );

  const addImageFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    try {
      const shots = await Promise.all(images.map(readImageFile));
      setPastedScreenshots((prev) => [...prev, ...shots]);
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Could not read that image',
        color: 'red',
      });
    }
  };

  // Paste a screenshot into the description — same behaviour as EditActionModal.
  const handleDescriptionPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        void addImageFiles([file]);
        break; // only the first image
      }
    }
  };

  const removeImage = (id: string, persisted: boolean) => {
    if (persisted) {
      removeScreenshot.mutate({ contactId: contact.id, screenshotId: id });
    } else {
      setPastedScreenshots((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save the contact fields first; if this throws we never upload images,
      // so there are no orphaned blobs to clean up.
      const trimmedEmail = form.email.trim();
      await updateContact.mutateAsync({
        id: contact.id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: trimmedEmail.length > 0 ? trimmedEmail : null,
        phone: form.phone.trim(),
        linkedIn: form.linkedIn.trim(),
        telegram: form.telegram.trim(),
        twitter: form.twitter.trim(),
        github: form.github.trim(),
        bluesky: form.bluesky.trim(),
        about: form.about.trim(),
        profileType: form.profileType.trim() || undefined,
        organizationId: form.organizationId.length > 0 ? form.organizationId : null,
      });

      void utils.crmContact.getById.invalidate({ id: contact.id });
      void utils.crmContact.getAll.invalidate();

      // Upload pending images in parallel. Drop each one from state as it
      // succeeds so a retry never re-uploads an already-persisted image.
      if (pastedScreenshots.length > 0) {
        const pending = pastedScreenshots;
        const results = await Promise.allSettled(
          pending.map((shot) =>
            uploadImage.mutateAsync({
              contactId: contact.id,
              base64Data: shot.base64,
            }),
          ),
        );
        const failedIds = pending
          .filter((_, i) => results[i]?.status === 'rejected')
          .map((s) => s.id);
        setPastedScreenshots((prev) => prev.filter((s) => failedIds.includes(s.id)));
        void utils.crmContact.listScreenshots.invalidate({ contactId: contact.id });

        if (failedIds.length > 0) {
          // Contact saved, but some images didn't upload — keep the drawer open
          // so the user can retry just the failures.
          notifications.show({
            title: 'Some images failed',
            message: `Contact saved, but ${failedIds.length} image(s) could not be uploaded. Try again.`,
            color: 'orange',
          });
          return;
        }
      }

      notifications.show({
        title: 'Saved',
        message: 'Contact updated successfully',
        color: 'green',
      });
      onSaved?.();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save contact',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const fullName = `${form.firstName} ${form.lastName}`.trim() || 'New contact';
  const initial = (form.firstName?.[0] ?? form.lastName?.[0] ?? '?').toUpperCase();

  return (
    <Drawer.Root
      opened={opened}
      onClose={onClose}
      position="right"
      size={wide ? 720 : 540}
    >
      <Drawer.Overlay />
      <Drawer.Content style={{ display: 'flex', flexDirection: 'column' }}>
        <Drawer.Header>
          <div className="flex w-full items-center gap-3">
            <Avatar radius="md" color="brand">
              {initial}
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Edit contact
              </div>
              <div className="truncate text-base font-semibold text-text-primary">
                {fullName}
              </div>
            </div>
            <Tooltip label={wide ? 'Standard width' : 'Wide'} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => setWide((w) => !w)}
                aria-label={wide ? 'Standard width' : 'Wide'}
              >
                {wide ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
              </ActionIcon>
            </Tooltip>
            <Drawer.CloseButton />
          </div>
        </Drawer.Header>

        <Drawer.Body style={{ flex: 1, overflowY: 'auto' }}>
          {/* Identity */}
          <section className="mb-7">
            <GroupLabel icon={<IconUser size={13} />}>Identity</GroupLabel>
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                label="First name"
                value={form.firstName}
                onChange={(e) => set('firstName')(e.currentTarget.value)}
              />
              <TextInput
                label="Last name"
                value={form.lastName}
                onChange={(e) => set('lastName')(e.currentTarget.value)}
              />
            </div>
            <Text size="sm" fw={500} mt="md" mb={6} c="dimmed">
              Profile type
            </Text>
            <Chip.Group
              multiple={false}
              value={form.profileType}
              onChange={(value) => set('profileType')(value)}
            >
              <div className="flex flex-wrap gap-2">
                {PROFILE_TYPES.map((type) => (
                  <Chip key={type} value={type} variant="outline" size="sm">
                    {type}
                  </Chip>
                ))}
              </div>
            </Chip.Group>
            <Select
              mt="md"
              label={
                <FieldLabel label="Company" ai={aiFields.has('organizationId')} />
              }
              placeholder="Select organization…"
              data={
                organizations?.organizations.map((org) => ({
                  value: org.id,
                  label: org.name,
                })) ?? []
              }
              value={form.organizationId || null}
              onChange={(value) => set('organizationId')(value ?? '')}
              clearable
              searchable
            />
          </section>

          {/* Contact */}
          <section className="mb-7">
            <GroupLabel icon={<IconMail size={13} />}>Contact</GroupLabel>
            <TextInput
              label={<FieldLabel label="Email" ai={aiFields.has('email')} />}
              type="email"
              leftSection={<IconMail size={15} />}
              value={form.email}
              onChange={(e) => set('email')(e.currentTarget.value)}
            />
            <TextInput
              mt="sm"
              label={<FieldLabel label="Phone" ai={aiFields.has('phone')} />}
              leftSection={<IconPhone size={15} />}
              placeholder="Add phone number"
              value={form.phone}
              onChange={(e) => set('phone')(e.currentTarget.value)}
            />
          </section>

          {/* Social */}
          <section className="mb-7">
            <GroupLabel icon={<IconShare3 size={13} />}>Social</GroupLabel>
            <TextInput
              label={<FieldLabel label="LinkedIn URL" ai={aiFields.has('linkedIn')} />}
              type="url"
              leftSection={<IconBrandLinkedin size={15} />}
              value={form.linkedIn}
              onChange={(e) => set('linkedIn')(e.currentTarget.value)}
            />
            <TextInput
              mt="sm"
              label={<FieldLabel label="Telegram" ai={aiFields.has('telegram')} />}
              leftSection={<IconBrandTelegram size={15} />}
              placeholder="username"
              value={form.telegram}
              onChange={(e) => set('telegram')(e.currentTarget.value)}
            />
            <TextInput
              mt="sm"
              label={<FieldLabel label="Twitter / X" ai={aiFields.has('twitter')} />}
              leftSection={<IconBrandTwitter size={15} />}
              placeholder="handle"
              value={form.twitter}
              onChange={(e) => set('twitter')(e.currentTarget.value)}
            />
            <TextInput
              mt="sm"
              label={<FieldLabel label="GitHub" ai={aiFields.has('github')} />}
              leftSection={<IconBrandGithub size={15} />}
              placeholder="username"
              value={form.github}
              onChange={(e) => set('github')(e.currentTarget.value)}
            />
            <TextInput
              mt="sm"
              label={<FieldLabel label="BlueSky" ai={aiFields.has('bluesky')} />}
              leftSection={<IconBrandBluesky size={15} />}
              placeholder="handle.bsky.social"
              value={form.bluesky}
              onChange={(e) => set('bluesky')(e.currentTarget.value)}
            />
          </section>

          {/* Description — paste a screenshot here to attach it (like actions). */}
          <section className="mb-7">
            <GroupLabel icon={<IconFileText size={13} />}>
              <span className="inline-flex items-center gap-1.5">
                Description
                {aiFields.has('about') && <AiFieldBadge />}
              </span>
            </GroupLabel>
            <MarkdownInput
              value={form.about}
              onChange={(value) => set('about')(value)}
              onPaste={handleDescriptionPaste}
              placeholder="Add notes, context, rates… or paste a screenshot to attach it."
              minRows={4}
            />
          </section>

          {/* Images */}
          <section>
            <GroupLabel icon={<IconPhoto size={13} />}>Images</GroupLabel>
            <FileButton
              multiple
              accept="image/*"
              resetRef={resetFileRef}
              onChange={(files) => {
                resetFileRef.current?.();
                if (files && files.length > 0) void addImageFiles(files);
              }}
            >
              {(btnProps) => (
                <div
                  {...btnProps}
                  role="button"
                  tabIndex={0}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files.length) {
                      void addImageFiles(Array.from(e.dataTransfer.files));
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-4 transition-colors ${
                    dragOver
                      ? 'border-border-focus bg-surface-secondary'
                      : 'border-border-strong hover:border-border-focus hover:bg-surface-secondary'
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-brand-primary">
                    <IconUpload size={19} />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {dragOver ? 'Drop image to attach' : 'Add images for this person'}
                    </div>
                    <div className="text-xs text-text-muted">
                      Click to browse, drag &amp; drop, or paste a screenshot above
                    </div>
                  </div>
                </div>
              )}
            </FileButton>

            {galleryImages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {galleryImages.map((img) => (
                  <div key={img.id} className="group relative">
                    <span
                      className="cursor-pointer"
                      onClick={() => setLightboxUrl(img.previewUrl)}
                    >
                      <Image
                        src={img.previewUrl}
                        alt="Contact image"
                        h={80}
                        w="auto"
                        radius="sm"
                        className="border border-border-primary transition-colors hover:border-brand-primary"
                      />
                    </span>
                    <ActionIcon
                      size="xs"
                      variant="filled"
                      color="red"
                      radius="xl"
                      className="absolute -right-1 -top-1 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove image"
                      loading={
                        img.persisted &&
                        removeScreenshot.isPending &&
                        removeScreenshot.variables?.screenshotId === img.id
                      }
                      onClick={() => removeImage(img.id, img.persisted)}
                    >
                      <IconX size={10} />
                    </ActionIcon>
                  </div>
                ))}
              </div>
            )}
          </section>
        </Drawer.Body>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle px-4 py-3">
          <EnrichContactButton contactId={contact.id} />
          <span className="text-xs text-text-muted">
            Changes aren&apos;t saved until you confirm.
          </span>
          <span className="flex-1" />
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={saving}>
            Save changes
          </Button>
        </div>
      </Drawer.Content>

      <Modal
        opened={!!lightboxUrl}
        onClose={() => setLightboxUrl(null)}
        size="auto"
        centered
        withCloseButton={false}
        padding={0}
      >
        {lightboxUrl && (
          <Image src={lightboxUrl} alt="Contact image" fit="contain" mah="80vh" />
        )}
      </Modal>
    </Drawer.Root>
  );
}
