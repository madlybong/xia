import { test, expect } from 'bun:test';
import { getReadyTasks, detectCycles, buildExecutionOrder } from './index';
import type { DAGNode } from '../../types';

function mockNode(id: string, deps: string[]): DAGNode {
  return {
    id,
    agentId: 'planner',
    domain: 'general',
    instruction: 'test',
    dependencies: deps,
    requiredGates: [],
    priority: 'normal',
    contextScope: []
  };
}

test('Scheduler: getReadyTasks', () => {
  const nodes = [
    mockNode('A', []),
    mockNode('B', ['A']),
    mockNode('C', ['A', 'B'])
  ];

  const readyLevel0 = getReadyTasks(nodes, new Set());
  expect(readyLevel0.length).toBe(1);
  expect(readyLevel0[0].id).toBe('A');

  const readyLevel1 = getReadyTasks(nodes, new Set(['A']));
  expect(readyLevel1.length).toBe(1);
  expect(readyLevel1[0].id).toBe('B');

  const readyLevel2 = getReadyTasks(nodes, new Set(['A', 'B']));
  expect(readyLevel2.length).toBe(1);
  expect(readyLevel2[0].id).toBe('C');
});

test('Scheduler: detectCycles', () => {
  const nodesValid = [
    mockNode('A', []),
    mockNode('B', ['A']),
    mockNode('C', ['A'])
  ];
  expect(detectCycles(nodesValid)).toBe(false);

  const nodesCyclic = [
    mockNode('A', ['B']),
    mockNode('B', ['A'])
  ];
  expect(detectCycles(nodesCyclic)).toBe(true);

  const nodesComplexCyclic = [
    mockNode('A', []),
    mockNode('B', ['A', 'C']),
    mockNode('C', ['B'])
  ];
  expect(detectCycles(nodesComplexCyclic)).toBe(true);
});

test('Scheduler: buildExecutionOrder', () => {
  const nodes = [
    mockNode('D', ['B', 'C']),
    mockNode('A', []),
    mockNode('C', ['A']),
    mockNode('B', ['A']),
  ];

  const order = buildExecutionOrder(nodes);
  expect(order.length).toBe(3);
  
  // Level 0
  expect(order[0].map(n => n.id)).toEqual(['A']);
  // Level 1 (B and C order may vary, but both must be here)
  expect(order[1].map(n => n.id).sort()).toEqual(['B', 'C']);
  // Level 2
  expect(order[2].map(n => n.id)).toEqual(['D']);
});

test('Scheduler: buildExecutionOrder throws on unresolvable dep', () => {
  const nodes = [
    mockNode('A', ['Z']), // Z does not exist
  ];
  expect(() => buildExecutionOrder(nodes)).toThrow(/Unresolvable/);
});
