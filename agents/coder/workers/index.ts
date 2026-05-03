import { runGeminiCLI } from '@xia/core';
import type { AgentRunContext, AgentInput } from '@xia/core';

export async function runReadCodebase(input: AgentInput, context: AgentRunContext): Promise<string> {
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'coder', workerName: 'read-codebase', status: 'running' });
  
  const prompt = `You are a codebase analyzer. Read the codebase relevant to this task and output a concise JSON or text summary of files, patterns, and risks.
  
TASK:
${input.instruction}

Use your tools to read the necessary files.`;

  const result = await runGeminiCLI(prompt, context.workingDir, context.taskId, context.bus, { yolo: true });
  
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'coder', workerName: 'read-codebase', status: 'success' });
  return result.text;
}

export async function runCodeWriter(input: AgentInput, analysis: string, context: AgentRunContext): Promise<string> {
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'coder', workerName: 'code-writer', status: 'running' });

  const prompt = `You are a senior software engineer. Implement the following task.
  
TASK:
${input.instruction}

ANALYSIS OF CODEBASE:
${analysis}

CONSTRAINTS:
${input.constraints.join('\n')}

Use your write_file and run_shell_command tools to implement the changes.`;

  const result = await runGeminiCLI(prompt, context.workingDir, context.taskId, context.bus, { yolo: true });
  
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'coder', workerName: 'code-writer', status: 'success' });
  return result.text;
}
