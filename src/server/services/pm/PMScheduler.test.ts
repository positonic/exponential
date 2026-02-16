import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn(),
    })),
  },
}));

// Mock the db
vi.mock('~/server/db', () => ({
  db: {
    action: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    dailyPlan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    meeting: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    workflowDefinition: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

// Mock WorkflowEngine
vi.mock('../workflows/WorkflowEngine', () => ({
  WorkflowEngine: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
  })),
}));

// Mock StepRegistry
vi.mock('../workflows/StepRegistry', () => ({
  createStepRegistry: vi.fn(),
}));

import { PMScheduler, pmScheduler } from './PMScheduler';

describe('PMScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    pmScheduler.stop();
  });

  it('should be a singleton', () => {
    const instance1 = PMScheduler.getInstance();
    const instance2 = PMScheduler.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should have default tasks configured', () => {
    const status = pmScheduler.getStatus();
    expect(status.length).toBeGreaterThan(0);
    expect(status.some(t => t.id === 'daily-standup-workflow')).toBe(true);
    expect(status.some(t => t.id === 'project-health-workflow')).toBe(true);
  });

  it('should start and register tasks', () => {
    pmScheduler.start();
    
    const status = pmScheduler.getStatus();
    expect(status.some(t => t.running)).toBe(true);
  });

  it('should stop all tasks', () => {
    pmScheduler.start();
    pmScheduler.stop();
    
    const status = pmScheduler.getStatus();
    expect(status.every(t => !t.running)).toBe(true);
  });

  it('should not double-start when already running', () => {
    pmScheduler.start();
    const statusAfterFirst = pmScheduler.getStatus();
    const runningCountFirst = statusAfterFirst.filter(t => t.running).length;
    
    pmScheduler.start(); // Second start should be no-op
    const statusAfterSecond = pmScheduler.getStatus();
    const runningCountSecond = statusAfterSecond.filter(t => t.running).length;
    
    expect(runningCountSecond).toBe(runningCountFirst);
  });

  it('should throw error when running unknown task', async () => {
    await expect(pmScheduler.runTask('unknown-task')).rejects.toThrow('Task not found');
  });
});
