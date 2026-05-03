import type { AgentPlugin, AgentInput, AgentOutput, AgentRunContext } from '@xia/core';
import { runReadCodebase, runCodeWriter } from './workers';

export const CoderAgent: AgentPlugin = {
  id: 'coder',
  domain: 'general',
  version: '2.0',
  description: 'Primary implementation agent. Writes and tests code.',
  
  async run(input: AgentInput, context: AgentRunContext): Promise<AgentOutput> {
    try {
      // Step 1: Analyze codebase
      const analysis = await runReadCodebase(input, context);

      // Step 2: Write code
      const implementation = await runCodeWriter(input, analysis, context);

      return {
        success: true,
        content: implementation,
        tokensUsed: 0, // In accurate implementation, we'd sum this
        provider: 'gemini-cli',
        completedAt: new Date().toISOString()
      };
    } catch (e: any) {
      return {
        success: false,
        content: e.message,
        tokensUsed: 0,
        provider: 'gemini-cli',
        completedAt: new Date().toISOString()
      };
    }
  }
};
