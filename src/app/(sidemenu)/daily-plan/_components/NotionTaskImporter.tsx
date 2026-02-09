"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  Stack,
  Text,
  Button,
  Checkbox,
  Group,
  Badge,
  Loader,
  Alert,
} from "@mantine/core";
import { IconBrandNotion, IconAlertCircle, IconArrowLeft } from "@tabler/icons-react";
import { format } from "date-fns";
import { api } from "~/trpc/react";

interface NotionPage {
  id: string;
  title: string;
  url: string;
  status?: string;
  dueDate?: string;
  properties: Record<string, any>;
  created_time: string;
  last_edited_time: string;
}

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
}

interface NotionTaskImporterProps {
  opened: boolean;
  onClose: () => void;
  planDate: Date;
  dailyPlanId: string;
  onImported: () => void;
}

function formatDueDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return format(date, "MMM d");
  } catch {
    return dateString;
  }
}

export function NotionTaskImporter({
  opened,
  onClose,
  planDate,
  dailyPlanId,
  onImported,
}: NotionTaskImporterProps) {
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // Get integrations
  const { data: integrations = [], isLoading: integrationsLoading } =
    api.integration.listIntegrations.useQuery();

  // Find active Notion integration
  const notionIntegration = integrations.find(
    (int) => int.provider === "notion" && int.status === "ACTIVE"
  );

  // Test connection and get databases
  const testConnection = api.integration.testConnection.useMutation();

  // Get database pages
  const getDatabasePages = api.integration.getNotionDatabasePages.useMutation();

  // Add task mutation
  const addTaskMutation = api.dailyPlan.addTask.useMutation();

  // Fetch databases when modal opens and integration exists
  useEffect(() => {
    if (opened && notionIntegration && !testConnection.data) {
      testConnection.mutate({ integrationId: notionIntegration.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, notionIntegration]);

  // Fetch pages when database is selected
  useEffect(() => {
    if (selectedDatabase && notionIntegration) {
      getDatabasePages.mutate({
        integrationId: notionIntegration.id,
        databaseId: selectedDatabase,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatabase, notionIntegration]);

  // Reset state when modal closes
  useEffect(() => {
    if (!opened) {
      setSelectedDatabase(null);
      setSelectedPages(new Set());
    }
  }, [opened]);

  const handleTogglePage = (pageId: string) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!getDatabasePages.data?.pages) return;
    if (selectedPages.size === getDatabasePages.data.pages.length) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(
        new Set(getDatabasePages.data.pages.map((p: NotionPage) => p.id))
      );
    }
  };

  const handleImport = async () => {
    if (!getDatabasePages.data?.pages || selectedPages.size === 0) return;

    setIsImporting(true);
    try {
      const pagesToImport = getDatabasePages.data.pages.filter((p: NotionPage) =>
        selectedPages.has(p.id)
      );

      for (const page of pagesToImport) {
        await addTaskMutation.mutateAsync({
          dailyPlanId,
          name: page.title,
          duration: 60, // Default 1 hour
          source: "notion",
          sourceId: page.id,
        });
      }

      setSelectedPages(new Set());
      setSelectedDatabase(null);
      onImported();
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

  const handleBackToDatabases = () => {
    setSelectedDatabase(null);
    setSelectedPages(new Set());
  };

  const isLoading = integrationsLoading || testConnection.isPending;
  const databases: NotionDatabase[] = testConnection.data?.databases ?? [];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconBrandNotion size={20} className="text-text-primary" />
          <Text fw={600}>Import from Notion</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader size="md" />
          </div>
        )}

        {!isLoading && !notionIntegration && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Notion not connected"
            color="yellow"
          >
            <Stack gap="sm">
              <Text size="sm">
                Connect your Notion workspace to import pages as tasks.
              </Text>
              <Button
                component="a"
                href="/api/auth/notion/authorize?returnUrl=/daily-plan"
                variant="filled"
                size="sm"
              >
                Connect Notion
              </Button>
            </Stack>
          </Alert>
        )}

        {!isLoading && notionIntegration && !selectedDatabase && (
          <>
            <Text size="sm" c="dimmed">
              Select a database to view its pages
            </Text>

            {databases.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                No databases found. Make sure your Notion integration has access to
                databases.
              </Text>
            ) : (
              <Stack gap="xs">
                {databases.map((db) => (
                  <div
                    key={db.id}
                    onClick={() => setSelectedDatabase(db.id)}
                    className="cursor-pointer rounded-md border border-border-primary p-3 hover:bg-surface-hover"
                  >
                    <Text fw={500} className="text-text-primary">
                      {db.title}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Click to view pages
                    </Text>
                  </div>
                ))}
              </Stack>
            )}
          </>
        )}

        {!isLoading && notionIntegration && selectedDatabase && (
          <>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconArrowLeft size={14} />}
              onClick={handleBackToDatabases}
            >
              Back to databases
            </Button>

            {getDatabasePages.isPending && (
              <div className="flex justify-center py-8">
                <Loader size="md" />
              </div>
            )}

            {!getDatabasePages.isPending && getDatabasePages.data && (
              <>
                <Group justify="space-between" align="center">
                  <Text size="sm" c="dimmed">
                    {format(planDate, "EEEE, MMM d")}
                  </Text>
                  {getDatabasePages.data.pages.length > 0 && (
                    <Button variant="subtle" size="xs" onClick={handleSelectAll}>
                      {selectedPages.size === getDatabasePages.data.pages.length
                        ? "Deselect all"
                        : "Select all"}
                    </Button>
                  )}
                </Group>

                {getDatabasePages.data.pages.length === 0 ? (
                  <Text c="dimmed" ta="center" py="xl">
                    No pages found in this database.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {getDatabasePages.data.pages.map((page: NotionPage) => (
                      <div
                        key={page.id}
                        className="flex items-start gap-3 rounded-md border border-border-primary p-3 hover:bg-surface-hover cursor-pointer"
                        onClick={() => handleTogglePage(page.id)}
                      >
                        <Checkbox
                          checked={selectedPages.has(page.id)}
                          onChange={() => handleTogglePage(page.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Stack gap={2} flex={1}>
                          <Text size="sm" fw={500} className="text-text-primary">
                            {page.title}
                          </Text>
                          <Group gap="xs">
                            {page.status && (
                              <Badge size="xs" variant="light">
                                {page.status}
                              </Badge>
                            )}
                            {page.dueDate && (
                              <Text size="xs" c="dimmed">
                                Due: {formatDueDate(page.dueDate)}
                              </Text>
                            )}
                          </Group>
                        </Stack>
                      </div>
                    ))}
                  </Stack>
                )}

                {getDatabasePages.data.pages.length > 0 && (
                  <Button
                    onClick={() => void handleImport()}
                    disabled={selectedPages.size === 0 || isImporting}
                    loading={isImporting}
                    fullWidth
                  >
                    Import {selectedPages.size} page
                    {selectedPages.size !== 1 ? "s" : ""}
                  </Button>
                )}
              </>
            )}

            {getDatabasePages.isError && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Error loading pages"
                color="red"
              >
                <Text size="sm">
                  Failed to load pages from this database. Please try again or select
                  a different database.
                </Text>
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
