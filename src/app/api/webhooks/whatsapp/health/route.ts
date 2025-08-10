import { NextResponse } from 'next/server';
import { db } from '~/server/db';
import { circuitBreakers } from '~/server/services/whatsapp/CircuitBreaker';

export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'unknown' },
      circuitBreakers: {
        whatsappApi: circuitBreakers.whatsappApi.getStats(),
        aiProcessing: circuitBreakers.aiProcessing.getStats(),
        database: circuitBreakers.database.getStats()
      },
      errorRate: { status: 'unknown' }
    }
  };

  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;
    health.checks.database.status = 'healthy';
  } catch (error) {
    health.checks.database.status = 'unhealthy';
    health.status = 'degraded';
  }

  // Check error rate (last 5 minutes)
  try {
    const recentErrors = await db.aiInteractionHistory.count({
      where: {
        platform: 'whatsapp',
        hadError: true,
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000)
        }
      }
    });

    const totalMessages = await db.aiInteractionHistory.count({
      where: {
        platform: 'whatsapp',
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000)
        }
      }
    });

    const errorRate = totalMessages > 0 ? (recentErrors / totalMessages) * 100 : 0;
    health.checks.errorRate = {
      status: errorRate < 5 ? 'healthy' : errorRate < 10 ? 'warning' : 'critical',
      rate: `${errorRate.toFixed(2)}%`,
      errors: recentErrors,
      total: totalMessages
    };

    if (errorRate > 10) {
      health.status = 'unhealthy';
    } else if (errorRate > 5) {
      health.status = 'degraded';
    }
  } catch (error) {
    health.checks.errorRate.status = 'unknown';
  }

  // Check circuit breakers
  const cbStates = Object.values(circuitBreakers).map(cb => cb.getState());
  if (cbStates.includes('OPEN')) {
    health.status = 'unhealthy';
  } else if (cbStates.includes('HALF_OPEN')) {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 206 : 503;

  return NextResponse.json(health, { status: statusCode });
}