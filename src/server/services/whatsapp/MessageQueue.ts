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
  private batchSize = 10;
  private processInterval = 100; // ms

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
      if (this.queue.size === 0) return;
      
      // Get batch of messages
      const batch = Array.from(this.queue.entries())
        .slice(0, this.batchSize)
        .map(([id, msg]) => ({ id, ...msg }));
      
      // Process batch in parallel
      await Promise.all(
        batch.map(msg => this.processMessage(msg))
      );
    }, this.processInterval);
  }

  /**
   * Process individual message
   */
  private async processMessage(queuedMsg: QueuedMessage) {
    try {
      // Remove from queue immediately to prevent reprocessing
      this.queue.delete(queuedMsg.id);
      
      // Process based on message type
      // This is where you'd call your existing processing logic
      console.log(`Processing queued message ${queuedMsg.id}`);
      
      queuedMsg.processedAt = new Date();
    } catch (error) {
      console.error(`Failed to process message ${queuedMsg.id}:`, error);
      
      queuedMsg.retries++;
      queuedMsg.error = error instanceof Error ? error.message : String(error);
      
      // Re-queue if under retry limit
      if (queuedMsg.retries < 3) {
        this.queue.set(queuedMsg.id, queuedMsg);
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      size: this.queue.size,
      oldest: Array.from(this.queue.values())
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt
    };
  }
}

// Global message queue instance
export const messageQueue = new MessageQueue(10);