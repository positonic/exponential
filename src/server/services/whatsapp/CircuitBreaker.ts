/**
 * Circuit Breaker pattern for WhatsApp API calls
 * Prevents cascading failures by temporarily blocking calls to failing services
 */
export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private readonly name: string,
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly resetTimeout: number = 30000 // 30 seconds
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.reset();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      console.error(`Circuit breaker OPENED for ${this.name} after ${this.failureCount} failures`);
      
      // Schedule automatic reset attempt
      setTimeout(() => {
        this.state = 'HALF_OPEN';
        console.log(`Circuit breaker HALF_OPEN for ${this.name}`);
      }, this.resetTimeout);
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    console.log(`Circuit breaker CLOSED for ${this.name}`);
  }

  getState(): string {
    return this.state;
  }

  getStats(): { state: string; failures: number; lastFailure: number } {
    return {
      state: this.state,
      failures: this.failureCount,
      lastFailure: this.lastFailureTime
    };
  }
}

// Global circuit breakers for different services
export const circuitBreakers = {
  whatsappApi: new CircuitBreaker('WhatsApp API', 5, 60000),
  aiProcessing: new CircuitBreaker('AI Processing', 3, 30000),
  database: new CircuitBreaker('Database', 10, 120000)
};