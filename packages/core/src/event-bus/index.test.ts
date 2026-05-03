import { test, expect } from 'bun:test';
import { XiaEventBus } from './index';

test('EventBus: typed emit and on', () => {
  const bus = new XiaEventBus();
  let receivedEvent: any = null;

  bus.on('task.queued', (event) => {
    receivedEvent = event;
  });

  bus.emit({
    type: 'task.queued',
    taskId: 'task-123',
    domain: 'auruvi'
  });

  expect(receivedEvent).not.toBeNull();
  expect(receivedEvent.type).toBe('task.queued');
  expect(receivedEvent.taskId).toBe('task-123');
  expect(receivedEvent.domain).toBe('auruvi');
});

test('EventBus: onAny listener', () => {
  const bus = new XiaEventBus();
  const events: any[] = [];

  bus.onAny((event) => {
    events.push(event);
  });

  bus.emit({
    type: 'task.started',
    taskId: 'task-123',
    agentId: 'planner'
  });

  bus.emit({
    type: 'system.fatal',
    message: 'test crash',
    timestamp: Date.now()
  });

  expect(events.length).toBe(2);
  expect(events[0].type).toBe('task.started');
  expect(events[1].type).toBe('system.fatal');
});
