import { spawn } from 'node:child_process';
import type { XiaEventBus } from '../event-bus';

export interface ShellTaskDef {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  captureStderr?: boolean;
}

export async function runShellTask(
  def: ShellTaskDef,
  taskId: string,
  bus: XiaEventBus,
  agentId = 'shell'
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(def.command, def.args, { cwd: def.cwd, env: process.env });

    let stdout = '';
    let stderr = '';

    const timeout = def.timeoutMs ? setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Shell task timed out after ${def.timeoutMs}ms`));
    }, def.timeoutMs) : null;

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      bus.emit({
        type: 'agent.output',
        agentId,
        taskId,
        chunk,
        timestamp: Date.now()
      });
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (def.captureStderr) {
        bus.emit({
          type: 'agent.output',
          agentId,
          taskId,
          chunk: `[STDERR] ${chunk}`,
          timestamp: Date.now()
        });
      }
    });

    proc.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });

    proc.on('error', (err) => {
      if (timeout) clearTimeout(timeout);
      reject(err);
    });
  });
}
