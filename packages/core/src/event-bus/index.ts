import { EventEmitter } from 'node:events';
import type { XiaEvent } from '../../types';

/**
 * XiaEventBus
 * A strongly-typed wrapper around Node's EventEmitter for XIA events.
 */
export class XiaEventBus {
  private emitter = new EventEmitter();

  /**
   * Emit a strongly typed XiaEvent
   */
  emit(event: XiaEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event); // For onAny listeners
  }

  /**
   * Listen for a specific event type
   */
  on<T extends XiaEvent['type']>(
    type: T,
    handler: (event: Extract<XiaEvent, { type: T }>) => void
  ): void {
    this.emitter.on(type, handler);
  }

  /**
   * Listen for all events (useful for WS bridge / logging)
   */
  onAny(handler: (event: XiaEvent) => void): void {
    this.emitter.on('*', handler);
  }

  /**
   * Remove a specific listener
   */
  off<T extends XiaEvent['type']>(
    type: T,
    handler: (event: Extract<XiaEvent, { type: T }>) => void
  ): void {
    this.emitter.off(type, handler);
  }

  /**
   * Remove an onAny listener
   */
  offAny(handler: (event: XiaEvent) => void): void {
    this.emitter.off('*', handler);
  }
}
