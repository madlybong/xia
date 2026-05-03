import { runGeminiCLI, runShellTask } from '@xia/core';
import type { AgentRunContext, AgentInput } from '@xia/core';

export async function runCheckState(input: AgentInput, context: AgentRunContext): Promise<string> {
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'engineer', workerName: 'check-state', status: 'running' });
  
  const prompt = `You are a DevOps engineer. Check the current state of the infrastructure or environment before making changes.
  
TASK:
${input.instruction}

Use run_shell_command to execute read-only commands (e.g. status checks, git status, etc.). Output a summary of the current state.`;

  const result = await runGeminiCLI(prompt, context.workingDir, context.taskId, context.bus, { yolo: true });
  
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'engineer', workerName: 'check-state', status: 'success' });
  return result.text;
}

export async function runApplyChanges(input: AgentInput, state: string, context: AgentRunContext): Promise<string> {
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'engineer', workerName: 'apply', status: 'running' });

  const prompt = `You are a DevOps engineer. Apply the infrastructure or configuration changes requested.
  
TASK:
${input.instruction}

CURRENT STATE:
${state}

CONSTRAINTS:
${input.constraints.join('\n')}

Use write_file and run_shell_command to safely apply the changes.`;

  const result = await runGeminiCLI(prompt, context.workingDir, context.taskId, context.bus, { yolo: true });
  
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'engineer', workerName: 'apply', status: 'success' });
  return result.text;
}

export async function runVerifyState(input: AgentInput, appliedChanges: string, context: AgentRunContext): Promise<string> {
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'engineer', workerName: 'verify', status: 'running' });

  const prompt = `You are a DevOps engineer. Verify that the recent infrastructure or configuration changes were successful.
  
TASK:
${input.instruction}

APPLIED CHANGES:
${appliedChanges}

Use run_shell_command to execute health checks and verify the system is stable. Output a final deployment report.`;

  const result = await runGeminiCLI(prompt, context.workingDir, context.taskId, context.bus, { yolo: true });
  
  context.bus.emit({ type: 'worker.progress', taskId: context.taskId, providerId: 'engineer', workerName: 'verify', status: 'success' });
  return result.text;
}
