import { type PrismaClient } from "@prisma/client";
import { type IStepExecutor } from "./steps/IStepExecutor";
// Content steps
import { FetchGitHubCommitsStep } from "./steps/FetchGitHubCommitsStep";
import { AiAnalyzeStep } from "./steps/AiAnalyzeStep";
import { AiGenerateContentStep } from "./steps/AiGenerateContentStep";
import { StoreContentDraftStep } from "./steps/StoreContentDraftStep";
import { SendNotificationStep } from "./steps/SendNotificationStep";
// PM steps
import { FetchCompletedActionsStep } from "./steps/FetchCompletedActionsStep";
import { FetchPlannedActionsStep } from "./steps/FetchPlannedActionsStep";
import { FetchProjectHealthStep } from "./steps/FetchProjectHealthStep";
import { FetchBlockersStep } from "./steps/FetchBlockersStep";
import { AiGenerateStandupStep } from "./steps/AiGenerateStandupStep";

export class StepRegistry {
  private executors = new Map<string, IStepExecutor>();

  register(executor: IStepExecutor): void {
    this.executors.set(executor.type, executor);
  }

  get(type: string): IStepExecutor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No step executor registered for type: ${type}`);
    }
    return executor;
  }

  listTypes(): string[] {
    return [...this.executors.keys()];
  }
}

export function createStepRegistry(db: PrismaClient): StepRegistry {
  const registry = new StepRegistry();
  
  // Content steps
  registry.register(new FetchGitHubCommitsStep());
  registry.register(new AiAnalyzeStep());
  registry.register(new AiGenerateContentStep());
  registry.register(new StoreContentDraftStep(db));
  registry.register(new SendNotificationStep());
  
  // PM steps
  registry.register(new FetchCompletedActionsStep());
  registry.register(new FetchPlannedActionsStep());
  registry.register(new FetchProjectHealthStep());
  registry.register(new FetchBlockersStep());
  registry.register(new AiGenerateStandupStep());
  
  return registry;
}
