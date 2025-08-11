import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { WhatsAppAnalyticsService } from '~/server/services/whatsapp/AnalyticsService';
import { db } from '~/server/db';

// This endpoint should be called by a cron job to aggregate analytics data
export async function GET(_request: NextRequest) {
  try {
    // Verify the request is authorized (add your own auth logic here)
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    console.log('Starting WhatsApp analytics aggregation...');
    
    // Get all active WhatsApp configurations
    const configs = await db.whatsAppConfig.findMany({
      where: {
        integration: {
          status: 'ACTIVE'
        }
      },
      select: {
        id: true,
        phoneNumberId: true,
        businessName: true,
      }
    });

    console.log(`Found ${configs.length} active WhatsApp configurations`);

    const results = [];
    const analyticsService = new WhatsAppAnalyticsService();
    
    // Aggregate analytics for each configuration
    for (const config of configs) {
      try {
        console.log(`Aggregating analytics for ${config.businessName || config.phoneNumberId}`);
        
        // Aggregate hourly data for the past hour
        const now = new Date();
        const currentHour = now.getHours();
        const previousHour = currentHour === 0 ? 23 : currentHour - 1;
        const dateToProcess = currentHour === 0 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
        
        await analyticsService.aggregateHourlyAnalytics(config.id, dateToProcess, previousHour);
        
        results.push({
          configId: config.id,
          businessName: config.businessName,
          status: 'success'
        });
      } catch (error) {
        console.error(`Error aggregating analytics for config ${config.id}:`, error);
        results.push({
          configId: config.id,
          businessName: config.businessName,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'error'
        });
      }
    }

    // Clean up old analytics data (older than 90 days)
    const cleanupDate = new Date();
    cleanupDate.setDate(cleanupDate.getDate() - 90);
    
    const deletedAnalytics = await db.whatsAppMessageAnalytics.deleteMany({
      where: {
        date: {
          lt: cleanupDate
        }
      }
    });
    
    const deletedMetrics = await db.whatsAppPerformanceMetrics.deleteMany({
      where: {
        timestamp: {
          lt: cleanupDate
        }
      }
    });

    console.log(`Cleaned up ${deletedAnalytics.count} old analytics records and ${deletedMetrics.count} performance metrics`);

    return NextResponse.json({
      success: true,
      message: 'Analytics aggregation completed',
      results,
      cleanup: {
        analytics: deletedAnalytics.count,
        metrics: deletedMetrics.count
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('WhatsApp analytics cron job failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// POST endpoint for manual trigger
export async function POST(request: NextRequest) {
  return GET(request);
}