import type { TaskDomain, AIProvider } from '@xia/core';
import type { LLMProvider } from '@xia/core';
import { budgetEngine } from '../budget/index';
import { secretsStore } from '../secrets/index';
import { XiaEventBus } from '@xia/core';
import { AntigravityProvider } from './providers/antigravity';
import { KiloProvider } from './providers/kilo';
import { OllamaProvider } from './providers/ollama';

export class AIRouter implements LLMProvider {
  private antigravity?: AntigravityProvider;
  private kilo?: KiloProvider;
  private ollama?: OllamaProvider;

  constructor(
    private defaultProvider: AIProvider,
    private domain: TaskDomain,
    private bus?: XiaEventBus
  ) {
    const secrets = secretsStore.resolveAll(domain);
    if (secrets.antigravityKey) this.antigravity = new AntigravityProvider(secrets.antigravityKey);
    if (secrets.kiloKey) this.kilo = new KiloProvider(secrets.kiloKey, secrets.kiloOrgId, this.bus);
  }

  async generate(prompt: string): Promise<string> {
    return this.route(this.defaultProvider, prompt);
  }

  async route(provider: AIProvider, prompt: string): Promise<string> {
    // 1. Check budget
    const budgetStatus = budgetEngine.check(provider, this.domain, this.bus);
    if (budgetStatus === 'paused' || budgetStatus === 'hard-stop') {
      throw new Error(`BudgetExceeded: Cannot route to ${provider} for domain ${this.domain}. Status: ${budgetStatus}`);
    }

    // 2. Dispatch
    let result: { text: string, tokens: number, usd: number };
    
    if (provider === 'antigravity') {
      if (!this.antigravity) throw new Error('Antigravity API key missing');
      result = await this.antigravity.generate(prompt);
    } else if (provider === 'kilo') {
      if (!this.kilo) throw new Error('Kilo API key missing');
      result = await this.kilo.generate(prompt);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // 3. Record Spend
    budgetEngine.record(provider, this.domain, result.tokens, result.usd);

    return result.text;
  }
}
