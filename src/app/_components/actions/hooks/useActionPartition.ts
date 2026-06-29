import { useMemo } from "react";
import {
  partitionActions,
  type ActionPartition,
  type PartitionableAction,
} from "~/lib/actions/partition";

export type { ActionPartition, PartitionableAction };

interface UseActionPartitionOptions {
  today: Date;
}

export function useActionPartition<T extends PartitionableAction>(
  actions: T[],
  options: UseActionPartitionOptions,
): ActionPartition<T> {
  return useMemo(
    () => partitionActions(actions, { today: options.today }),
    [actions, options.today],
  );
}
