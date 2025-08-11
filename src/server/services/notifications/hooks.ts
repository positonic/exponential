import { notificationScheduler } from './NotificationScheduler';
import type { Action } from '@prisma/client';

/**
 * Hook to be called when a task is created or updated
 */
export async function onTaskChange(
  task: Action,
  oldTask?: Action
): Promise<void> {
  try {
    // Skip if no due date
    if (!task.dueDate) {
      return;
    }

    // Cancel old reminders if due date changed
    if (oldTask?.dueDate && oldTask.dueDate.getTime() !== task.dueDate.getTime()) {
      await notificationScheduler.cancelNotifications({
        userId: task.createdById,
        taskId: task.id,
      });
    }

    // Schedule new reminders if task is not completed
    if (task.status !== 'COMPLETED') {
      await notificationScheduler.scheduleTaskReminders(
        task.createdById,
        task.id,
        task.name,
        task.dueDate
      );
    }
  } catch (error) {
    console.error('Failed to handle task change for notifications:', error);
  }
}

/**
 * Hook to be called when a task is completed
 */
export async function onTaskComplete(task: Action): Promise<void> {
  try {
    // Cancel any pending reminders
    await notificationScheduler.cancelNotifications({
      userId: task.createdById,
      taskId: task.id,
    });
  } catch (error) {
    console.error('Failed to cancel task reminders:', error);
  }
}

/**
 * Hook to be called when a task is deleted
 */
export async function onTaskDelete(task: Action): Promise<void> {
  try {
    // Cancel any pending reminders
    await notificationScheduler.cancelNotifications({
      userId: task.createdById,
      taskId: task.id,
    });
  } catch (error) {
    console.error('Failed to cancel task reminders:', error);
  }
}