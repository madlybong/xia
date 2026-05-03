import { test, expect } from 'bun:test';
import { initQdrant, ensureCollection, storeMemory, queryMemory } from './qdrant';

test('Qdrant: Store and query memory', async () => {
  initQdrant();
  
  try {
    await ensureCollection('general');
    
    const text = 'XIA architecture uses Qdrant for semantic memory.';
    const id = await storeMemory('general', text, ['architecture', 'qdrant']);
    
    expect(id).toBeDefined();

    const results = await queryMemory('general', 'XIA architecture uses Qdrant', 3);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toBe(text);
    expect(results[0].tags.includes('architecture')).toBe(true);
  } catch (err: any) {
    if (
      err.code === 'ConnectionRefused' || 
      err.cause?.code === 'ECONNREFUSED' || 
      err.message?.includes('fetch') ||
      err.message?.includes('Unable to connect')
    ) {
      console.warn('Skipping Qdrant tests — Qdrant server not running at localhost:6333');
      return;
    }
    throw err;
  }
});
