import { db } from '~/server/db';
import type { Prisma } from '@prisma/client';

export interface QueuedMessage {
  id: string;
  configId: string;
  message: any;
  retries: number;
  createdAt: Date;
  processedAt?: Date;
  error?: string;
}

/**
 * In-memory message queue with batch processing
 * In production, consider using Redis or RabbitMQ
 */
export class MessageQueue {
  private queue: Map<string, QueuedMessage> = new Map();
  private processing = false;
  private paused = false;
  private batchSize = 10;
  private processInterval = 100; // ms
  private stats = {
    processing: 0,
    completed: 0,
    failed: 0,
    totalProcessingTime: 0,
    lastProcessedAt: null as Date | null,
  };

  constructor(batchSize: number = 10) {
    this.batchSize = batchSize;
    this.startProcessing();
  }

  /**
   * Add message to queue for async processing
   */
  async enqueue(configId: string, message: any): Promise<string> {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const queuedMessage: QueuedMessage = {
      id,
      configId,
      message,
      retries: 0,
      createdAt: new Date()
    };

    this.queue.set(id, queuedMessage);
    
    // Store in database for persistence (optional)
    // This could be done async to avoid blocking
    return id;
  }

  /**
   * Process messages in batches
   */
  private async startProcessing() {
    if (this.processing) return;
    
    this.processing = true;
    
    setInterval(async () => {
      if (this.paused || this.queue.size === 0) return;
      
      // Get batch of messages
      const batch = Array.from(this.queue.entries())
        .slice(0, this.batchSize)
        .map(([id, msg]) => ({ id, ...msg }));
      
      // Update processing count
      this.stats.processing = batch.length;
      
      // Process batch in parallel
      await Promise.all(
        batch.map(msg => this.processMessage(msg))
      );
      
      this.stats.processing = 0;
    }, this.processInterval);
  }

  /**
   * Process individual message
   */
  private async processMessage(queuedMsg: QueuedMessage) {
    const startTime = Date.now();
    
    try {
      // Remove from queue immediately to prevent reprocessing
      this.queue.delete(queuedMsg.id);
      
      // Process based on message type
      // This is where you'd call your existing processing logic
      console.log(`Processing queued message ${queuedMsg.id}`);
      
      queuedMsg.processedAt = new Date();
      
      // Update stats
      this.stats.completed++;
      this.stats.totalProcessingTime += Date.now() - startTime;
      this.stats.lastProcessedAt = new Date();
    } catch (error) {
      console.error(`Failed to process message ${queuedMsg.id}:`, error);
      
      queuedMsg.retries++;
      queuedMsg.error = error instanceof Error ? error.message : String(error);
      
      // Re-queue if under retry limit
      if (queuedMsg.retries < 3) {
        this.queue.set(queuedMsg.id, queuedMsg);
      } else {
        this.stats.failed++;
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const failedMessages = Array.from(this.queue.values())
      .filter(msg => msg.retries >= 3);
    
    return {
      size: this.queue.size,
      processing: this.stats.processing,
      completed: this.stats.completed,
      failed: this.stats.failed + failedMessages.length,
      oldest: Array.from(this.queue.values())
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt
    };
  }

  /**
   * Get throughput metrics
   */
  getThroughput() {
    const avgProcessingTime = this.stats.completed > 0
      ? this.stats.totalProcessingTime / this.stats.completed
      : 0;
    
    const messagesPerMinute = this.stats.lastProcessedAt
      ? this.stats.completed / ((Date.now() - this.stats.lastProcessedAt.getTime()) / 60000)
      : 0;
    
    return {
      messagesPerMinute: Math.round(messagesPerMinute * 100) / 100,
      avgProcessingTime: Math.round(avgProcessingTime),
    };
  }

  /**
   * Pause queue processing
   */
  pause() {
    this.paused = true;
  }

  /**
   * Resume queue processing
   */
  resume() {
    this.paused = false;
  }

  /**
   * Clear failed messages from queue
   */
  clearFailed() {
    const failed = Array.from(this.queue.entries())
      .filter(([_, msg]) => msg.retries >= 3);
    
    failed.forEach(([id]) => this.queue.delete(id));
    this.stats.failed = 0;
  }
}

// Global message queue instance
export const messageQueue = new MessageQueue(
  parseInt(process.env.WHATSAPP_QUEUE_BATCH_SIZE || '10')
);