"use client";

import { MultiSelect } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from '@mantine/notifications';
import { type RouterOutputs } from "~/trpc/react";

type Outcome = RouterOutputs["outcome"]["getMyOutcomes"][0];

interface OutcomeMultiSelectProps {
  projectId: string;
  projectName: string;
  projectStatus: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  projectPriority: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  currentOutcomes?: Outcome[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  allOutcomes?: Outcome[];
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export function OutcomeMultiSelect({
  projectId,
  projectName,
  projectStatus,
  projectPriority,
  currentOutcomes = [],
  searchValue,
  onSearchChange,
  allOutcomes = [],
  size = "sm",
}: OutcomeMultiSelectProps) {
  const utils = api.useUtils();
  
  const updateProject = api.project.update.useMutation({
    onMutate: async ({ outcomeIds }) => {
      // Cancel any outgoing refetches
      await utils.project.getActiveWithDetails.cancel();
      await utils.project.getAll.cancel();
      
      // Snapshot the previous values
      const previousActiveProjects = utils.project.getActiveWithDetails.getData();
      const previousAllProjects = utils.project.getAll.getData();
      
      // Optimistically update the data
      if (outcomeIds) {
        const updatedOutcomes = allOutcomes.filter(o => outcomeIds.includes(o.id));
        
        utils.project.getActiveWithDetails.setData(undefined, (old) => {
          if (!old) return old;
          return old.map(p => 
            p.id === projectId 
              ? { ...p, outcomes: updatedOutcomes }
              : p
          );
        });
        
        utils.project.getAll.setData(undefined, (old) => {
          if (!old) return old;
          return old.map(p => 
            p.id === projectId 
              ? { ...p, outcomes: updatedOutcomes }
              : p
          );
        });
      }
      
      // Return a context with the snapshots
      return { previousActiveProjects, previousAllProjects };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousActiveProjects) {
        utils.project.getActiveWithDetails.setData(undefined, context.previousActiveProjects);
      }
      if (context?.previousAllProjects) {
        utils.project.getAll.setData(undefined, context.previousAllProjects);
      }
    },
    onSettled: () => {
      // Silently refetch in the background
      void utils.project.getActiveWithDetails.invalidate();
      void utils.project.getAll.invalidate();
    },
  });

  const createOutcomeMutation = api.outcome.createOutcome.useMutation({
    onMutate: async ({ description }) => {
      // Create a temporary outcome
      const tempId = `temp-${Date.now()}`;
      const tempOutcome: Outcome = {
        id: tempId,
        description,
        type: 'weekly',
        dueDate: null,
        completedDate: null,
        status: 'ACTIVE',
        createdById: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Optimistically add to all outcomes
      utils.outcome.getMyOutcomes.setData(undefined, (old) => {
        if (!old) return [tempOutcome];
        return [...old, tempOutcome];
      });
      
      // Optimistically update the project
      const currentOutcomeIds = currentOutcomes.map(o => o.id);
      const newOutcomes = [...currentOutcomes, tempOutcome];
      
      utils.project.getActiveWithDetails.setData(undefined, (old) => {
        if (!old) return old;
        return old.map(p => 
          p.id === projectId 
            ? { ...p, outcomes: newOutcomes }
            : p
        );
      });
      
      utils.project.getAll.setData(undefined, (old) => {
        if (!old) return old;
        return old.map(p => 
          p.id === projectId 
            ? { ...p, outcomes: newOutcomes }
            : p
        );
      });
      
      // Clear search immediately
      onSearchChange('');
      
      return { tempId, currentOutcomeIds };
    },
    onSuccess: (newOutcome, _variables, context) => {
      // Update with the real outcome ID
      if (context) {
        const outcomeIds = [...context.currentOutcomeIds, newOutcome.id];
        
        // Silently update the project with the real outcome (no notification)
        updateProject.mutate({
          id: projectId,
          name: projectName,
          status: projectStatus,
          priority: projectPriority,
          outcomeIds,
        }, {
          onSuccess: () => {
            // Only show one notification for the entire operation
            notifications.show({
              title: 'Outcome created',
              message: `${newOutcome.description} has been added to ${projectName}`,
              color: 'green',
            });
          }
        });
      }
    },
    onError: (error) => {
      // Rollback will happen automatically through invalidation
      notifications.show({
        title: 'Failed to create outcome',
        message: error.message,
        color: 'red',
      });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      void utils.outcome.getMyOutcomes.invalidate();
      void utils.project.getActiveWithDetails.invalidate();
      void utils.project.getAll.invalidate();
    },
  });

  // Build outcome data with create option
  const outcomeData = allOutcomes.map(outcome => ({ 
    value: outcome.id, 
    label: outcome.description 
  }));
  
  // Add current outcomes that might not be in allOutcomes (in case of data inconsistency)
  currentOutcomes.forEach(outcome => {
    if (!outcomeData.find(o => o.value === outcome.id)) {
      outcomeData.push({
        value: outcome.id,
        label: outcome.description
      });
    }
  });
  
  // Add create option if there's a search value
  if (searchValue.trim()) {
    outcomeData.push({
      value: `create-${searchValue}`,
      label: `➕ Create new outcome: "${searchValue}"`,
    });
  }

  return (
    <div style={{ maxWidth: size === 'xs' ? '250px' : '300px', minWidth: '150px' }}>
      <MultiSelect
        data={outcomeData}
        value={currentOutcomes.map(o => o.id)}
        onChange={(values) => {
          // Check if a create option was selected
          const createValue = values.find(v => v.startsWith('create-'));
          if (createValue) {
            const outcomeDescription = createValue.replace('create-', '');
            createOutcomeMutation.mutate({
              description: outcomeDescription,
              type: 'weekly',
            });
            // Don't update the project yet, wait for the mutation to succeed
          } else {
            // Update project with selected outcomes
            updateProject.mutate({
              id: projectId,
              name: projectName,
              status: projectStatus,
              priority: projectPriority,
              outcomeIds: values,
            });
          }
        }}
        onSearchChange={onSearchChange}
        searchValue={searchValue}
        placeholder="Select or create outcomes"
        searchable
        clearable
        size={size}
        maxDropdownHeight={200}
        styles={{
          input: {
            backgroundColor: 'transparent',
          },
          option: {
            // Special style for create option
            '&[value^="create-"]': {
              fontWeight: 600,
              borderTop: '1px solid var(--color-border-primary)',
              marginTop: '4px',
              paddingTop: '8px',
              backgroundColor: 'var(--color-surface-hover)',
              '&:hover': {
                backgroundColor: 'var(--color-brand-surface)',
              },
            },
          },
        }}
      />
    </div>
  );
}