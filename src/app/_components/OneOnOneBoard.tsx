"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Select, Text, Group, Progress, Title, Container, ScrollArea } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { type RouterOutputs } from "~/trpc/react";
import { ActionList } from "./ActionList";
import { OutcomeMultiSelect } from "./OutcomeMultiSelect";
import Link from "next/link";

type Project = RouterOutputs["project"]["getActiveWithDetails"][0];

interface OneOnOneBoardProps {
  userId?: string;
  teamId?: string;
  userName?: string;
  isSharedView?: boolean;
}

export function OneOnOneBoard({ userId, teamId, userName, isSharedView = false }: OneOnOneBoardProps) {
  // Use different API calls based on whether it's a shared view
  const { data: projects, isLoading } = isSharedView && userId && teamId
    ? api.project.getActiveWithDetailsForUser.useQuery({ userId, teamId })
    : api.project.getActiveWithDetails.useQuery();
  
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [outcomeSearchValues, setOutcomeSearchValues] = useState<Record<string, string>>({});
  const utils = api.useUtils();
  
  // Fetch outcomes - use different API for shared view
  const { data: allOutcomes } = isSharedView && userId && teamId
    ? api.outcome.getOutcomesForUser.useQuery({ userId, teamId })
    : api.outcome.getMyOutcomes.useQuery();
  
  const updateProject = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getActiveWithDetails.invalidate();
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
    const completedTasks = project.actions.filter(action => action.status === "DONE").length;
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
    <Container size="xl" py="xl">
      <Title order={2} mb="xl" className="text-text-primary">
        {isSharedView && userName ? `${userName}'s Weekly Review` : 'Weekly Review'}
      </Title>
      
      <ScrollArea>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '40px' }}></th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm">Project name</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '120px' }}>Status</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '120px' }}>Priority</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm">Weekly Outcomes</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '300px' }}>Tasks (read only)</th>
            </tr>
          </thead>
          <tbody>
            {projects?.map((project) => {
              const isExpanded = expandedProjects.has(project.id);
              const completionPercentage = calculateCompletionPercentage(project);
              
              return (
                <>
                  <tr key={project.id} className="border-b border-border-primary hover:bg-surface-hover transition-colors">
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
                    <td className="p-3">
                      <OutcomeMultiSelect
                        projectId={project.id}
                        projectName={project.name}
                        projectStatus={project.status as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED"}
                        projectPriority={project.priority as "HIGH" | "MEDIUM" | "LOW" | "NONE"}
                        currentOutcomes={project.outcomes?.map(outcome => ({ ...outcome, goals: [], projects: [], assignees: [] })) || []}
                        searchValue={outcomeSearchValues[project.id] || ''}
                        onSearchChange={isSharedView ? () => { /* disabled in shared view */ } : (value) => {
                          setOutcomeSearchValues(prev => ({
                            ...prev,
                            [project.id]: value
                          }));
                        }}
                        allOutcomes={allOutcomes || []}
                        size="sm"
                      />
                    </td>
                    <td className="p-3">
                      <Group gap="xs" align="center">
                        <Text size="sm" className="text-text-secondary">
                          {project.actions?.filter(a => a.status === "DONE").length || 0}/{project.actions?.length || 0} completed
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
                    </td>
                  </tr>
                  {/* Expanded row showing tasks */}
                  {isExpanded && project.actions && project.actions.length > 0 && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="bg-background-secondary border-t border-border-primary">
                          <div className="pl-12 pr-4 py-2 max-w-3xl">
                            <ActionList 
                              actions={project.actions}
                              viewName={`project-${project.id}`}
                              showCheckboxes={false}
                              enableBulkEditForOverdue={false}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
      
      <div className="mt-12 p-6 bg-surface-secondary rounded-lg border border-border-primary max-w-4xl mx-auto">
        <Text size="sm" className="text-text-secondary leading-relaxed">
          The Weekly Review originates from David Allen&apos;s &quot;Getting Things Done&quot; methodology, first published in 2001. 
          In his framework, this sacred one-hour ritual serves as a weekly touchstone—a dedicated time to survey the 
          landscape of your commitments, recalibrate priorities, and identify the essential next actions for each project. 
          This augmented interpretation adapts those timeless principles to our modern collaborative context, enabling 
          teams to maintain clarity and momentum across their shared endeavors.
        </Text>
        <Text size="sm" className="text-text-secondary mt-3">
          <Link 
            href="/productivity-methods/weekly-review" 
            className="text-brand-primary hover:text-brand-primary-hover underline"
          >
            Learn more about the Weekly Review methodology
          </Link>
        </Text>
      </div>
    </Container>
  );
}