import { type PrismaClient } from "@prisma/client";
import { type IStepExecutor } from "./steps/IStepExecutor";
import { FetchGitHubCommitsStep } from "./steps/FetchGitHubCommitsStep";
import { AiAnalyzeStep } from "./steps/AiAnalyzeStep";
import { AiGenerateContentStep } from "./steps/AiGenerateContentStep";
import { StoreContentDraftStep } from "./steps/StoreContentDraftStep";
import { SendNotificationStep } from "./steps/SendNotificationStep";

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
  registry.register(new FetchGitHubCommitsStep());
  registry.register(new AiAnalyzeStep());
  registry.register(new AiGenerateContentStep());
  registry.register(new StoreContentDraftStep(db));
  registry.register(new SendNotificationStep());
  return registry;
}
