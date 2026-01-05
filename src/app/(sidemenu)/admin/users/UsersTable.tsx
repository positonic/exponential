"use client";

import { useState } from "react";
import {
  Table,
  Text,
  Title,
  Badge,
  Button,
  Group,
  Skeleton,
  Avatar,
  TextInput,
} from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useDebouncedValue } from "@mantine/hooks";

type UserStatus = "registered" | "onboarding" | "setup" | "active";

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function formatDate(date: Date | null): string {
  if (!date) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function StatusBadge({ status }: { status: UserStatus }) {
  const config: Record<UserStatus, { color: string; label: string }> = {
    registered: { color: "gray", label: "Registered" },
    onboarding: { color: "yellow", label: "Onboarding" },
    setup: { color: "blue", label: "Setup" },
    active: { color: "green", label: "Active" },
  };

  const { color, label } = config[status];

  return (
    <Badge variant="light" color={color} size="sm">
      {label}
    </Badge>
  );
}

function EngagementBadge({
  hasItems,
  count,
}: {
  hasItems: boolean;
  count: number;
}) {
  return (
    <Badge
      variant="light"
      color={hasItems ? "green" : "gray"}
      leftSection={hasItems ? <IconCheck size={12} /> : <IconX size={12} />}
    >
      {count}
    </Badge>
  );
}

export function UsersTable() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);

  const { data, isLoading } = api.admin.getAllUsers.useQuery({
    limit: 20,
    cursor: cursor ?? undefined,
    search: debouncedSearch || undefined,
  });

  const handleNext = () => {
    if (data?.nextCursor) {
      setCursorHistory((prev) => [...prev, cursor ?? ""]);
      setCursor(data.nextCursor);
    }
  };

  const handlePrev = () => {
    const newHistory = [...cursorHistory];
    const prevCursor = newHistory.pop();
    setCursorHistory(newHistory);
    setCursor(prevCursor === "" ? null : prevCursor ?? null);
  };

  // Reset pagination when search changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCursor(null);
    setCursorHistory([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <Title order={2} className="text-text-primary">
          Users
        </Title>
        <Text className="text-text-muted">
          View all registered users and their engagement
        </Text>
      </div>

      {/* Search */}
      <TextInput
        placeholder="Search by name or email..."
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => handleSearchChange(e.currentTarget.value)}
        className="max-w-md"
      />

      <div className="overflow-hidden rounded-lg border border-border-primary">
        <Table highlightOnHover>
          <Table.Thead className="bg-surface-secondary">
            <Table.Tr>
              <Table.Th className="text-text-muted">User</Table.Th>
              <Table.Th className="text-text-muted">Email</Table.Th>
              <Table.Th className="text-text-muted">Status</Table.Th>
              <Table.Th className="text-text-muted">Last Login</Table.Th>
              <Table.Th className="text-text-muted">Actions</Table.Th>
              <Table.Th className="text-text-muted">Projects</Table.Th>
              <Table.Th className="text-text-muted">Role</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  <Table.Td>
                    <Group gap="sm">
                      <Skeleton circle height={32} />
                      <Skeleton height={20} width={100} />
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={150} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={70} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={80} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={50} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={50} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={60} />
                  </Table.Td>
                </Table.Tr>
              ))
            ) : data?.users.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7} className="text-center text-text-muted">
                  No users found
                </Table.Td>
              </Table.Tr>
            ) : (
              data?.users.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Group gap="sm">
                      <Avatar
                        src={user.image}
                        alt={user.name ?? ""}
                        size="sm"
                        radius="xl"
                      />
                      <Text size="sm" className="text-text-primary">
                        {user.name ?? "—"}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className="text-text-secondary">
                      {user.email ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge status={user.status} />
                  </Table.Td>
                  <Table.Td>
                    <Text
                      size="sm"
                      className="text-text-muted"
                      title={formatDate(user.lastLogin)}
                    >
                      {formatRelativeTime(user.lastLogin)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <EngagementBadge
                      hasItems={user.hasActions}
                      count={user.actionCount}
                    />
                  </Table.Td>
                  <Table.Td>
                    <EngagementBadge
                      hasItems={user.hasProjects}
                      count={user.projectCount}
                    />
                  </Table.Td>
                  <Table.Td>
                    {user.isAdmin ? (
                      <Badge variant="filled" color="blue" size="sm">
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="light" color="gray" size="sm">
                        User
                      </Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </div>

      <Group justify="space-between">
        <Button
          variant="subtle"
          leftSection={<IconChevronLeft size={16} />}
          disabled={cursorHistory.length === 0}
          onClick={handlePrev}
        >
          Previous
        </Button>
        <Button
          variant="subtle"
          rightSection={<IconChevronRight size={16} />}
          disabled={!data?.nextCursor}
          onClick={handleNext}
        >
          Next
        </Button>
      </Group>
    </div>
  );
}
