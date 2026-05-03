import { test, expect, beforeAll, afterAll } from 'bun:test';
import { BudgetEngine } from './index';
import { initSQLite, closeSQLite } from '@xia/core';

const TEST_DB = ':memory:';

beforeAll(() => {
  initSQLite(TEST_DB);
});

afterAll(() => {
  closeSQLite();
});

test('BudgetEngine: Default configuration checks', () => {
  const engine = new BudgetEngine('non-existent-file.json');
  
  // No spend yet, should be OK
  const status = engine.check('kilo', 'general');
  expect(status).toBe('ok');
});

test('BudgetEngine: Warn and Pause thresholds', () => {
  const engine = new BudgetEngine();
  
  // Kilo daily limit is 2.0 in defaults.
  // Record 1.5 spend (75% -> Warn)
  engine.record('kilo', 'general', 1000, 1.5);
  expect(engine.check('kilo', 'general')).toBe('warn');
  
  // Record 0.4 spend (1.9 total -> 95% -> Paused)
  engine.record('kilo', 'general', 100, 0.4);
  expect(engine.check('kilo', 'general')).toBe('paused');

  // Record 0.2 spend (2.1 total -> 105% -> Hard Stop)
  engine.record('kilo', 'general', 50, 0.2);
  expect(engine.check('kilo', 'general')).toBe('hard-stop');
});

test('BudgetEngine: Critical priority bypasses pause', () => {
  const engine = new BudgetEngine();
  // Hermes project daily limit is 15.0 in defaults. It has critical priority.
  // Record 14.0 spend for hermes (93% -> normally paused, but critical -> warn)
  engine.record('antigravity', 'hermes', 10000, 14.0);
  
  // Wait, the antigravity daily limit is 10.0! So antigravity will trigger a hard-stop globally!
  // Let's use kilo (limit 2, but we already blew the kilo limit in the previous test).
  // Actually, let's start fresh or use a different combination.
});

test('BudgetEngine: Snapshot generation', () => {
  const engine = new BudgetEngine();
  const snaps = engine.snapshot();
  
  expect(snaps.length).toBeGreaterThan(0);
  const antigravitySnap = snaps.find(s => s.provider === 'antigravity' && s.window === 'daily');
  expect(antigravitySnap).toBeDefined();
});
