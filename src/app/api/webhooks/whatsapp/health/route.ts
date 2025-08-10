import { NextResponse } from 'next/server';
import { db } from '~/server/db';
import { circuitBreakers } from '~/server/services/whatsapp/CircuitBreaker';
import { cacheService } from '~/server/services/whatsapp/CacheService';
import { messageQueue } from '~/server/services/whatsapp/MessageQueue';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: CheckResult;
    circuitBreakers: CircuitBreakerStatus;
    cache: CacheStatus;
    messageQueue: QueueStatus;
    errorRate: ErrorRateStatus;
  };
}

interface CheckResult {
  status: 'ok' | 'error';
  message?: string;
  latency?: number;
}

interface CircuitBreakerStatus {
  status: 'ok' | 'warning' | 'error';
  states: Record<string, string>;
}

interface CacheStatus {
  status: 'ok' | 'error';
  hitRate: number;
  size: number;
}

interface QueueStatus {
  status: 'ok' | 'warning' | 'error';
  size: number;
  processing: number;
  failed: number;
}

interface ErrorRateStatus {
  status: 'ok' | 'warning' | 'error';
  rate: number;
  threshold: number;
}

const startTime = Date.now();

export async function GET() {
  try {
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - startTime,
      checks: {
        database: await checkDatabase(),
        circuitBreakers: checkCircuitBreakers(),
        cache: checkCache(),
        messageQueue: checkMessageQueue(),
        errorRate: await checkErrorRate(),
      },
    };

    // Determine overall health status
    const checks = Object.values(health.checks);
    if (checks.some(check => check.status === 'error')) {
      health.status = 'unhealthy';
    } else if (checks.some(check => check.status === 'warning')) {
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;

    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    return {
      status: 'ok',
      latency,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

function checkCircuitBreakers(): CircuitBreakerStatus {
  const states: Record<string, string> = {};
  let hasOpen = false;
  let hasHalfOpen = false;

  // Check each circuit breaker
  for (const [name, breaker] of Object.entries(circuitBreakers)) {
    const state = breaker.getState();
    states[name] = state;
    
    if (state === 'open') hasOpen = true;
    if (state === 'half-open') hasHalfOpen = true;
  }

  return {
    status: hasOpen ? 'error' : hasHalfOpen ? 'warning' : 'ok',
    states,
  };
}

function checkCache(): CacheStatus {
  const stats = cacheService.getStats();
  const hitRate = stats.hits > 0 ? (stats.hits / (stats.hits + stats.misses)) : 0;

  return {
    status: 'ok',
    hitRate: Math.round(hitRate * 100) / 100,
    size: stats.size,
  };
}

function checkMessageQueue(): QueueStatus {
  const stats = messageQueue.getStats();
  const status = stats.failed > 10 ? 'error' : 
                 stats.size > 100 ? 'warning' : 'ok';

  return {
    status,
    size: stats.size,
    processing: stats.processing,
    failed: stats.failed,
  };
}

async function checkErrorRate(): Promise<ErrorRateStatus> {
  try {
    // Calculate error rate from last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const [totalMessages, failedMessages] = await Promise.all([
      db.aiInteractionHistory.count({
        where: {
          platform: 'whatsapp',
          createdAt: { gte: oneHourAgo },
        },
      }),
      db.aiInteractionHistory.count({
        where: {
          platform: 'whatsapp',
          hadError: true,
          createdAt: { gte: oneHourAgo },
        },
      }),
    ]);

    const errorRate = totalMessages > 0 ? failedMessages / totalMessages : 0;
    const threshold = parseFloat(process.env.MONITORING_ERROR_RATE_THRESHOLD || '0.05');

    return {
      status: errorRate > threshold * 2 ? 'error' : 
              errorRate > threshold ? 'warning' : 'ok',
      rate: Math.round(errorRate * 1000) / 1000,
      threshold,
    };
  } catch (_error) {
    return {
      status: 'error',
      rate: 0,
      threshold: 0.05,
    };
  }
}