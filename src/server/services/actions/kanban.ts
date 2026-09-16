import type { PrismaClient } from "@prisma/client";

/**
 * Next `kanbanOrder` for a new TODO card in `projectId`: after the last TODO
 * card, else after the last card on the board, else 1. Used when an Action
 * is created in a project and when it moves to a different one.
 */
export async function nextKanbanOrder(
  db: PrismaClient,
  projectId: string,
): Promise<number> {
  const [maxOrderAcrossBoard, maxOrderInTodo] = await Promise.all([
    db.action.findFirst({
      where: { projectId, kanbanOrder: { not: null } },
      orderBy: { kanbanOrder: "desc" },
      select: { kanbanOrder: true },
    }),
    db.action.findFirst({
      where: { projectId, kanbanStatus: "TODO", kanbanOrder: { not: null } },
      orderBy: { kanbanOrder: "desc" },
      select: { kanbanOrder: true },
    }),
  ]);
  if (maxOrderInTodo?.kanbanOrder) return maxOrderInTodo.kanbanOrder + 1;
  if (maxOrderAcrossBoard?.kanbanOrder) return maxOrderAcrossBoard.kanbanOrder + 1;
  return 1;
}
