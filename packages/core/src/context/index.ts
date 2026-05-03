import type { Task, DAGNode, AgentInput, MemoryChunk } from '../../types';
import { queryMemory } from '../memory';
import { getTask } from '../memory';

export const MASKING_PATTERNS = [
  /sk-[a-zA-Z0-9]{32,}/g,           // Standard API keys
  /AIza[0-9A-Za-z-_]{35}/g,         // GCP/Firebase keys
  /[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Emails
];

export function maskSensitiveData(text: string, customPatterns: string[] = []): string {
  let masked = text;
  const allPatterns = [...MASKING_PATTERNS, ...customPatterns.map(p => new RegExp(p, 'g'))];
  
  for (const pattern of allPatterns) {
    masked = masked.replace(pattern, '***[MASKED]***');
  }
  return masked;
}

export function estimateTokens(input: AgentInput): number {
  const json = JSON.stringify(input);
  // Rough estimation: 1 token ~= 4 characters for English text/JSON
  return Math.ceil(json.length / 4);
}

export async function buildContext(
  task: Task,
  node: DAGNode,
  domainRules: string[] = [],
  customMasking: string[] = []
): Promise<AgentInput> {
  // 1. Gather memories from Qdrant based on contextScope
  let memories: MemoryChunk[] = [];
  if (node.contextScope && node.contextScope.length > 0) {
    try {
      const query = node.contextScope.join(' ');
      memories = await queryMemory(task.domain, query, 5);
    } catch (e) {
      // Qdrant might be offline, proceed without memory or log warning
      console.warn(`Could not fetch memory for task ${task.id}`, e);
    }
  }

  // 2. Gather dependency outputs from SQLite
  const dependencyOutputs: Record<string, any> = {};
  for (const depId of task.dependencies) {
    const depTask = getTask(depId);
    if (depTask?.output) {
      dependencyOutputs[depId] = depTask.output;
    }
  }

  // 3. Assemble unmasked input
  const rawInput: AgentInput = {
    instruction: node.instruction,
    memory: memories,
    dependencyOutputs,
    constraints: domainRules,
    masked: false,
    estimatedTokens: 0
  };

  // 4. Run masking pass over the entire payload
  const rawJson = JSON.stringify(rawInput);
  const maskedJson = maskSensitiveData(rawJson, customMasking);
  
  const maskedInput: AgentInput = JSON.parse(maskedJson);
  maskedInput.masked = true;
  maskedInput.estimatedTokens = estimateTokens(maskedInput);

  return maskedInput;
}
