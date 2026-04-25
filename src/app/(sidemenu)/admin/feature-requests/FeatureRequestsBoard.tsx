"use client";

import { useState } from "react";
import {
  Card,
  Text,
  Title,
  Badge,
  Group,
  Stack,
  Button,
  Modal,
  Select,
  Skeleton,
  ScrollArea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconStar, IconRefresh } from "@tabler/icons-react";
import { api } from "~/trpc/react";

type FeatureRequestStatus = "open" | "planned" | "in_progress" | "done" | "wont_fix";

const STATUS_CONFIG: Record<
  FeatureRequestStatus,
  { label: string; color: string }
> = {
  open: { label: "Open", color: "blue" },
  planned: { label: "Planned", color: "violet" },
  in_progress: { label: "In Progress", color: "yellow" },
  done: { label: "Done", color: "green" },
  wont_fix: { label: "Won't Fix", color: "gray" },
};

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  priority: number;
  status: string;
  feedbackCount: number;
  avgRating: number | null;
  createdAt: Date;
}

function FeatureCard({
  request,
  onStatusChange: _onStatusChange,
  onClick,
}: {
  request: FeatureRequest;
  onStatusChange: (id: string, status: FeatureRequestStatus) => void;
  onClick: () => void;
}) {
  const statusConfig = STATUS_CONFIG[request.status as FeatureRequestStatus] ?? STATUS_CONFIG.open;

  return (
    <Card
      className="cursor-pointer border border-border-primary bg-background-primary transition-all hover:border-border-focus"
      onClick={onClick}
    >
      <Group justify="space-between" mb="xs">
        <Badge color={statusConfig.color} size="sm">
          {statusConfig.label}
        </Badge>
        <Group gap={4}>
          <IconStar size={12} className="text-yellow-500" />
          <Text size="xs" className="text-text-muted">
            {request.avgRating?.toFixed(1) ?? "—"}
          </Text>
        </Group>
      </Group>

      <Text size="sm" className="font-medium text-text-primary" lineClamp={2}>
        {request.title}
      </Text>

      <Text size="xs" className="mt-1 text-text-muted" lineClamp={2}>
        {request.description}
      </Text>

      <Group justify="space-between" mt="sm">
        <Text size="xs" className="text-text-muted">
          {request.feedbackCount} feedback{request.feedbackCount !== 1 ? "s" : ""}
        </Text>
        <Text size="xs" className="text-text-muted">
          Priority: {request.priority}
        </Text>
      </Group>
    </Card>
  );
}

function StatusColumn({
  status,
  requests,
  isLoading,
  onStatusChange,
  onCardClick,
}: {
  status: FeatureRequestStatus;
  requests: FeatureRequest[];
  isLoading: boolean;
  onStatusChange: (id: string, status: FeatureRequestStatus) => void;
  onCardClick: (request: FeatureRequest) => void;
}) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex h-full min-w-[280px] flex-col">
      <Group gap="xs" mb="md">
        <Badge color={config.color} variant="light" size="lg">
          {config.label}
        </Badge>
        <Text size="sm" className="text-text-muted">
          ({requests.length})
        </Text>
      </Group>

      <ScrollArea className="flex-1">
        <Stack gap="sm">
          {isLoading ? (
            <>
              <Skeleton height={120} />
              <Skeleton height={120} />
            </>
          ) : requests.length === 0 ? (
            <Text size="sm" className="text-text-muted">
              No items
            </Text>
          ) : (
            requests.map((request) => (
              <FeatureCard
                key={request.id}
                request={request}
                onStatusChange={onStatusChange}
                onClick={() => onCardClick(request)}
              />
            ))
          )}
        </Stack>
      </ScrollArea>
    </div>
  );
}

export function FeatureRequestsBoard() {
  const [selectedRequest, setSelectedRequest] = useState<FeatureRequest | null>(
    null
  );
  const [opened, { open, close }] = useDisclosure(false);

  const utils = api.useUtils();

  const { data, isLoading } = api.featureRequest.getAll.useQuery({ limit: 100 });

  const updateStatus = api.featureRequest.updateStatus.useMutation({
    onSuccess: () => {
      void utils.featureRequest.getAll.invalidate();
    },
  });

  const recalculatePriorities =
    api.featureRequest.recalculatePriorities.useMutation({
      onSuccess: () => {
        void utils.featureRequest.getAll.invalidate();
      },
    });

  const handleStatusChange = (id: string, status: FeatureRequestStatus) => {
    updateStatus.mutate({ id, status });
  };

  const handleCardClick = (request: FeatureRequest) => {
    setSelectedRequest(request);
    open();
  };

  const requestsByStatus = (status: FeatureRequestStatus) =>
    (data?.requests ?? []).filter((r) => r.status === status);

  return (
    <div className="flex h-full flex-col">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2} className="text-text-primary">
            Feature Requests
          </Title>
          <Text className="text-text-muted">
            Track and prioritize improvement suggestions
          </Text>
        </div>
        <Button
          variant="subtle"
          leftSection={<IconRefresh size={16} />}
          onClick={() => recalculatePriorities.mutate()}
          loading={recalculatePriorities.isPending}
        >
          Recalculate Priorities
        </Button>
      </Group>

      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        <StatusColumn
          status="open"
          requests={requestsByStatus("open")}
          isLoading={isLoading}
          onStatusChange={handleStatusChange}
          onCardClick={handleCardClick}
        />
        <StatusColumn
          status="planned"
          requests={requestsByStatus("planned")}
          isLoading={isLoading}
          onStatusChange={handleStatusChange}
          onCardClick={handleCardClick}
        />
        <StatusColumn
          status="in_progress"
          requests={requestsByStatus("in_progress")}
          isLoading={isLoading}
          onStatusChange={handleStatusChange}
          onCardClick={handleCardClick}
        />
        <StatusColumn
          status="done"
          requests={requestsByStatus("done")}
          isLoading={isLoading}
          onStatusChange={handleStatusChange}
          onCardClick={handleCardClick}
        />
      </div>

      <Modal
        opened={opened}
        onClose={close}
        title="Feature Request Details"
        size="lg"
      >
        {selectedRequest && (
          <Stack gap="md">
            <div>
              <Text size="sm" className="font-medium text-text-muted">
                Title
              </Text>
              <Text className="text-text-primary">{selectedRequest.title}</Text>
            </div>

            <div>
              <Text size="sm" className="font-medium text-text-muted">
                Description
              </Text>
              <Text className="whitespace-pre-wrap text-text-primary">
                {selectedRequest.description}
              </Text>
            </div>

            <Group>
              <div>
                <Text size="sm" className="font-medium text-text-muted">
                  Feedback Count
                </Text>
                <Text className="text-text-primary">
                  {selectedRequest.feedbackCount}
                </Text>
              </div>
              <div>
                <Text size="sm" className="font-medium text-text-muted">
                  Avg Rating
                </Text>
                <Text className="text-text-primary">
                  {selectedRequest.avgRating?.toFixed(1) ?? "—"}
                </Text>
              </div>
              <div>
                <Text size="sm" className="font-medium text-text-muted">
                  Priority
                </Text>
                <Text className="text-text-primary">
                  {selectedRequest.priority}
                </Text>
              </div>
            </Group>

            <div>
              <Text size="sm" className="mb-2 font-medium text-text-muted">
                Change Status
              </Text>
              <Select
                value={selectedRequest.status}
                onChange={(value) => {
                  if (value) {
                    handleStatusChange(
                      selectedRequest.id,
                      value as FeatureRequestStatus
                    );
                    setSelectedRequest({ ...selectedRequest, status: value });
                  }
                }}
                data={Object.entries(STATUS_CONFIG).map(([key, config]) => ({
                  value: key,
                  label: config.label,
                }))}
              />
            </div>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
