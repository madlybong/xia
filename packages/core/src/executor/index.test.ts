import { test, expect, beforeAll, afterAll } from 'bun:test';
import { executeTask, approveTask, rejectTask } from './index';
import { XiaEventBus } from '../event-bus';
import { initSQLite, closeSQLite, createTask, getTask } from '../memory';
import type { Task, AgentPlugin, AgentInput, AgentOutput } from '../../types';

const TEST_DB = ':memory:';

beforeAll(() => {
  initSQLite(TEST_DB);
});

afterAll(() => {
  closeSQLite();
});

function mockTask(id: string, masked = true, gates: any[] = []): Task {
  const t: Task = {
    id,
    agentId: 'planner',
    domain: 'general',
    state: 'PENDING',
    dependencies: [],
    requiredGates: gates,
    retries: 0,
    maxRetries: 2,
    priority: 'normal',
    input: {
      instruction: 'test',
      memory: [],
      dependencyOutputs: {},
      constraints: [],
      masked,
      estimatedTokens: 10
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  createTask(t);
  return t;
}

class MockAgent implements AgentPlugin {
  id = 'mock';
  domain = 'general' as const;
  version = '1.0';
  description = 'mock';

  constructor(public shouldFail = false) {}

  async run(input: AgentInput, context: any): Promise<AgentOutput> {
    if (this.shouldFail) {
      return {
        success: false,
        content: 'Mock error',
        tokensUsed: 10,
        provider: 'kilo',
        completedAt: new Date().toISOString()
      };
    }
    return {
      success: true,
      content: 'Mock success',
      tokensUsed: 10,
      provider: 'kilo',
      completedAt: new Date().toISOString()
    };
  }
}

test('Executor: Refuses unmasked input', async () => {
  const t = mockTask('t-unmasked', false);
  const bus = new XiaEventBus();
  await executeTask(t, new MockAgent(), { bus, taskId: t.id, workingDir: process.cwd() });
  
  const updated = getTask('t-unmasked')!;
  expect(updated.state).toBe('RETRYING');
  expect(updated.lastError).toContain('not masked');
});

test('Executor: Successful execution without gates', async () => {
  const t = mockTask('t-success', true);
  const bus = new XiaEventBus();
  
  let completedFired = false;
  bus.on('task.completed', () => { completedFired = true; });

  await executeTask(t, new MockAgent(), { bus, taskId: t.id, workingDir: process.cwd() });
  
  const updated = getTask('t-success')!;
  expect(updated.state).toBe('SUCCESS');
  expect(completedFired).toBe(true);
});

test('Executor: Fails and retries', async () => {
  const t = mockTask('t-fail', true);
  const bus = new XiaEventBus();

  // Attempt 1 -> RETRYING
  await executeTask(t, new MockAgent(true), { bus, taskId: t.id, workingDir: process.cwd() });
  let updated = getTask('t-fail')!;
  expect(updated.state).toBe('RETRYING');
  expect(updated.retries).toBe(1);

  // Attempt 2 -> RETRYING
  t.state = 'PENDING'; // simulate scheduler picking it up again
  await executeTask(t, new MockAgent(true), { bus, taskId: t.id, workingDir: process.cwd() });
  updated = getTask('t-fail')!;
  expect(updated.state).toBe('RETRYING');
  expect(updated.retries).toBe(2);

  // Attempt 3 -> ABANDONED (since maxRetries is 2)
  t.state = 'PENDING';
  await executeTask(t, new MockAgent(true), { bus, taskId: t.id, workingDir: process.cwd() });
  updated = getTask('t-fail')!;
  expect(updated.state).toBe('ABANDONED');
  expect(updated.retries).toBe(3);
});

test('Executor: Human approve gate', async () => {
  const t = mockTask('t-gate', true, ['human-approve']);
  const bus = new XiaEventBus();

  await executeTask(t, new MockAgent(), { bus, taskId: t.id, workingDir: process.cwd() });
  
  let updated = getTask('t-gate')!;
  expect(updated.state).toBe('BLOCKED');

  // Reject
  rejectTask('t-gate', 'Needs work', bus);
  updated = getTask('t-gate')!;
  expect(updated.state).toBe('RETRYING');

  // Reset to pending, execute again
  t.state = 'PENDING';
  await executeTask(t, new MockAgent(), { bus, taskId: t.id, workingDir: process.cwd() });
  updated = getTask('t-gate')!;
  expect(updated.state).toBe('BLOCKED');

  // Approve
  approveTask('t-gate', bus);
  updated = getTask('t-gate')!;
  expect(updated.state).toBe('SUCCESS');
});
