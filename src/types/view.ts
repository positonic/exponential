// These types match the Prisma enums defined in schema.prisma
export type ViewType = "KANBAN" | "LIST";
export type ViewGroupBy = "STATUS" | "PROJECT" | "ASSIGNEE" | "PRIORITY";

/**
 * Filter configuration for Views
 * Determines which actions are displayed in the view
 */
export interface ViewFilters {
  /** Filter to specific projects (empty = all projects in workspace) */
  projectIds?: string[];
  /** Filter by kanban status */
  statuses?: ("BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED")[];
  /** Filter by priority values */
  priorities?: string[];
  /** Filter by assigned users */
  assigneeIds?: string[];
  /** Filter by tags */
  tagIds?: string[];
  /** Include completed/cancelled actions (default: false) */
  includeCompleted?: boolean;
}

/**
 * Sort configuration for Views
 */
export interface ViewSortConfig {
  field: "kanbanOrder" | "priority" | "dueDate" | "name" | "createdAt";
  direction: "asc" | "desc";
}

/**
 * Virtual view config (for default "All Items" view before it's persisted)
 */
export interface VirtualViewConfig {
  id: "default-virtual";
  name: string;
  slug: string;
  viewType: ViewType;
  groupBy: ViewGroupBy;
  filters: ViewFilters;
  sortConfig: ViewSortConfig;
  isSystem: true;
  isDefault: true;
  isVirtual: true;
}

/**
 * Default view configuration
 */
export const DEFAULT_VIEW_CONFIG: VirtualViewConfig = {
  id: "default-virtual",
  name: "All Items",
  slug: "all-items",
  viewType: "KANBAN",
  groupBy: "STATUS",
  filters: {},
  sortConfig: { field: "kanbanOrder", direction: "asc" },
  isSystem: true,
  isDefault: true,
  isVirtual: true,
};

/**
 * Kanban column definition for grouping
 */
export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
}

/**
 * Default kanban columns when grouped by status
 */
export const STATUS_COLUMNS: KanbanColumn[] = [
  { id: "BACKLOG", title: "Backlog", color: "gray" },
  { id: "TODO", title: "To Do", color: "blue" },
  { id: "IN_PROGRESS", title: "In Progress", color: "yellow" },
  { id: "IN_REVIEW", title: "In Review", color: "purple" },
  { id: "DONE", title: "Done", color: "green" },
  { id: "CANCELLED", title: "Cancelled", color: "red" },
];
