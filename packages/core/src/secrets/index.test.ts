import { test, expect, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SecretsStore } from './index';

const TEST_DIR = join(process.cwd(), 'test_secrets_dir');

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, 'global.env'), 'ANTIGRAVITY_API_KEY=global-key\nTELEGRAM_BOT_TOKEN=bot-123\n');
  writeFileSync(join(TEST_DIR, 'hermes.env'), 'ANTIGRAVITY_API_KEY=hermes-key\nHERMES_SPECIFIC=h-only\n');
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

test('SecretsStore: Layered resolution', () => {
  const store = new SecretsStore(TEST_DIR);
  store.loadFromDisk();

  // 1. Global fallback
  expect(store.get('TELEGRAM_BOT_TOKEN')).toBe('bot-123');
  expect(store.get('TELEGRAM_BOT_TOKEN', 'hermes')).toBe('bot-123'); // Falls back to global since not in hermes.env

  // 2. Domain specific override
  expect(store.get('ANTIGRAVITY_API_KEY', 'general')).toBe('global-key'); // Uses global
  expect(store.get('ANTIGRAVITY_API_KEY', 'hermes')).toBe('hermes-key'); // Uses hermes.env

  // 3. Domain specific key
  expect(store.get('HERMES_SPECIFIC', 'hermes')).toBe('h-only');
  expect(store.get('HERMES_SPECIFIC', 'general')).toBeUndefined();
});

test('SecretsStore: Runtime override', () => {
  const store = new SecretsStore(TEST_DIR);
  store.loadFromDisk();

  // Override globally
  store.set('TELEGRAM_BOT_TOKEN', 'mem-bot-123', 'global');
  expect(store.get('TELEGRAM_BOT_TOKEN')).toBe('mem-bot-123');

  // Override specifically for domain
  store.set('ANTIGRAVITY_API_KEY', 'mem-hermes-key', 'hermes');
  expect(store.get('ANTIGRAVITY_API_KEY', 'hermes')).toBe('mem-hermes-key');
  expect(store.get('ANTIGRAVITY_API_KEY', 'general')).toBe('global-key'); // Global still untouched
});

test('SecretsStore: Process environment fallback', () => {
  const store = new SecretsStore(TEST_DIR);
  store.loadFromDisk();

  process.env.PROCESS_ONLY_KEY = 'from-env';
  
  expect(store.get('PROCESS_ONLY_KEY')).toBe('from-env');
  expect(store.get('PROCESS_ONLY_KEY', 'hermes')).toBe('from-env');
});
