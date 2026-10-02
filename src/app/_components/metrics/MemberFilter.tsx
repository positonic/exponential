'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Avatar, Group, MultiSelect, Text } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { api } from '~/trpc/react';

const PARAM = 'members';

/**
 * The Metrics page's member filter, kept in the URL (`?members=id1,id2`) so a
 * filtered view can be shared or bookmarked. Empty = the whole workspace.
 */
export function useMemberFilter(): [string[], (ids: string[]) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const memberIds = useMemo(
    () => searchParams.get(PARAM)?.split(',').filter(Boolean) ?? [],
    [searchParams],
  );

  const setMemberIds = useCallback(
    (ids: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (ids.length > 0) params.set(PARAM, ids.join(','));
      else params.delete(PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [searchParams, router, pathname],
  );

  return [memberIds, setMemberIds];
}

export function MemberFilter({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: members } = api.workspace.listMembers.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  // Same query (and cache entry) as the all-cycles Contributors table — it
  // knows former members who still hold assigned tickets or logged time.
  const { data: contributions } = api.sprintAnalytics.getContributions.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const options = useMemo(() => {
    const list = (members ?? []).map((m) => ({
      value: m.id,
      label: m.name ?? m.email ?? 'Unknown',
      image: m.image,
    }));
    const known = new Set(list.map((o) => o.value));
    // A former member can be ticked in the Contributors table, so they need an
    // option here too — otherwise the selection is invisible and unremovable.
    for (const row of contributions?.rows ?? []) {
      if (row.userId == null || known.has(row.userId)) continue;
      known.add(row.userId);
      list.push({
        value: row.userId,
        label: `${row.name ?? row.email ?? 'Unknown'} (former member)`,
        image: row.image,
      });
    }
    // Last resort for an id in a shared URL we can't name: still removable.
    for (const id of value) {
      if (!known.has(id)) list.push({ value: id, label: 'Unknown member', image: null });
    }
    return list;
  }, [members, contributions, value]);
  const imageById = useMemo(
    () => new Map(options.map((o) => [o.value, o.image])),
    [options],
  );

  return (
    <MultiSelect
      aria-label="Filter by member"
      data={options}
      value={value}
      onChange={onChange}
      placeholder={value.length === 0 ? 'All members' : undefined}
      leftSection={<IconUsers size={16} />}
      searchable
      clearable
      nothingFoundMessage="No members found"
      checkIconPosition="right"
      w={{ base: '100%', sm: 320 }}
      size="sm"
      renderOption={({ option }) => (
        <Group gap="xs" wrap="nowrap">
          <Avatar src={imageById.get(option.value)} size={20} radius="xl">
            {option.label[0]?.toUpperCase()}
          </Avatar>
          <Text size="sm">{option.label}</Text>
        </Group>
      )}
    />
  );
}
