// lib/circuit-breaker.ts — Circuit breaker pattern for external service calls
import logger from './logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  /** Name for logging */
  name: string;
  /** Number of failures before opening the circuit */
  failureThreshold?: number;
  /** Time in ms to wait before trying again (half-open) */
  resetTimeout?: number;
  /** Max number of retry attempts */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff */
  retryBaseDelay?: number;
  /** Timeout for each call in ms */
  callTimeout?: number;
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalCalls: number;
  totalFailures: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private totalCalls = 0;
  private totalFailures = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;
  private readonly callTimeout: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30_000; // 30 seconds
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelay = options.retryBaseDelay ?? 1_000; // 1 second
    this.callTimeout = options.callTimeout ?? 30_000; // 30 seconds
  }

  /** Get current circuit stats */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailureTime,
      lastSuccess: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Execute a function through the circuit breaker with retry logic.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is OPEN
    if (this.state === 'OPEN') {
      // Check if reset timeout has elapsed
      if (this.lastFailureTime && Date.now() - this.lastFailureTime.getTime() >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.info(`Circuit breaker [${this.name}] transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN — service unavailable`);
      }
    }

    // Attempt with retries
    let lastError: Error | null = null;
    const attempts = this.state === 'HALF_OPEN' ? 1 : this.maxRetries;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        this.totalCalls++;
        const result = await this.executeWithTimeout(fn);
        this.onSuccess();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`Circuit breaker [${this.name}] attempt ${attempt}/${attempts} failed: ${lastError.message}`);

        if (attempt < attempts) {
          // Exponential backoff
          const delay = this.retryBaseDelay * Math.pow(2, attempt - 1);
          const jitter = Math.random() * delay * 0.1; // 10% jitter
          await this.sleep(delay + jitter);
        }
      }
    }

    this.onFailure();
    throw lastError || new Error(`Circuit breaker [${this.name}] call failed`);
  }

  /** Wrap a function with a timeout */
  private executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker [${this.name}] call timed out after ${this.callTimeout}ms`));
      }, this.callTimeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private onSuccess() {
    this.failures = 0;
    this.successes++;
    this.lastSuccessTime = new Date();

    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info(`Circuit breaker [${this.name}] recovered — back to CLOSED`);
    }
  }

  private onFailure() {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = new Date();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.error(`Circuit breaker [${this.name}] OPENED after ${this.failures} failures`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Force reset the circuit breaker */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    logger.info(`Circuit breaker [${this.name}] manually reset`);
  }
}

// ============================================
// Pre-configured Circuit Breakers
// ============================================

/** Circuit breaker for the Python/FastAPI backend */
export const backendCircuitBreaker = new CircuitBreaker({
  name: 'python-backend',
  failureThreshold: 5,
  resetTimeout: 30_000,
  maxRetries: 2,
  callTimeout: 60_000,
});

/** Circuit breaker for Elasticsearch */
export const elasticsearchCircuitBreaker = new CircuitBreaker({
  name: 'elasticsearch',
  failureThreshold: 3,
  resetTimeout: 60_000,
  maxRetries: 2,
  callTimeout: 10_000,
});
