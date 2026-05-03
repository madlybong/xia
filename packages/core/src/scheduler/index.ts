import type { DAGNode } from '../../types';

/**
 * Returns tasks that have all dependencies met and are not already completed.
 */
export function getReadyTasks(nodes: DAGNode[], completedIds: Set<string>): DAGNode[] {
  if (detectCycles(nodes)) {
    console.error('Cycle detected in DAG. Cannot safely resolve tasks.');
    return [];
  }

  return nodes.filter(node => {
    // Already completed?
    if (completedIds.has(node.id)) return false;

    // Are all dependencies completed?
    return node.dependencies.every(depId => completedIds.has(depId));
  });
}

/**
 * Detects cycles in the DAG using Depth-First Search (DFS).
 */
export function detectCycles(nodes: DAGNode[]): boolean {
  const nodeMap = new Map<string, DAGNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function isCyclic(nodeId: string): boolean {
    if (recStack.has(nodeId)) return true; // Cycle
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recStack.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        if (isCyclic(depId)) return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (isCyclic(node.id)) return true;
  }

  return false;
}

/**
 * Topologically sorts the DAG into execution levels.
 * Returns an array of arrays, where each inner array can be run in parallel.
 * Level 0 = no dependencies. Level 1 = depends only on level 0, etc.
 * Throws if a cycle is detected.
 */
export function buildExecutionOrder(nodes: DAGNode[]): DAGNode[][] {
  if (detectCycles(nodes)) {
    throw new Error('Cycle detected in DAG. Cannot build execution order.');
  }

  const levels: DAGNode[][] = [];
  const completedIds = new Set<string>();
  const pendingNodes = new Set(nodes.map(n => n.id));
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  while (pendingNodes.size > 0) {
    const readyInThisLevel: DAGNode[] = [];

    for (const nodeId of pendingNodes) {
      const node = nodeMap.get(nodeId)!;
      const allDepsMet = node.dependencies.every(dep => completedIds.has(dep));
      if (allDepsMet) {
        readyInThisLevel.push(node);
      }
    }

    // If we have pending nodes but nothing is ready, it's a disjoint graph issue 
    // (though detectCycles should catch this if it's a true cycle, maybe missing dep)
    if (readyInThisLevel.length === 0) {
      throw new Error(`Unresolvable dependencies in DAG. Stuck nodes: ${Array.from(pendingNodes).join(', ')}`);
    }

    levels.push(readyInThisLevel);
    
    for (const readyNode of readyInThisLevel) {
      completedIds.add(readyNode.id);
      pendingNodes.delete(readyNode.id);
    }
  }

  return levels;
}
