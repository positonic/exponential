export interface StepContext {
  userId: string;
  workspaceId: string;
  runId: string;
}

export interface IStepExecutor {
  type: string;
  label: string;
  execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>>;
}
