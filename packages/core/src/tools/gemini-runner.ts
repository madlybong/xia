import { spawn } from 'node:child_process';
import type { XiaEventBus } from '../event-bus';

export interface GeminiRunnerResult {
  text: string;
  tokensUsed: number;
}

/**
 * Runs the official Gemini CLI in headless mode.
 * Captures JSONL streaming output and emits it to the XIA EventBus.
 */
export async function runGeminiCLI(
  prompt: string,
  cwd: string,
  taskId: string,
  bus: XiaEventBus,
  options: { yolo?: boolean } = {}
): Promise<GeminiRunnerResult> {
  return new Promise((resolve, reject) => {
    // Determine CLI arguments
    const args = ['-p', prompt, '--output-format', 'json-stream'];
    if (options.yolo !== false) {
      args.push('--yolo'); // Auto-confirm tool executions
    }

    // Set up the environment for the subprocess
    // Re-use ANTIGRAVITY_API_KEY as GEMINI_API_KEY
    const env = {
      ...process.env,
      GEMINI_API_KEY: process.env.ANTIGRAVITY_API_KEY || process.env.GEMINI_API_KEY,
    };

    const proc = spawn('gemini', args, { cwd, env });

    let finalOutput = '';
    let totalTokens = 0;

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          
          if (event.type === 'message' && event.role === 'model') {
            finalOutput += event.content;
            bus.emit({
              type: 'agent.output',
              agentId: 'gemini-cli',
              taskId,
              chunk: event.content,
              timestamp: Date.now(),
            });
          }

          if (event.type === 'tool_use') {
            bus.emit({
              type: 'agent.output',
              agentId: 'gemini-cli',
              taskId,
              chunk: `\n[Tool Executing: ${event.name}]\n`,
              timestamp: Date.now(),
            });
          }

          if (event.type === 'result') {
            totalTokens = event.stats?.totalTokens || 0;
          }
        } catch (e) {
          // Non-JSON output or incomplete chunks, ignore or handle if needed
        }
      }
    });

    proc.stderr.on('data', (data) => {
      // Stream stderr as output but formatted
      bus.emit({
        type: 'agent.output',
        agentId: 'gemini-cli',
        taskId,
        chunk: `[STDERR: ${data.toString()}]`,
        timestamp: Date.now(),
      });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ text: finalOutput, tokensUsed: totalTokens });
      } else {
        reject(new Error(`Gemini CLI exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Gemini CLI: ${err.message}`));
    });
  });
}
