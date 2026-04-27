import { ActionIcon, Menu } from "@mantine/core";
import {
  IconCheck,
  IconDots,
  IconEdit,
  IconList,
} from "@tabler/icons-react";
import type { Action } from "~/lib/actions/types";

interface RowActionsMenuProps {
  action: Action;
  workspaceLists?: Array<{ id: string; name: string }>;
  onEdit?: () => void;
  onAssign: () => void;
  onListToggle: (listId: string, isCurrentlyInList: boolean) => void;
}

export function RowActionsMenu({
  action,
  workspaceLists,
  onEdit,
  onAssign,
  onListToggle,
}: RowActionsMenuProps) {
  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Open action menu"
          onClick={(e) => e.stopPropagation()}
        >
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconEdit size={16} />}
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
        >
          Edit
        </Menu.Item>
        <Menu.Item
          onClick={(e) => {
            e.stopPropagation();
            onAssign();
          }}
        >
          Assign
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Lists</Menu.Label>
        {workspaceLists?.map((list) => {
          const isInList = !!action.lists?.some((al) => al.listId === list.id);
          return (
            <Menu.Item
              key={list.id}
              leftSection={<IconList size={14} />}
              rightSection={isInList ? <IconCheck size={14} /> : null}
              onClick={(e) => {
                e.stopPropagation();
                onListToggle(list.id, isInList);
              }}
            >
              {list.name}
            </Menu.Item>
          );
        })}
        {(!workspaceLists || workspaceLists.length === 0) && (
          <Menu.Item disabled>No lists yet</Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
