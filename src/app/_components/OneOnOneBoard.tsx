"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Select, Text, Group, Progress, Title, Container, ScrollArea } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { type RouterOutputs } from "~/trpc/react";
import { ActionList } from "./ActionList";
import { OutcomeMultiSelect } from "./OutcomeMultiSelect";

type Project = RouterOutputs["project"]["getActiveWithDetails"][0];

export function OneOnOneBoard() {
  const { data: projects, isLoading } = api.project.getActiveWithDetails.useQuery();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [outcomeSearchValues, setOutcomeSearchValues] = useState<Record<string, string>>({});
  const utils = api.useUtils();
  
  // Fetch all outcomes for the dropdown
  const { data: allOutcomes } = api.outcome.getMyOutcomes.useQuery();
  
  const updateProjectPriority = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getActiveWithDetails.invalidate();
    },
  });


  const priorityOptions = [
    { value: "HIGH", label: "High" },
    { value: "MEDIUM", label: "Medium" },
    { value: "LOW", label: "Low" },
    { value: "NONE", label: "None" },
  ];

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
      <Title order={2} mb="xl">Weekly Review</Title>
      
      <ScrollArea>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '40px' }}></th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm">Project name</th>
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
                        value={project.priority}
                        onChange={(value) => {
                          if (value) {
                            updateProjectPriority.mutate({
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
                        currentOutcomes={project.outcomes || []}
                        searchValue={outcomeSearchValues[project.id] || ''}
                        onSearchChange={(value) => {
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
                      <td colSpan={5} className="p-0">
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
    </Container>
  );
}