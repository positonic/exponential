"use client";

import { MultiSelect } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from '@mantine/notifications';
import { type RouterOutputs } from "~/trpc/react";

type Outcome = RouterOutputs["outcome"]["getMyOutcomes"][0];

// Minimal outcome type for currentOutcomes - allows passing partial outcome data
interface OutcomeBasic {
  id: string;
  description?: string;
  type?: string | null;
  dueDate?: Date | null;
}

interface OutcomeMultiSelectProps {
  projectId: string;
  projectName: string;
  projectStatus: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  projectPriority: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  currentOutcomes?: OutcomeBasic[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  allOutcomes?: Outcome[];
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  isSharedView?: boolean;
  sharedViewUserId?: string;
  sharedViewTeamId?: string;
  onOutcomesChanged?: (updatedOutcomes?: OutcomeBasic[]) => void;
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
  isSharedView = false,
  sharedViewUserId,
  sharedViewTeamId,
  onOutcomesChanged,
}: OutcomeMultiSelectProps) {
  const utils = api.useUtils();
  
  // Helper function to invalidate the correct queries based on view context
  const invalidateQueries = () => {
    if (isSharedView && sharedViewUserId && sharedViewTeamId) {
      // Invalidate shared view queries
      void utils.project.getActiveWithDetailsForUser.invalidate({ 
        userId: sharedViewUserId, 
        teamId: sharedViewTeamId 
      });
      void utils.outcome.getOutcomesForUser.invalidate({ 
        userId: sharedViewUserId, 
        teamId: sharedViewTeamId 
      });
    } else {
      // Invalidate personal view queries
      void utils.project.getActiveWithDetails.invalidate();
      void utils.project.getAll.invalidate();
      void utils.outcome.getMyOutcomes.invalidate();
    }
  };
  
  const updateProject = api.project.update.useMutation({
    onMutate: async () => {
      // Cancel any outgoing refetches
      await utils.project.getActiveWithDetails.cancel();
      await utils.project.getAll.cancel();
      
      // Snapshot the previous values
      const previousActiveProjects = utils.project.getActiveWithDetails.getData();
      const previousAllProjects = utils.project.getAll.getData();
      
      // // Optimistically update the data
      // if (outcomeIds) {
      //   // Get the latest outcomes from cache instead of using stale prop
      //   const latestAllOutcomes = utils.outcome.getMyOutcomes.getData() || [];
      //   const updatedOutcomes = latestAllOutcomes.filter(o => outcomeIds.includes(o.id));
        
      //   utils.project.getActiveWithDetails.setData(undefined, (old) => {
      //     if (!old) return old;
      //     return old.map(p => 
      //       p.id === projectId 
      //         ? { ...p, outcomes: updatedOutcomes.map(outcome => ({
      //             id: outcome.id,
      //             description: outcome.description,
      //             dueDate: outcome.dueDate,
      //             userId: null,
      //             type: outcome.type,
      //             projectId: projectId
      //           })) }
      //         : p
      //     ) as any;
      //   });
        
      //   utils.project.getAll.setData(undefined, (old) => {
      //     if (!old) return old;
      //     return old.map(p => 
      //       p.id === projectId 
      //         ? { ...p, outcomes: updatedOutcomes.map(outcome => ({
      //             id: outcome.id,
      //             description: outcome.description,
      //             dueDate: outcome.dueDate,
      //             userId: null,
      //             type: outcome.type,
      //             projectId: projectId
      //           })) }
      //         : p
      //     ) as any;
      //   });
      // }

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
      // Use smart invalidation based on view context
      invalidateQueries();
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
        whyThisOutcome: null,
        userId: null,
        projectId: null,
        workspaceId: null,
        goals: [],
        projects: []
      };
      
      // Optimistically add to all outcomes
      utils.outcome.getMyOutcomes.setData(undefined, (old) => {
        if (!old) return [tempOutcome];
        return [...old, tempOutcome];
      });
      
      // Skip optimistic project updates due to type mismatch
      const currentOutcomeIds = currentOutcomes.map(o => o.id);
      const newOutcomes = [...currentOutcomes, tempOutcome];
      
      utils.project.getActiveWithDetails.setData(undefined, (old) => {
        if (!old) return old;
        return old.map(p => 
          p.id === projectId 
            ? { ...p, outcomes: newOutcomes.map(outcome => ({
                id: outcome.id,
                description: outcome.description,
                dueDate: outcome.dueDate,
                userId: null,
                type: outcome.type,
                projectId: projectId
              })) }
            : p
        ) as any;
      });
      
      utils.project.getAll.setData(undefined, (old) => {
        if (!old) return old;
        return old.map(p => 
          p.id === projectId 
            ? { ...p, outcomes: newOutcomes.map(outcome => ({
                id: outcome.id,
                description: outcome.description,
                dueDate: outcome.dueDate,
                userId: null,
                type: outcome.type,
                projectId: projectId
              })) }
            : p
        ) as any;
      });
      
      // Clear search immediately
      onSearchChange('');
      
      return { tempId, currentOutcomeIds, tempOutcome };
    },
    onSuccess: (newOutcome, _variables, context) => {
      if (context) {
        // Replace temp outcome with real outcome in the cache
        const { tempId, currentOutcomeIds } = context;
        
        // Update all outcomes with the real ID
        utils.outcome.getMyOutcomes.setData(undefined, (old) => {
          if (!old) return [newOutcome];
          return old.map(o => o.id === tempId ? newOutcome : o);
        });
        
        // Get the current project outcomes from cache (which includes temp outcome)
        const currentProject = utils.project.getActiveWithDetails.getData()?.find(p => p.id === projectId);
        const projectOutcomes = currentProject?.outcomes || [];
        
        // Replace temp outcome with real outcome
        const updatedOutcomes = projectOutcomes.filter(o => o.id !== tempId).concat(newOutcome);
        
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
        
        // Now update the project with the real outcome IDs
        const outcomeIds = [...currentOutcomeIds, newOutcome.id];
        const outcomesForCallback = [...currentOutcomes, { id: newOutcome.id, description: newOutcome.description, type: newOutcome.type, dueDate: newOutcome.dueDate }];
        updateProject.mutate({
          id: projectId,
          name: projectName,
          status: projectStatus,
          priority: projectPriority,
          outcomeIds,
        }, {
          onSuccess: () => {
            // Show notification
            notifications.show({
              title: 'Outcome created',
              message: `${newOutcome.description} has been added to ${projectName}`,
              color: 'green',
            });
            onOutcomesChanged?.(outcomesForCallback);
          },
          onSettled: () => {
            // Use smart invalidation based on view context
            invalidateQueries();
          }
        });
      }
    },
    onError: (error) => {
      // Use smart invalidation to rollback optimistic updates
      invalidateQueries();
      
      notifications.show({
        title: 'Failed to create outcome',
        message: error.message,
        color: 'red',
      });
    },
    // Remove onSettled - we'll invalidate after project update succeeds
  });

  // Build outcome data with create option
  const allOutcomeData = allOutcomes.map(outcome => ({ 
    value: outcome.id, 
    label: outcome.description 
  }));
  
  // Add current outcomes that might not be in allOutcomes (in case of data inconsistency)
  currentOutcomes.forEach(outcome => {
    if (!allOutcomeData.find(o => o.value === outcome.id)) {
      allOutcomeData.push({
        value: outcome.id,
        label: outcome.description ?? 'Untitled outcome'
      });
    }
  });
  
  // Sort outcomes to show selected ones first
  const selectedOutcomeIds = new Set(currentOutcomes.map(o => o.id));
  const selectedOutcomes = allOutcomeData
    .filter(o => selectedOutcomeIds.has(o.value))
    .map(o => ({ ...o, label: `✓ ${o.label}` })); // Add checkmark to selected items
  const unselectedOutcomes = allOutcomeData.filter(o => !selectedOutcomeIds.has(o.value));
  
  // Combine with selected outcomes first
  const outcomeData = [...selectedOutcomes, ...unselectedOutcomes];
  
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
            // Build the updated outcomes list for the callback
            const updatedOutcomes = values.map(id => {
              const existing = currentOutcomes.find(o => o.id === id);
              if (existing) return existing;
              const fromAll = allOutcomes.find(o => o.id === id);
              if (fromAll) return { id: fromAll.id, description: fromAll.description, type: fromAll.type, dueDate: fromAll.dueDate };
              return { id, description: 'Unknown outcome' };
            });

            updateProject.mutate({
              id: projectId,
              name: projectName,
              status: projectStatus,
              priority: projectPriority,
              outcomeIds: values,
            }, {
              onSuccess: () => {
                onOutcomesChanged?.(updatedOutcomes);
              },
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
        }}
      />
    </div>
  );
}