"use client";

import {
  Avatar,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconPlus,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { getInitial } from "~/utils/avatarColors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Theme-aware avatar tints — Mantine palette names (never hardcoded colors), so
// a contact keeps a stable tint that adapts to light/dark mode.
const AVATAR_COLORS = [
  "blue",
  "grape",
  "teal",
  "orange",
  "cyan",
  "pink",
  "lime",
  "violet",
] as const;

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

/**
 * A participant the user picked or created in the picker, not necessarily
 * persisted yet. `payload` is exactly what `transcription.addParticipant` and
 * `createManualTranscription` accept; `name`/`email` drive the display. The
 * picker is selection-only — the parent decides whether to persist immediately
 * (meeting detail page) or stage it for an atomic save (create-meeting modal).
 */
export interface PendingParticipant {
  /** Stable identity key — `user:<id>`, `contact:<id>`, or `email:<addr>` — for
   *  deduping a pending list and hiding people already on the meeting. */
  key: string;
  name: string;
  email: string;
  /** How the person was picked. `member` participants link to a workspace User,
   *  so callers can style their chips distinctly. */
  kind: "member" | "contact" | "new";
  payload:
    | { userId: string }
    | { contactId: string; email?: string }
    | { email: string; name?: string };
}

interface ParticipantPickerProps {
  opened: boolean;
  onClose: () => void;
  /** The meeting's workspace. Members and CRM contacts are workspace-scoped, so
   *  the picker is inert without one. */
  workspaceId: string | null;
  /** Identity keys already on the meeting (`user:<id>`, `contact:<id>`, and
   *  lowercased `email:<addr>`) so existing participants are hidden. */
  existing: Set<string>;
  /** Emitted when the user links a member/contact or adds a new person. */
  onAdd: (participant: PendingParticipant) => void;
  /** Disables interaction while the parent persists an add. */
  busy?: boolean;
}

type Capture =
  | { kind: "contact"; contactId: string; name: string; email: string }
  | { kind: "new"; name: string; email: string };

export function ParticipantPicker({
  opened,
  onClose,
  workspaceId,
  existing,
  onAdd,
  busy = false,
}: ParticipantPickerProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Email-capture sub-form: shown for a brand-new person, or an existing
  // contact that has no email on file (captured + written back server-side).
  const [capture, setCapture] = useState<Capture | null>(null);

  // Debounce the contact search so we don't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Workspace team members. Sourced by workspaceId (not the route's workspace
  // context) so the picker works on the /recording/[id] detail page too, which
  // is not mounted under a /w/[slug] route. The server already resolves a
  // `{ userId }` payload against workspace membership.
  const { data: membersData, isLoading: membersLoading } =
    api.action.getAssignableUsersForContext.useQuery(
      { workspaceId: workspaceId ?? undefined },
      { enabled: opened && !!workspaceId },
    );

  const { data, isLoading: contactsLoading } = api.crmContact.getAll.useQuery(
    {
      workspaceId: workspaceId ?? "",
      search: debouncedQuery || undefined,
      limit: 20,
    },
    { enabled: opened && !!workspaceId },
  );

  const members = useMemo(() => {
    const rows = membersData?.assignableUsers ?? [];
    return rows
      // A participant row requires an email (the server copies it from the
      // user), so members without one can't be added — hide them.
      .filter((u): u is typeof u & { email: string } => !!u.email)
      .filter(
        (u) =>
          !existing.has(`user:${u.id}`) &&
          !existing.has(`email:${u.email.toLowerCase()}`),
      )
      .map((u) => ({
        id: u.id,
        name: u.name ?? u.email,
        email: u.email,
        image: u.image,
      }));
  }, [membersData?.assignableUsers, existing]);

  // Emails already claimed by a member, so the same person doesn't appear again
  // under CRM contacts.
  const memberEmails = useMemo(
    () => new Set(members.map((m) => m.email.toLowerCase())),
    [members],
  );

  const contacts = useMemo(() => {
    const rows = data?.contacts ?? [];
    return rows
      .map((c) => ({
        id: c.id,
        name:
          [c.firstName, c.lastName].filter(Boolean).join(" ") ||
          c.email ||
          "Unnamed contact",
        email: c.email ?? null,
      }))
      .filter(
        (c) =>
          !existing.has(`contact:${c.id}`) &&
          !(c.email && existing.has(`email:${c.email.toLowerCase()}`)) &&
          !(c.email && memberEmails.has(c.email.toLowerCase())),
      );
  }, [data?.contacts, existing, memberEmails]);

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const isEmail = EMAIL_RE.test(trimmed);
  // Members come from workspace context (not a server search), so filter them
  // client-side by the same query text used for the contact search.
  const filteredMembers = useMemo(
    () =>
      members.filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      ),
    [members, q],
  );

  // Offer "add new" only when the search doesn't already name an existing,
  // not-yet-added member or contact.
  const exactMatch =
    filteredMembers.some(
      (m) => m.name.toLowerCase() === q || m.email.toLowerCase() === q,
    ) ||
    contacts.some(
      (c) => c.name.toLowerCase() === q || (c.email?.toLowerCase() ?? "") === q,
    );
  const showAddNew = trimmed.length > 0 && !exactMatch;
  const isLoading = membersLoading || contactsLoading;

  function resetAndClose() {
    setQuery("");
    setCapture(null);
    onClose();
  }

  function emit(participant: PendingParticipant) {
    onAdd(participant);
    setQuery("");
    setCapture(null);
  }

  function pickMember(m: { id: string; name: string; email: string }) {
    emit({
      key: `user:${m.id}`,
      name: m.name,
      email: m.email,
      kind: "member",
      payload: { userId: m.id },
    });
  }

  function pickContact(c: { id: string; name: string; email: string | null }) {
    if (c.email) {
      emit({
        key: `contact:${c.id}`,
        name: c.name,
        email: c.email,
        kind: "contact",
        payload: { contactId: c.id },
      });
    } else {
      // No email on file — capture one so the participant carries a required,
      // unique email and the contact record improves everywhere.
      setCapture({ kind: "contact", contactId: c.id, name: c.name, email: "" });
    }
  }

  function startNew() {
    setCapture({
      kind: "new",
      name: isEmail ? "" : trimmed,
      email: isEmail ? trimmed : "",
    });
  }

  const captureEmail = capture?.email.trim() ?? "";
  const captureValid = EMAIL_RE.test(captureEmail);

  function submitCapture() {
    if (!capture || !captureValid) return;
    if (capture.kind === "contact") {
      emit({
        key: `contact:${capture.contactId}`,
        name: capture.name,
        email: captureEmail,
        kind: "contact",
        payload: { contactId: capture.contactId, email: captureEmail },
      });
    } else {
      const name = capture.name.trim();
      emit({
        key: `email:${captureEmail.toLowerCase()}`,
        name: name || captureEmail,
        email: captureEmail,
        kind: "new",
        payload: { email: captureEmail, name: name || undefined },
      });
    }
  }

  const hasResults = filteredMembers.length > 0 || contacts.length > 0;

  return (
    <Modal
      opened={opened}
      onClose={resetAndClose}
      title="Add participant"
      centered
      size="md"
    >
      {capture ? (
        <Stack gap="sm">
          <Group gap="xs" wrap="nowrap">
            <UnstyledButton
              onClick={() => setCapture(null)}
              aria-label="Back to search"
            >
              <IconArrowLeft size={16} />
            </UnstyledButton>
            <Text fw={600} size="sm">
              {capture.kind === "contact"
                ? `Add an email for ${capture.name}`
                : "Add a new participant"}
            </Text>
          </Group>

          {capture.kind === "contact" ? (
            <Text size="xs" c="dimmed">
              {capture.name} has no email on file. Adding one links them to this
              meeting and saves the email back onto their contact.
            </Text>
          ) : (
            <TextInput
              label="Name"
              placeholder="Full name"
              value={capture.name}
              onChange={(e) =>
                setCapture({ ...capture, name: e.currentTarget.value })
              }
            />
          )}

          <TextInput
            label="Email"
            placeholder="name@company.com"
            required
            type="email"
            data-autofocus
            value={capture.email}
            onChange={(e) =>
              setCapture({ ...capture, email: e.currentTarget.value })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && captureValid) submitCapture();
            }}
            error={
              captureEmail.length > 0 && !captureValid
                ? "Enter a valid email"
                : undefined
            }
          />

          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" onClick={() => setCapture(null)}>
              Back
            </Button>
            <Button
              onClick={submitCapture}
              disabled={!captureValid || busy}
              leftSection={<IconPlus size={14} />}
            >
              Add participant
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          <TextInput
            placeholder="Search teammates and contacts, or type a new email"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            data-autofocus
            disabled={!workspaceId}
          />

          <ScrollArea.Autosize mah={360} type="hover">
            <Stack gap={4}>
              {isLoading && (
                <Group justify="center" py="md">
                  <Loader size="sm" />
                </Group>
              )}

              {filteredMembers.length > 0 && (
                <>
                  <Text
                    size="xs"
                    fw={600}
                    c="dimmed"
                    tt="uppercase"
                    px={2}
                    pt={4}
                  >
                    Team members
                  </Text>
                  {filteredMembers.map((m) => (
                    <UnstyledButton
                      key={m.id}
                      onClick={() => pickMember(m)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover disabled:opacity-50"
                    >
                      <Avatar
                        radius="xl"
                        size="sm"
                        src={m.image ?? undefined}
                        color={avatarColor(m.id)}
                      >
                        {getInitial(m.name, m.email)}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Text size="sm" truncate>
                          {m.name}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {m.email}
                        </Text>
                      </div>
                      <IconPlus size={14} />
                    </UnstyledButton>
                  ))}
                </>
              )}

              {contacts.length > 0 && (
                <>
                  {filteredMembers.length > 0 && (
                    <Text
                      size="xs"
                      fw={600}
                      c="dimmed"
                      tt="uppercase"
                      px={2}
                      pt={4}
                    >
                      CRM contacts
                    </Text>
                  )}
                  {contacts.map((c) => (
                    <UnstyledButton
                      key={c.id}
                      onClick={() => pickContact(c)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover disabled:opacity-50"
                    >
                      <Avatar radius="xl" size="sm" color={avatarColor(c.id)}>
                        {getInitial(c.name, c.email)}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Text size="sm" truncate>
                          {c.name}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {c.email ?? "No email on file"}
                        </Text>
                      </div>
                      <IconPlus size={14} />
                    </UnstyledButton>
                  ))}
                </>
              )}

              {showAddNew && (
                <UnstyledButton
                  onClick={startNew}
                  disabled={busy}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover disabled:opacity-50"
                >
                  <Avatar radius="xl" size="sm" color="gray">
                    <IconUserPlus size={16} />
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Text size="sm" truncate>
                      Add &ldquo;{trimmed}&rdquo;
                    </Text>
                    <Text size="xs" c="dimmed">
                      {isEmail
                        ? "New contact — added to the CRM"
                        : "New participant — add their email next"}
                    </Text>
                  </div>
                  <IconPlus size={14} />
                </UnstyledButton>
              )}

              {!isLoading && !hasResults && !showAddNew && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  {workspaceId
                    ? "No people found. Type a name or email to add someone."
                    : "This meeting has no workspace, so participants can't be managed."}
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      )}
    </Modal>
  );
}
