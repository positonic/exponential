"use client";

import { Fragment, useState } from "react";
import { api } from "~/trpc/react";
import { Select, Text, Group, Progress, Title, Container, ScrollArea } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { type RouterOutputs } from "~/trpc/react";
import { ActionsList } from "./actions/ActionsList";
import Link from "next/link";

type Project = RouterOutputs["project"]["getActiveWithDetails"][0];

interface OneOnOneBoardProps {
  userId?: string;
  teamId?: string;
  userName?: string;
  isSharedView?: boolean;
  workspaceId?: string;
}

// Rendered in the dedicated Tasks column on wide screens, and on a second
// line under the project name once that column is hidden (below xl).
function TaskProgressSummary({ project, completionPercentage }: { project: Project; completionPercentage: number }) {
  const totalCount = project.actions?.length ?? 0;
  const completedCount = project.actions?.filter(
    (action) => action.status === "DONE" || action.kanbanStatus === "DONE"
  ).length ?? 0;

  return (
    <Group gap="xs" align="center" wrap="nowrap">
      <Text size="sm" className="text-text-secondary whitespace-nowrap">
        {completedCount}/{totalCount} completed
      </Text>
      <Progress
        value={completionPercentage}
        size="sm"
        style={{ width: 80 }}
        color={completionPercentage === 100 ? "green" : "blue"}
        className="bg-surface-secondary"
      />
      <Text size="xs" className="text-text-muted">
        {completionPercentage}%
      </Text>
    </Group>
  );
}

export function OneOnOneBoard({ userId, teamId, userName, isSharedView = false, workspaceId }: OneOnOneBoardProps) {
  // Use different API calls based on whether it's a shared view
  const { data: projects, isLoading } = isSharedView && userId && teamId
    ? api.project.getActiveWithDetailsForUser.useQuery({ userId, teamId })
    : api.project.getActiveWithDetails.useQuery({ workspaceId });
  
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const utils = api.useUtils();
  
  const updateProject = api.project.update.useMutation({
    onSuccess: () => {
      if (isSharedView && userId && teamId) {
        // Invalidate shared view queries
        void utils.project.getActiveWithDetailsForUser.invalidate({ userId, teamId });
      } else {
        // Invalidate personal view queries
        void utils.project.getActiveWithDetails.invalidate();
      }
    },
  });


  const statusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "ON_HOLD", label: "On Hold" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
  ];

  const priorityOptions = [
    { value: "HIGH", label: "High" },
    { value: "MEDIUM", label: "Medium" },
    { value: "LOW", label: "Low" },
    { value: "NONE", label: "None" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "green";
      case "ON_HOLD":
        return "yellow";
      case "COMPLETED":
        return "blue";
      case "CANCELLED":
        return "gray";
      default:
        return "gray";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return "red";
      case "MEDIUM":
        return "orange";
      case "LOW":
        return "cyan";
      case "1st Priority":
      case "2nd Priority":
      case "3rd Priority":
        return "blue";
      case "Quick":
        return "green";
      case "NONE":
      default:
        return "gray";
    }
  };

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const calculateCompletionPercentage = (project: Project) => {
    if (!project.actions || project.actions.length === 0) return 0;
    const completedTasks = project.actions.filter(action => 
      action.status === "DONE" || action.kanbanStatus === "DONE"
    ).length;
    return Math.round((completedTasks / project.actions.length) * 100);
  };

  if (isLoading) {
    return (
      <Container size="xl" py="xl">
        <Text>Loading...</Text>
      </Container>
    );
  }

  return (
    // w-full: the workspace layout is a column flexbox, and Container's auto
    // inline margins make it size to fit-content there — without an explicit
    // width the table's min-widths would push the whole page wider instead of
    // scrolling inside the ScrollArea.
    <Container size="xl" py="xl" className="w-full">
      <Title order={2} mb="xl" className="text-text-primary">
        {isSharedView && userName ? `${userName}'s Weekly Plan` : 'Weekly Plan'}
      </Title>
      
      <ScrollArea>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-left p-3 text-text-secondary font-medium text-sm w-10"></th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm min-w-[200px]">Project name</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm w-[140px] min-w-[140px]">Status</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm w-[140px] min-w-[140px]">Priority</th>
              <th className="hidden xl:table-cell text-left p-3 text-text-secondary font-medium text-sm w-[280px] min-w-[240px]">Tasks (read only)</th>
            </tr>
          </thead>
          <tbody>
            {projects?.map((project) => {
              const isExpanded = expandedProjects.has(project.id);
              const completionPercentage = calculateCompletionPercentage(project);
              
              return (
                <Fragment key={project.id}>
                  <tr className="border-b border-border-primary hover:bg-surface-hover transition-colors">
                    <td className="p-3">
                      <button
                        onClick={() => toggleProjectExpanded(project.id)}
                        className="text-text-secondary hover:text-text-primary transition-colors"
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? (
                          <IconChevronDown size={18} />
                        ) : (
                          <IconChevronRight size={18} />
                        )}
                      </button>
                    </td>
                    <td className="p-3">
                      <Text fw={500} className="text-text-primary">
                        {project.name}
                      </Text>
                      {/* Below xl the Tasks column is hidden, so the progress moves under the name */}
                      <div className="mt-1 xl:hidden">
                        <TaskProgressSummary project={project} completionPercentage={completionPercentage} />
                      </div>
                    </td>
                    <td className="p-3">
                      <Select
                        value={project.status}
                        onChange={isSharedView ? undefined : (value) => {
                          if (value) {
                            updateProject.mutate({
                              id: project.id,
                              name: project.name,
                              status: value as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                              priority: project.priority as "HIGH" | "MEDIUM" | "LOW" | "NONE",
                            });
                          }
                        }}
                        data={statusOptions}
                        size="xs"
                        variant="filled"
                        disabled={isSharedView}
                        styles={{
                          input: {
                            backgroundColor: `var(--mantine-color-${getStatusColor(project.status)}-light)`,
                            color: `var(--mantine-color-${getStatusColor(project.status)}-filled)`,
                            fontWeight: 500,
                            border: 'none',
                          }
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <Select
                        value={project.priority}
                        onChange={isSharedView ? undefined : (value) => {
                          if (value) {
                            updateProject.mutate({
                              id: project.id,
                              name: project.name,
                              status: project.status as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                              priority: value as "HIGH" | "MEDIUM" | "LOW" | "NONE",
                            });
                          }
                        }}
                        data={priorityOptions}
                        size="xs"
                        variant="filled"
                        disabled={isSharedView}
                        styles={{
                          input: {
                            backgroundColor: `var(--mantine-color-${getPriorityColor(project.priority)}-light)`,
                            color: project.priority === "NONE" ? 'var(--color-text-secondary)' : `var(--mantine-color-${getPriorityColor(project.priority)}-filled)`,
                            fontWeight: 500,
                            border: 'none',
                          }
                        }}
                      />
                    </td>
                    <td className="hidden xl:table-cell p-3">
                      <TaskProgressSummary project={project} completionPercentage={completionPercentage} />
                    </td>
                  </tr>
                  {/* Expanded row showing tasks */}
                  {isExpanded && project.actions && project.actions.length > 0 && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <div className="bg-background-secondary border-t border-border-primary">
                          <div className="pl-12 pr-4 py-2 max-w-3xl">
                            <ActionsList
                              actions={project.actions}
                              viewName={`project-${project.id}`}
                              showCheckboxes={false}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
      
      <div className="mt-12 p-6 bg-surface-secondary rounded-lg border border-border-primary max-w-4xl mx-auto">
        <Text size="sm" className="text-text-secondary leading-relaxed">
          The Weekly Plan is inspired by David Allen&apos;s &quot;Getting Things Done&quot; weekly review practice, first published in 2001.
          In his framework, this sacred one-hour ritual serves as a weekly touchstone—a dedicated time to survey the
          landscape of your commitments, recalibrate priorities, and identify the essential next actions for each project.
          This augmented interpretation adapts those timeless principles to our modern collaborative context, enabling
          teams to maintain clarity and momentum across their shared endeavors.
        </Text>
        <Text size="sm" className="text-text-secondary mt-3">
          <Link 
            href="/productivity-methods/weekly-plan" 
            className="text-brand-primary hover:text-brand-primary-hover underline"
          >
            Learn more about the Weekly Plan methodology
          </Link>
        </Text>
      </div>
    </Container>
  );
}