import { test, expect, beforeAll, afterAll } from 'bun:test';
import { initSQLite, closeSQLite, createTask, getTask, updateTask, listTasks, appendLog, getTaskLogs, recordSpend } from './sqlite';
import type { Task } from '../../types';

const TEST_DB = ':memory:';

beforeAll(() => {
  initSQLite(TEST_DB);
});

afterAll(() => {
  closeSQLite();
});

test('SQLite: Create and read task', () => {
  const task: Task = {
    id: 't-1',
    agentId: 'planner',
    domain: 'general',
    state: 'PENDING',
    dependencies: [],
    requiredGates: [],
    retries: 0,
    maxRetries: 3,
    priority: 'normal',
    input: {
      instruction: 'test',
      memory: [],
      dependencyOutputs: {},
      constraints: [],
      masked: false,
      estimatedTokens: 10
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  createTask(task);

  const fetched = getTask('t-1');
  expect(fetched).not.toBeNull();
  expect(fetched!.id).toBe('t-1');
  expect(fetched!.input.instruction).toBe('test');
  expect(fetched!.dependencies.length).toBe(0);
});

test('SQLite: Update task', () => {
  const task = getTask('t-1')!;
  task.state = 'RUNNING';
  task.updatedAt = Date.now();
  updateTask(task);

  const updated = getTask('t-1');
  expect(updated!.state).toBe('RUNNING');
});

test('SQLite: List tasks with filter', () => {
  const list = listTasks({ domain: 'general', state: 'RUNNING' });
  expect(list.length).toBe(1);
  expect(list[0].id).toBe('t-1');

  const emptyList = listTasks({ domain: 'auruvi' });
  expect(emptyList.length).toBe(0);
});

test('SQLite: Append and get logs', () => {
  appendLog('t-1', 'Log 1');
  appendLog('t-1', 'Log 2');
  
  const logs = getTaskLogs('t-1');
  expect(logs.length).toBe(2);
  expect(logs[0]).toBe('Log 1');
  expect(logs[1]).toBe('Log 2');
});

test('SQLite: Record spend', () => {
  expect(() => {
    recordSpend('antigravity', 'hermes', 1500, 0.015);
  }).not.toThrow();
});
