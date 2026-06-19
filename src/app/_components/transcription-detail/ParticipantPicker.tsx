"use client";

import { Loader, Modal, ScrollArea, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconSearch, IconUserPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import {
  getAvatarColor,
  getColorSeed,
  getInitial,
  getTextColor,
} from "~/utils/avatarColors";

interface ParticipantPickerProps {
  opened: boolean;
  onClose: () => void;
  sessionId: string;
  workspaceId: string | null;
  /**
   * Lowercased identity keys already on the meeting — `user:<id>`,
   * `contact:<id>`, and `email:<addr>` — used to hide existing participants.
   */
  existing: Set<string>;
  /** Called after a successful add so the parent can refetch. */
  onAdded: () => void;
}

interface PickerItem {
  key: string;
  name: string;
  email: string | null;
  /** Sub-label, e.g. role or "Contact". */
  sub: string;
  /** Mutation payload identifying the person. */
  payload:
    | { userId: string }
    | { contactId: string }
    | { email?: string; name?: string };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ParticipantPicker({
  opened,
  onClose,
  sessionId,
  workspaceId,
  existing,
  onAdded,
}: ParticipantPickerProps) {
  const { workspace } = useWorkspace();
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  // Debounce the term sent to the server so we don't refetch on every keystroke.
  const [debouncedQuery] = useDebouncedValue(query.trim(), 200);

  // Search server-side (by name) so contacts beyond the first page are findable
  // — getAll defaults to 50 ordered by recency, which would otherwise hide the
  // long tail. Client-side filtering below still narrows the loaded rows further
  // and is the only filter for members (which come from the workspace context).
  const { data: contactsData, isLoading: contactsLoading } =
    api.crmContact.getAll.useQuery(
      {
        workspaceId: workspaceId ?? "",
        search: debouncedQuery || undefined,
        limit: 100,
      },
      { enabled: opened && !!workspaceId },
    );

  const addMutation = api.transcription.addParticipant.useMutation({
    onSuccess: () => {
      onAdded();
      // A free-text email may have inline-created a CRM contact; refresh the
      // contact list so it reflects reality for subsequent adds this session.
      void utils.crmContact.getAll.invalidate();
      setQuery("");
    },
    onError: (error) => {
      notifications.show({
        title: "Couldn't add participant",
        message: error.message,
        color: "red",
      });
    },
  });

  const members = useMemo<PickerItem[]>(() => {
    // Members come from the active workspace context. Only show them when that
    // matches the meeting's workspace — otherwise addParticipant would reject
    // them as non-members, so listing them would be misleading.
    const rows = workspace?.id === workspaceId ? (workspace?.members ?? []) : [];
    return rows
      .filter(
        (m) =>
          !existing.has(`user:${m.user.id}`) &&
          !(m.user.email && existing.has(`email:${m.user.email.toLowerCase()}`)),
      )
      .map((m) => ({
        key: `member-${m.userId}`,
        name: m.user.name ?? m.user.email ?? "Unknown",
        email: m.user.email,
        sub: m.role,
        payload: { userId: m.user.id },
      }));
  }, [workspace?.members, workspace?.id, workspaceId, existing]);

  const contacts = useMemo<PickerItem[]>(() => {
    const rows = contactsData?.contacts ?? [];
    return rows
      .filter(
        (c) =>
          !existing.has(`contact:${c.id}`) &&
          !(c.email && existing.has(`email:${c.email.toLowerCase()}`)),
      )
      .map((c) => ({
        key: `contact-${c.id}`,
        name:
          [c.firstName, c.lastName].filter(Boolean).join(" ") ||
          c.email ||
          "Unnamed contact",
        email: c.email,
        sub: "Contact",
        payload: { contactId: c.id },
      }));
  }, [contactsData?.contacts, existing]);

  const q = query.trim().toLowerCase();
  const matchItem = (i: PickerItem) =>
    !q ||
    i.name.toLowerCase().includes(q) ||
    (i.email?.toLowerCase().includes(q) ?? false);

  const filteredMembers = members.filter(matchItem);
  const filteredContacts = contacts.filter(matchItem);

  // Offer a free-text "add" when the query doesn't exactly match an existing
  // option. An email-looking query is added as an email (→ CRM contact on the
  // server); anything else is added as a name-only participant.
  const trimmed = query.trim();
  const exactMatch = [...filteredMembers, ...filteredContacts].some(
    (i) =>
      i.name.toLowerCase() === q || (i.email?.toLowerCase() ?? "") === q,
  );
  const showFreeText = trimmed.length > 0 && !exactMatch;
  const isEmail = EMAIL_RE.test(trimmed);

  const handleAdd = (payload: PickerItem["payload"]) => {
    addMutation.mutate({ transcriptionSessionId: sessionId, ...payload });
  };

  const handleFreeText = () => {
    if (isEmail) {
      handleAdd({ email: trimmed });
    } else {
      handleAdd({ name: trimmed });
    }
  };

  const noResults =
    filteredMembers.length === 0 &&
    filteredContacts.length === 0 &&
    !showFreeText;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add participant"
      centered
      size="md"
    >
      <TextInput
        placeholder="Search members and contacts, or type a name/email"
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        data-autofocus
        mb="sm"
      />

      <ScrollArea.Autosize mah={360} type="hover">
        {contactsLoading && (
          <div className="flex justify-center py-6">
            <Loader size="sm" />
          </div>
        )}

        {filteredMembers.length > 0 && (
          <PickerGroup
            label="Team members"
            items={filteredMembers}
            disabled={addMutation.isPending}
            onPick={handleAdd}
          />
        )}

        {filteredContacts.length > 0 && (
          <PickerGroup
            label="CRM contacts"
            items={filteredContacts}
            disabled={addMutation.isPending}
            onPick={handleAdd}
          />
        )}

        {showFreeText && (
          <button
            type="button"
            className="mdm-picker__freetext"
            onClick={handleFreeText}
            disabled={addMutation.isPending}
          >
            <span className="mdm-picker__freetext-icon">
              <IconUserPlus size={16} />
            </span>
            <span className="min-w-0">
              <span className="mdm-picker__name truncate">
                Add &ldquo;{trimmed}&rdquo;
              </span>
              <span className="mdm-picker__sub">
                {isEmail
                  ? "New contact — added to the CRM"
                  : "One-off participant (name only)"}
              </span>
            </span>
            <IconPlus size={14} className="mdm-picker__plus" />
          </button>
        )}

        {noResults && !contactsLoading && (
          <div className="mdm-picker__empty">No people found.</div>
        )}
      </ScrollArea.Autosize>
    </Modal>
  );
}

function PickerGroup({
  label,
  items,
  disabled,
  onPick,
}: {
  label: string;
  items: PickerItem[];
  disabled: boolean;
  onPick: (payload: PickerItem["payload"]) => void;
}) {
  return (
    <div className="mdm-picker__group">
      <div className="mdm-picker__group-label">{label}</div>
      {items.map((i) => {
        const seed = getColorSeed(i.name, i.email);
        const bg = getAvatarColor(seed);
        return (
          <button
            key={i.key}
            type="button"
            className="mdm-picker__row"
            onClick={() => onPick(i.payload)}
            disabled={disabled}
          >
            <span
              className="mdm-picker__avatar"
              style={{ backgroundColor: bg, color: getTextColor(bg) }}
            >
              {getInitial(i.name, i.email)}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="mdm-picker__name truncate">{i.name}</span>
              <span className="mdm-picker__sub truncate">
                {i.email ?? i.sub}
              </span>
            </span>
            <IconPlus size={14} className="mdm-picker__plus" />
          </button>
        );
      })}
    </div>
  );
}
