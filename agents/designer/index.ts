import type { AgentPlugin, AgentInput, AgentOutput, AgentRunContext } from '@xia/core';
import { runInspect, runDesignSpec } from './workers';

export const DesignerAgent: AgentPlugin = {
  id: 'designer',
  domain: 'general',
  version: '2.0',
  description: 'Architectural designer. Produces technical specs.',
  
  async run(input: AgentInput, context: AgentRunContext): Promise<AgentOutput> {
    try {
      const inspection = await runInspect(input, context);
      const design = await runDesignSpec(input, inspection, context);

      return {
        success: true,
        content: design,
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
