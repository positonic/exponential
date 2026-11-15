'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Group,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconPencil, IconTrash, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { checkHandle, HANDLE_MAX_LENGTH } from '~/lib/personHandle';
import { personHref } from '~/lib/personHref';
import { api } from '~/trpc/react';

interface HandleFieldProps {
  /** The handle the person holds today, or `null` when they have none. */
  handle: string | null;
}

/**
 * The opt-in handle for your Person page link (`/people/<handle>`): set it,
 * change it, or remove it. The rules are previewed here as you type and
 * enforced by `user.setHandle`, whose "taken" answer is shown under the field.
 */
export function HandleField({ handle }: HandleFieldProps) {
  const utils = api.useUtils();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const setHandle = api.user.setHandle.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.user.getProfile.invalidate(),
        utils.person.get.invalidate(),
      ]);
      setIsEditing(false);
      notifications.show({
        title: result.handle ? 'Handle saved' : 'Handle removed',
        message: result.handle
          ? `Your page is now at /people/${result.handle}.`
          : 'Your page is back on its original link.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      // A refusal always carries its own wording; an empty message is some
      // other failure, which gets the general one.
      const message =
        error.message.length > 0
          ? error.message
          : 'Could not save your handle. Please try again.';
      // Saving shows the refusal under the field; removing has no field open.
      if (isEditing) setServerError(message);
      else notifications.show({ title: 'Error', message, color: 'red' });
    },
  });

  const check = checkHandle(draft);
  const draftError =
    draft.trim() === '' || check.ok ? null : check.message;

  const startEditing = () => {
    setDraft(handle ?? '');
    setServerError(null);
    setIsEditing(true);
  };

  const save = () => {
    if (!check.ok) return;
    setHandle.mutate({ handle: check.handle });
  };

  return (
    <div>
      <Text size="xs" className="text-text-muted mb-1">
        Handle
      </Text>
      {isEditing ? (
        <Group gap="xs" align="flex-start">
          <TextInput
            value={draft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setServerError(null);
            }}
            maxLength={HANDLE_MAX_LENGTH}
            autoFocus
            className="flex-1"
            leftSection={
              <Text size="sm" className="text-text-muted">
                /people/
              </Text>
            }
            leftSectionWidth={72}
            placeholder="your-name"
            error={draftError ?? serverError}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
              if (event.key === 'Escape') setIsEditing(false);
            }}
            aria-label="Handle"
            data-testid="handle-input"
          />
          <ActionIcon
            variant="filled"
            color="brand"
            size="lg"
            onClick={save}
            loading={setHandle.isPending}
            disabled={!check.ok}
            aria-label="Save handle"
            data-testid="handle-save"
          >
            <IconCheck size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={() => setIsEditing(false)}
            disabled={setHandle.isPending}
            aria-label="Cancel editing handle"
          >
            <IconX size={16} />
          </ActionIcon>
        </Group>
      ) : (
        <Group gap="xs">
          {handle ? (
            <Anchor
              component={Link}
              href={personHref(handle)}
              className="text-text-primary"
              data-testid="handle-value"
            >
              /people/{handle}
            </Anchor>
          ) : (
            <Text className="text-text-secondary" data-testid="handle-value">
              Not set
            </Text>
          )}
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={startEditing}
            aria-label={handle ? 'Change handle' : 'Set handle'}
            data-testid="handle-edit"
          >
            <IconPencil size={16} />
          </ActionIcon>
          {handle && (
            <Tooltip label="Remove handle">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => setHandle.mutate({ handle: null })}
                loading={setHandle.isPending}
                aria-label="Remove handle"
                data-testid="handle-remove"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      )}
      {!isEditing && !handle && (
        <Text size="xs" className="text-text-muted mt-1">
          Pick a short name for your page link, like /people/your-name. Letters,
          digits and hyphens, 3 to 30 characters.
        </Text>
      )}
    </div>
  );
}
