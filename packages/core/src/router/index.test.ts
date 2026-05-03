import { test, expect, beforeAll, afterAll } from 'bun:test';
import { AIRouter } from './index';
import { secretsStore } from '../secrets';
import { budgetEngine } from '../budget';
import { initSQLite, closeSQLite } from '@xia/core';

const TEST_DB = ':memory:';

beforeAll(() => {
  initSQLite(TEST_DB);
  // Setup mock secrets
  secretsStore.set('ANTIGRAVITY_API_KEY', 'test-key', 'general');
  secretsStore.set('KILO_API_KEY', 'test-key', 'general');
});

afterAll(() => {
  closeSQLite();
});

test('AIRouter: successful route to Kilo', async () => {
  const router = new AIRouter('kilo', 'general');
  // Mock the kilo provider
  (router as any).kilo = {
    generate: async () => ({ text: '[KILO MOCK RESPONSE]', tokens: 10, usd: 0 })
  };
  
  const response = await router.generate('Test prompt');
  expect(response).toContain('[KILO MOCK RESPONSE]');
});

test('AIRouter: blocked by budget', async () => {
  const router = new AIRouter('kilo', 'general');
  
  // Exceed Kilo's default daily budget (2.0)
  budgetEngine.record('kilo', 'general', 1000000, 3.0);
  
  expect(router.generate('Test prompt')).rejects.toThrow(/BudgetExceeded/);
});
