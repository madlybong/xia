import { runShellTask } from '@xia/core';

export async function runProfiler(workingDir: string): Promise<{ success: boolean; content: string }> {
  try {
    // Hermes domain: runs hyperfine or perf
    const output = await runShellTask('hyperfine "bun run start" --runs 3', workingDir, 30000);
    return {
      success: true,
      content: `Profiler results:\n${output.stdout}`
    };
  } catch (err: any) {
    return {
      success: false,
      content: `Profiler failed:\n${err.message}`
    };
  }
}
