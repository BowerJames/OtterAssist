/**
 * Simple event emitter implementation for extension communication.
 *
 * Provides a lightweight pub/sub mechanism for extensions to communicate
 * with each other and the core system. Used internally by OtterAssist
 * but also available to extensions via the ExtensionContext.
 *
 * @example
 * ```typescript
 * const emitter = new SimpleEventEmitter();
 *
 * // Subscribe to events
 * emitter.on('data', (payload) => {
 *   console.log('Received:', payload);
 * });
 *
 * // Emit events
 * emitter.emit('data', { value: 42 });
 * ```
 */
import type { EventEmitter, EventHandler } from "../types/index.ts";

/**
 * Simple event emitter implementation.
 *
 * Supports:
 * - Multiple handlers per event
 * - Handler removal
 * - Error isolation (one handler error doesn't affect others)
 */
export class SimpleEventEmitter implements EventEmitter {
  /** Map of event names to their registered handlers */
  private readonly handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * Register a handler for an event.
   *
   * @param event - The event name to listen for
   * @param handler - The callback to invoke when the event is emitted
   */
  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(handler);
  }

  /**
   * Remove a previously registered handler.
   *
   * @param event - The event name
   * @param handler - The handler to remove
   */
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event to all registered handlers.
   *
   * Handlers are called in registration order. Errors in handlers
   * are caught and logged, but don't prevent other handlers from running.
   *
   * @param event - The event name to emit
   * @param args - Arguments to pass to handlers
   */
  emit(event: string, ...args: unknown[]): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      }
    }
  }
}
