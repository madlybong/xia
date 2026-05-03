import type { AgentPlugin, AgentInput, AgentOutput, AgentRunContext } from '@xia/core';
import { runCheckState, runApplyChanges, runVerifyState } from './workers';

export const EngineerAgent: AgentPlugin = {
  id: 'engineer',
  domain: 'general',
  version: '2.0',
  description: 'Infrastructure, configuration, deployment, environment validation.',
  
  async run(input: AgentInput, context: AgentRunContext): Promise<AgentOutput> {
    try {
      const state = await runCheckState(input, context);
      const applied = await runApplyChanges(input, state, context);
      const verified = await runVerifyState(input, applied, context);

      return {
        success: true,
        content: verified,
        tokensUsed: 0,
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
