import { ApiClient } from "../api/client";
import { EventType, TrustEvent } from "./types";
import { Logger } from "../utils/logger";
import { TrustLayerError } from "../api/types";

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
  private lastFlushError: Error | null = null;

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
   * Throws if the OS rejects the batch — callers must not evaluate on silent loss.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      if (this.lastFlushError) {
        const err = this.lastFlushError;
        this.lastFlushError = null;
        throw err;
      }
      return;
    }

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

      this.lastFlushError = null;
      this.logger.debug(`flushed ${batch.length} events`);
    } catch (err) {
      this.logger.error("failed to send event batch", err);
      this.queue.unshift(...batch);
      const wrapped =
        err instanceof Error
          ? err
          : new TrustLayerError(String(err), 0, "event_flush_failed");
      this.lastFlushError = wrapped;
      throw wrapped;
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
      this.flushTimer = setInterval(() => {
        void this.flush().catch(() => {
          /* retained for next explicit flush */
        });
      }, FLUSH_INTERVAL_MS);
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
  const random =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(4)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : Math.random().toString(36).slice(2, 10);
  return `evt_${timestamp}${random}`;
}
