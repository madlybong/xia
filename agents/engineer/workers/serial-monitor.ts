import { runShellTask } from '@xia/core';

export async function runSerialMonitor(workingDir: string): Promise<{ success: boolean; content: string }> {
  try {
    // IoT domain placeholder: reads from a mock serial port
    const output = await runShellTask('echo "Mock serial telemetry: Temp=22C, Hum=45%"', workingDir, 2000);
    return {
      success: true,
      content: `Serial monitor readings:\n${output.stdout}`
    };
  } catch (err: any) {
    return {
      success: false,
      content: `Serial monitor failed:\n${err.message}`
    };
  }
}
