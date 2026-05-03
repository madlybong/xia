import { runGeminiCLI } from '@xia/core';
import type { AgentRunContext, AgentInput } from '@xia/core';

export async function runInspect(input: AgentInput, context: AgentRunContext): Promise<string> {
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'designer', workerName: 'inspect', status: 'running' });
  
  const prompt = `You are an architectural designer. Inspect the existing codebase to understand its structure and patterns before designing a new feature.
  
TASK:
${input.instruction}

Use your tools to read the necessary files. Output a summary of the current architecture.`;

  const result = await runGeminiCLI(prompt, context.workingDir, context.taskId, context.bus, { yolo: true });
  
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'designer', workerName: 'inspect', status: 'success' });
  return result.text;
}

export async function runDesignSpec(input: AgentInput, inspection: string, context: AgentRunContext): Promise<string> {
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'designer', workerName: 'design-spec', status: 'running' });

  const prompt = `You are an architectural designer. Produce a detailed design specification for the requested feature.
  
TASK:
${input.instruction}

EXISTING ARCHITECTURE:
${inspection}

CONSTRAINTS:
${input.constraints.join('\n')}

Produce a DESIGN_SPEC.md file using your write_file tool, and output a summary of your design.`;

  const result = await runGeminiCLI(prompt, context.workingDir, context.taskId, context.bus, { yolo: true });
  
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'designer', workerName: 'design-spec', status: 'success' });
  return result.text;
}
