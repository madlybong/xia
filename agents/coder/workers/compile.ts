import { runShellTask } from '@xia/core';

export async function runCompile(workingDir: string): Promise<{ success: boolean; content: string }> {
  try {
    // We assume the project has a build script or tsc available
    const output = await runShellTask('bun run build', workingDir, 10000);
    return {
      success: true,
      content: `Compile successful:\n${output.stdout}`
    };
  } catch (err: any) {
    // Fallback to tsc if bun run build fails
    try {
      const output = await runShellTask('tsc --noEmit', workingDir, 10000);
      return {
        success: true,
        content: `Compile successful:\n${output.stdout}`
      };
    } catch (fallbackErr: any) {
      return {
        success: false,
        content: `Compile failed:\n${err.message}\n${fallbackErr.message}`
      };
    }
  }
}
