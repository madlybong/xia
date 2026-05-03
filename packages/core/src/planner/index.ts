import { z } from 'zod';
import type { TaskDomain, DAGNode, MemoryChunk } from '../../types';
import { queryMemory } from '../memory';

export interface LLMProvider {
  generate(prompt: string): Promise<string>;
}

export class PlannerError extends Error {
  constructor(message: string, public context?: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

const GateTypeSchema = z.enum([
  'human-approve',
  'benchmark',
  'integration-test',
  'compliance-review',
  'compile'
]);

const PrioritySchema = z.enum(['normal', 'critical']);

const DAGNodeSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  domain: z.string().min(1),
  instruction: z.string().min(1),
  dependencies: z.array(z.string()),
  requiredGates: z.array(GateTypeSchema),
  priority: PrioritySchema,
  contextScope: z.array(z.string())
});

const DAGResponseSchema = z.array(DAGNodeSchema);

export class PlannerPromptBuilder {
  build(
    intent: string,
    domain: TaskDomain,
    memories: MemoryChunk[],
    domainRules: string[],
    errorContext?: string
  ): string {
    let prompt = `You are the XIA Planner. Your job is to convert the user intent into a Directed Acyclic Graph (DAG) of tasks.\n\n`;
    prompt += `DOMAIN: ${domain}\n\n`;
    prompt += `INTENT: ${intent}\n\n`;

    if (domainRules.length > 0) {
      prompt += `CONSTITUTION RULES:\n${domainRules.map(r => '- ' + r).join('\n')}\n\n`;
    }

    if (memories.length > 0) {
      prompt += `RELEVANT ARCHITECTURAL MEMORIES:\n`;
      for (const m of memories) {
        prompt += `- ${m.content}\n`;
      }
      prompt += `\n`;
    }

    if (errorContext) {
      prompt += `PREVIOUS ERROR:\n${errorContext}\nFix the JSON according to this error.\n\n`;
    }

    prompt += `OUTPUT FORMAT:\nReturn ONLY valid JSON matching this TypeScript schema. Do not wrap in markdown \`\`\`json block. Just the raw JSON array.\n`;
    prompt += `
type GateType = 'human-approve' | 'benchmark' | 'integration-test' | 'compliance-review' | 'compile';
type Priority = 'normal' | 'critical';

interface DAGNode {
  id: string;             // Unique ID for the node
  agentId: string;        // E.g., 'code-writer', 'planner', 'critic'
  domain: string;         // The domain provided above
  instruction: string;    // Detailed instruction for this task
  dependencies: string[]; // Array of node IDs this node depends on
  requiredGates: GateType[];
  priority: Priority;
  contextScope: string[]; // Keywords to search for relevant memory
}

Array<DAGNode>
`;

    return prompt;
  }
}

export async function planFromIntent(
  intent: string,
  domain: TaskDomain,
  llm: LLMProvider,
  domainRules: string[] = []
): Promise<DAGNode[]> {
  const promptBuilder = new PlannerPromptBuilder();
  let memories: MemoryChunk[] = [];
  
  try {
    memories = await queryMemory(domain, intent, 5);
  } catch (e) {
    console.warn('Could not fetch planner memories from Qdrant', e);
  }

  let attempt = 1;
  let lastError = '';

  while (attempt <= 2) {
    const prompt = promptBuilder.build(intent, domain, memories, domainRules, attempt > 1 ? lastError : undefined);
    const response = await llm.generate(prompt);

    try {
      // Sometimes LLMs return markdown blocks despite instructions
      const cleanJson = response.replace(/^```json\n?/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      const validated = DAGResponseSchema.parse(parsed);
      
      // Additional DAG semantic validation
      const ids = new Set(validated.map(n => n.id));
      for (const node of validated) {
        for (const dep of node.dependencies) {
          if (!ids.has(dep)) {
            throw new Error(`Node ${node.id} depends on non-existent node ${dep}`);
          }
        }
      }

      return validated as DAGNode[];
    } catch (err: any) {
      lastError = err.message || String(err);
      attempt++;
    }
  }

  throw new PlannerError(`Failed to generate valid DAG after 2 attempts. Last error: ${lastError}`, lastError);
}
