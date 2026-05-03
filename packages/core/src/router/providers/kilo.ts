import OpenAI from 'openai';
import { XiaEventBus } from '@xia/core/src/event-bus';
import { SecretsStore } from '../../secrets';
import { TaskDomain } from '@xia/core/types';

export class KiloProvider {
  private client: OpenAI | null = null;
  private bus?: XiaEventBus;
  private apiKey: string;
  private orgId?: string;

  constructor(apiKey: string, orgId?: string, bus?: XiaEventBus) {
    this.apiKey = apiKey;
    this.orgId = orgId;
    this.bus = bus;
    this.initClient();
  }

  private initClient() {
    if (!this.apiKey) {
      throw new Error('KILO_API_KEY is missing from secrets.');
    }
    
    const options: any = {
      apiKey: this.apiKey,
      baseURL: 'https://api.kilo.ai/api/gateway',
    };
    
    if (this.orgId) {
      options.defaultHeaders = {
        'X-KiloCode-OrganizationId': this.orgId
      };
    }
    
    this.client = new OpenAI(options);
  }

  async generate(prompt: string): Promise<{ text: string, tokens: number, usd: number }> {
    const res = await this.call(prompt, 'task_' + Date.now());
    // Kilo Code docs don't specify pricing, we'll assume a flat rate or 0 for now
    // Actually, KiloGateway usage tracking: assuming $0.003 / 1k tokens for Claude 3.5 Sonnet
    const usd = (res.tokensUsed / 1000) * 0.003; 
    return { text: res.text, tokens: res.tokensUsed, usd };
  }

  async call(prompt: string, taskId: string): Promise<{ text: string, tokensUsed: number }> {
    if (!this.client) throw new Error('Kilo client failed to initialize');

    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      try {
        const stream = await this.client.chat.completions.create({
          model: 'anthropic/claude-sonnet-4-5', // Default Kilo proxy model, could be made configurable later
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          stream_options: { include_usage: true }
        });

        let fullText = '';
        let tokensUsed = 0;

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            if (this.bus) {
              this.bus.emit({
                type: 'agent.output',
                taskId,
                chunk: content
              });
            }
          }
          if (chunk.usage) {
             tokensUsed = chunk.usage.total_tokens || 0;
          }
        }

        return { text: fullText, tokensUsed };

      } catch (err: any) {
        if (err.status === 429 && retries < maxRetries) {
          retries++;
          const delayMs = Math.pow(2, retries) * 1000;
          console.warn(`[KiloProvider] 429 Rate Limit. Retrying in ${delayMs}ms (Attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          throw new Error(`KiloProvider failed: ${err.message}`);
        }
      }
    }
    
    throw new Error('KiloProvider failed: Max retries exceeded');
  }
}
