import { type IStepExecutor, type StepContext } from "./IStepExecutor";

export class SendNotificationStep implements IStepExecutor {
  type = "send_notification";
  label = "Send notification";

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: StepContext,
  ): Promise<Record<string, unknown>> {
    const draftCount = (input.draftCount as number) ?? 0;
    const message =
      (config.message as string) ??
      `Workflow complete: ${draftCount} content drafts generated.`;

    // For now, log the notification. In the future, this can use the
    // existing NotificationService for email/slack/telegram delivery.
    console.log(`[WorkflowNotification] ${message}`);

    return {
      notified: true,
      message,
    };
  }
}
