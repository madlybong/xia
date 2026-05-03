import type { XiaEventBus } from '@xia/core';

export class OllamaProvider {
  private apiUrl: string;
  private model: string;
  private bus: XiaEventBus;

  constructor(bus: XiaEventBus) {
    this.apiUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2';
    this.bus = bus;
  }

  async generate(prompt: string, taskId?: string): Promise<string> {
    if (taskId) {
      this.bus.emit({ type: 'agent.output', taskId, content: '[Ollama: generating completion...]' });
    }

    const res = await fetch(`${this.apiUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false
      })
    });

    if (!res.ok) {
      throw new Error(`Ollama generation failed: ${res.statusText}`);
    }

    const data = await res.json();
    return data.response;
  }
}
