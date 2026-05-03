import { runShellTask } from '@xia/core';

export async function runCompliance(workingDir: string): Promise<{ success: boolean; content: string }> {
  try {
    // Auruvi domain: simple regex compliance check for now
    const output = await runShellTask('grep -r -i "social_security_number\\|ssn\\|credit_card" . || echo "No PII found"', workingDir, 5000);
    
    if (output.stdout.includes('No PII found')) {
      return {
        success: true,
        content: 'Compliance check passed: No obvious PII patterns detected.'
      };
    } else {
      return {
        success: false,
        content: `Compliance check failed. PII patterns detected:\n${output.stdout}`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      content: `Compliance check execution failed:\n${err.message}`
    };
  }
}
