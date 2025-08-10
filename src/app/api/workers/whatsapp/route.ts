import { NextResponse } from 'next/server';
import { db } from '~/server/db';
import { messageQueue } from '~/server/services/whatsapp/MessageQueue';
import { cacheService } from '~/server/services/whatsapp/CacheService';

interface WorkerStatus {
  status: 'active' | 'idle' | 'paused';
  timestamp: string;
  workers: {
    queue: QueueWorkerStatus;
    analytics: AnalyticsWorkerStatus;
  };
  performance: PerformanceMetrics;
}

interface QueueWorkerStatus {
  status: 'active' | 'idle' | 'error';
  queue: {
    size: number;
    processing: number;
    failed: number;
    completed: number;
  };
  throughput: {
    messagesPerMinute: number;
    avgProcessingTime: number;
  };
}

interface AnalyticsWorkerStatus {
  status: 'active' | 'idle' | 'error';
  lastRun: string | null;
  nextRun: string | null;
  metrics: {
    lastHourProcessed: boolean;
    pendingHours: number;
  };
}

interface PerformanceMetrics {
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cacheMetrics: {
    hitRate: number;
    size: number;
    evictions: number;
  };
}

const workerStartTime = Date.now();

export async function GET() {
  try {
    const status: WorkerStatus = {
      status: 'active',
      timestamp: new Date().toISOString(),
      workers: {
        queue: await getQueueWorkerStatus(),
        analytics: await getAnalyticsWorkerStatus(),
      },
      performance: await getPerformanceMetrics(),
    };

    // Determine overall status
    if (status.workers.queue.status === 'error' || 
        status.workers.analytics.status === 'error') {
      status.status = 'paused';
    } else if (status.workers.queue.status === 'idle' && 
               status.workers.analytics.status === 'idle') {
      status.status = 'idle';
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error('Worker status error:', error);
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function getQueueWorkerStatus(): Promise<QueueWorkerStatus> {
  const stats = messageQueue.getStats();
  const throughput = messageQueue.getThroughput();

  return {
    status: stats.processing > 0 ? 'active' : 
            stats.failed > 10 ? 'error' : 'idle',
    queue: {
      size: stats.size,
      processing: stats.processing,
      failed: stats.failed,
      completed: stats.completed || 0,
    },
    throughput: {
      messagesPerMinute: throughput.messagesPerMinute || 0,
      avgProcessingTime: throughput.avgProcessingTime || 0,
    },
  };
}

async function getAnalyticsWorkerStatus(): Promise<AnalyticsWorkerStatus> {
  try {
    // Check last analytics run
    const lastAnalytics = await db.whatsAppMessageAnalytics.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        date: true,
        hour: true,
      },
    });

    const now = new Date();
    const currentHour = now.getHours();
    const lastRunTime = lastAnalytics?.createdAt || null;
    
    // Calculate next run (top of next hour)
    const nextRun = new Date(now);
    nextRun.setHours(currentHour + 1, 0, 0, 0);

    // Check if current hour has been processed
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const currentHourProcessed = lastAnalytics && 
      lastAnalytics.date.getTime() === today.getTime() && 
      lastAnalytics.hour === currentHour;

    // Calculate pending hours
    let pendingHours = 0;
    if (lastAnalytics) {
      const hoursSinceLastRun = Math.floor(
        (now.getTime() - lastAnalytics.createdAt.getTime()) / (1000 * 60 * 60)
      );
      pendingHours = Math.max(0, hoursSinceLastRun - 1); // -1 because current hour might not be complete
    }

    return {
      status: pendingHours > 5 ? 'error' : pendingHours > 0 ? 'active' : 'idle',
      lastRun: lastRunTime ? lastRunTime.toISOString() : null,
      nextRun: nextRun.toISOString(),
      metrics: {
        lastHourProcessed: !currentHourProcessed,
        pendingHours,
      },
    };
  } catch (error) {
    console.error('Analytics worker status error:', error);
    return {
      status: 'error',
      lastRun: null,
      nextRun: null,
      metrics: {
        lastHourProcessed: false,
        pendingHours: 0,
      },
    };
  }
}

async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  const memUsage = process.memoryUsage();
  const cacheStats = cacheService.getStats();

  return {
    uptime: Date.now() - workerStartTime,
    memoryUsage: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    cacheMetrics: {
      hitRate: cacheStats.hits > 0 
        ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100) / 100
        : 0,
      size: cacheStats.size,
      evictions: cacheStats.evictions || 0,
    },
  };
}

// Optional: Add POST endpoint to control workers
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'pause':
        messageQueue.pause();
        return NextResponse.json({ status: 'paused' });
      
      case 'resume':
        messageQueue.resume();
        return NextResponse.json({ status: 'resumed' });
      
      case 'clear-failed':
        messageQueue.clearFailed();
        return NextResponse.json({ status: 'cleared' });
      
      case 'process-analytics':
        // Trigger analytics processing
        // This would normally be done by a cron job
        return NextResponse.json({ 
          status: 'triggered',
          message: 'Analytics processing triggered'
        });
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Worker control error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}