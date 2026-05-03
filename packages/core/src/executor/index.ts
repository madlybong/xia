import type { Task, AgentPlugin, AgentOutput, AgentRunContext } from '../../types';
import type { XiaEventBus } from '../event-bus';
import { updateTask, appendLog, getTask, storeMemory } from '../memory';

export const TOKEN_WARNING_THRESHOLD = 30000;

export async function executeTask(
  task: Task,
  agent: AgentPlugin,
  context: AgentRunContext
): Promise<void> {
  const bus = context.bus;
  // Pre-flight checks
  if (!task.input.masked) {
    const err = 'Refusing to execute: Input data is not masked.';
    appendLog(task.id, `ERROR: ${err}`);
    failTask(task, err, bus);
    return;
  }

  if (task.input.estimatedTokens > TOKEN_WARNING_THRESHOLD) {
    const warn = `WARNING: Estimated tokens (${task.input.estimatedTokens}) exceed threshold.`;
    appendLog(task.id, warn);
    console.warn(warn);
  }

  // Update state to RUNNING
  task.state = 'RUNNING';
  task.updatedAt = Date.now();
  updateTask(task);
  bus.emit({ type: 'task.started', taskId: task.id, agentId: agent.id });
  appendLog(task.id, `Started agent: ${agent.id}`);

  try {
    // Dispatch to agent
    const output = await agent.run(task.input, context);

    if (!output.success) {
      throw new Error(output.content || 'Agent reported failure without details.');
    }

    task.output = output;
    
    // Domain-aware gate worker dispatch
    if (task.requiredGates.includes('compile')) {
      const { runCompile } = await import('../../../../agents/coder/workers/compile');
      const compileRes = await runCompile(task.workingDir || process.cwd());
      appendLog(task.id, compileRes.content);
      if (!compileRes.success) {
        throw new Error(`Compile gate failed: ${compileRes.content}`);
      }
    }

    if (task.requiredGates.includes('benchmark')) {
      const { runProfiler } = await import('../../../../agents/engineer/workers/profiler');
      const profilerRes = await runProfiler(task.workingDir || process.cwd());
      appendLog(task.id, profilerRes.content);
      if (!profilerRes.success) {
        throw new Error(`Benchmark gate failed: ${profilerRes.content}`);
      }
    }

    if (task.requiredGates.includes('compliance-review')) {
      const { runCompliance } = await import('../../../../agents/engineer/workers/compliance');
      const complianceRes = await runCompliance(task.workingDir || process.cwd());
      appendLog(task.id, complianceRes.content);
      if (!complianceRes.success) {
        throw new Error(`Compliance review gate failed: ${complianceRes.content}`);
      }
    }

    // Human Gate enforcement
    if (task.requiredGates.includes('human-approve')) {
      task.state = 'BLOCKED';
      task.updatedAt = Date.now();
      updateTask(task);
      appendLog(task.id, `Task BLOCKED awaiting human approval.`);
      bus.emit({ type: 'task.blocked', taskId: task.id, reason: 'human-approve gate', blockedAt: task.updatedAt });
      return;
    }

    // Success
    task.state = 'SUCCESS';
    task.updatedAt = Date.now();
    updateTask(task);
    appendLog(task.id, `Task completed successfully.`);
    
    // Auto-store agent output to Qdrant long-term memory
    storeMemory(task.domain, output.content, [task.agentId, task.id])
      .then(() => bus.emit({ type: 'memory.written', domain: task.domain, summary: output.content.slice(0, 200) }))
      .catch(err => console.warn('[executor] Memory write failed (non-fatal):', err.message));
    
    bus.emit({ type: 'task.completed', taskId: task.id, output: task.output });

  } catch (err: any) {
    const errorMsg = err.message || String(err);
    appendLog(task.id, `Agent error: ${errorMsg}`);
    failTask(task, errorMsg, bus);
  }
}

function failTask(task: Task, errorMsg: string, bus: XiaEventBus) {
  task.retries++;
  task.lastError = errorMsg;

  if (task.retries > task.maxRetries) {
    task.state = 'ABANDONED';
    task.updatedAt = Date.now();
    updateTask(task);
    appendLog(task.id, `Task ABANDONED after ${task.retries - 1} retries. Final error: ${errorMsg}`);
    bus.emit({ type: 'task.abandoned', taskId: task.id, finalError: errorMsg });
  } else {
    task.state = 'RETRYING';
    task.updatedAt = Date.now();
    updateTask(task);
    appendLog(task.id, `Task failed, queuing for retry (${task.retries}/${task.maxRetries}).`);
    bus.emit({ type: 'task.failed', taskId: task.id, error: errorMsg, retriesLeft: task.maxRetries - task.retries });
  }
}

export function approveTask(taskId: string, bus: XiaEventBus): boolean {
  const task = getTask(taskId);
  if (!task) return false;
  
  if (task.state !== 'BLOCKED') {
    return false;
  }

  task.state = 'SUCCESS';
  task.updatedAt = Date.now();
  updateTask(task);
  appendLog(task.id, `Task manually approved by human.`);
  
  if (task.output) {
    storeMemory(task.domain, task.output.content, [task.agentId, task.id]).then(() => {
      bus.emit({ type: 'memory.written', domain: task.domain, summary: task.output!.content.slice(0, 200) });
    }).catch(console.error);
  }

  bus.emit({ type: 'task.completed', taskId: task.id, output: task.output! });
  return true;
}

export function rejectTask(taskId: string, feedback: string, bus: XiaEventBus): boolean {
  const task = getTask(taskId);
  if (!task) return false;
  
  if (task.state !== 'BLOCKED') {
    return false;
  }

  appendLog(task.id, `Task rejected by human. Feedback: ${feedback}`);
  failTask(task, `Human rejection: ${feedback}`, bus);
  return true;
}

export function cancelTask(taskId: string, bus: XiaEventBus): boolean {
  const task = getTask(taskId);
  if (!task) return false;
  
  if (task.state === 'SUCCESS' || task.state === 'ABANDONED') {
    return false;
  }

  task.state = 'ABANDONED';
  task.updatedAt = Date.now();
  updateTask(task);
  appendLog(task.id, `Task cancelled by user.`);
  bus.emit({ type: 'task.abandoned', taskId: task.id, finalError: 'Cancelled by user' });
  return true;
}
