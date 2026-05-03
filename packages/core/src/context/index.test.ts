import { test, expect, beforeAll, afterAll } from 'bun:test';
import { maskSensitiveData, estimateTokens, buildContext } from './index';
import type { Task, DAGNode } from '../../types';
import { initSQLite, closeSQLite } from '../memory';

const TEST_DB = ':memory:';

beforeAll(() => {
  initSQLite(TEST_DB);
});

afterAll(() => {
  closeSQLite();
});

test('Context: Masking sensitive data', () => {
  const text = 'Here is my key: sk-1234567890abcdef1234567890abcdef1234567890 and email admin@auruvi.com';
  const masked = maskSensitiveData(text);
  
  expect(masked).not.toContain('sk-1234567890');
  expect(masked).not.toContain('admin@auruvi.com');
  expect(masked).toContain('***[MASKED]***');
});

test('Context: Estimate tokens', () => {
  const input: any = { instruction: 'Hello world! This is a test.' };
  const tokens = estimateTokens(input);
  expect(tokens).toBeGreaterThan(5);
  expect(tokens).toBeLessThan(20);
});

test('Context: buildContext sets masked and estimatedTokens', async () => {
  const node: DAGNode = {
    id: 'n-1',
    agentId: 'planner',
    domain: 'general',
    instruction: 'My secret is sk-abcd1234abcd1234abcd1234abcd1234abcd1234',
    dependencies: [],
    requiredGates: [],
    priority: 'normal',
    contextScope: []
  };

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
    input: {} as any,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const input = await buildContext(task, node);
  
  expect(input.masked).toBe(true);
  expect(input.instruction).not.toContain('sk-abcd');
  expect(input.estimatedTokens).toBeGreaterThan(0);
});
