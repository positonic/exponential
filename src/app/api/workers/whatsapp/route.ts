import { NextResponse } from 'next/server';
import { messageQueue } from '~/server/services/whatsapp/MessageQueue';
import { cacheService } from '~/server/services/whatsapp/CacheService';
import { circuitBreakers } from '~/server/services/whatsapp/CircuitBreaker';

/**
 * Worker endpoint to process queued WhatsApp messages
 * This can be called by a cron job or external scheduler
 */
export async function POST() {
  try {
    const stats = {
      processed: 0,
      failed: 0,
      queueStats: messageQueue.getStats(),
      cacheStats: {
        userMappings: cacheService.userMappings.getStats(),
        whatsappConfigs: cacheService.whatsappConfigs.getStats(),
        aiModels: cacheService.aiModels.getStats(),
        conversations: cacheService.conversations.getStats()
      },
      circuitBreakerStats: {
        whatsappApi: circuitBreakers.whatsappApi.getStats(),
        aiProcessing: circuitBreakers.aiProcessing.getStats(),
        database: circuitBreakers.database.getStats()
      }
    };

    // Process messages from queue
    // In a real implementation, this would process the queued messages
    // For now, just return stats
    
    return NextResponse.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Worker processing error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Get worker status
 */
export async function GET() {
  return NextResponse.json({
    status: 'active',
    queueSize: messageQueue.getStats().size,
    timestamp: new Date().toISOString()
  });
}