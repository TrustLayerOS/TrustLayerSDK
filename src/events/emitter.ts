import { ApiClient } from "../api/client";
import { EventType, TrustEvent } from "./types";
import { Logger } from "../utils/logger";

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 2000;

/**
 * Batches and sends trust events to TrustLayerOS.
 * Events are flushed automatically every 2 seconds or when the batch hits 10 events.
 */
export class EventEmitter {
  private readonly apiClient: ApiClient;
  private readonly sessionId: string;
  private readonly logger: Logger;
  private queue: TrustEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(apiClient: ApiClient, sessionId: string, logger: Logger) {
    this.apiClient = apiClient;
    this.sessionId = sessionId;
    this.logger = logger;
    this.startFlushTimer();
  }

  /**
   * Adds an event to the queue. Auto-flushes when batch is full.
   */
  emit(type: EventType, data?: Record<string, unknown>): void {
    const event: TrustEvent = {
      id: generateId(),
      type,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      data,
    };

    this.queue.push(event);
    this.logger.debug(`event queued: ${type}`, event);

    if (this.queue.length >= BATCH_SIZE) {
      void this.flush();
    }
  }

  /**
   * Immediately sends all queued events.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);

    try {
      const payload = batch.map((e) => ({
        session_id: e.sessionId,
        type: e.type,
        timestamp: e.timestamp,
        data: e.data,
      }));

      if (batch.length === 1) {
        await this.apiClient.sendEvent(payload[0]);
      } else {
        await this.apiClient.sendEventBatch(payload);
      }

      this.logger.debug(`flushed ${batch.length} events`);
    } catch (err) {
      this.logger.error("failed to send event batch", err);
      // Re-queue failed events (prepend so they go first on next flush)
      this.queue.unshift(...batch);
    }
  }

  /**
   * Flushes pending events and stops the flush timer.
   */
  async destroy(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }

  private startFlushTimer(): void {
    if (typeof setInterval !== "undefined") {
      this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `evt_${timestamp}${random}`;
}
