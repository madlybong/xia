import { GoogleGenAI } from '@google/genai';

export class AntigravityProvider {
  private ai: GoogleGenAI;

  // Assuming $0.15 per 1M tokens for Gemini 2.5 Flash
  private USD_PER_TOKEN = 0.15 / 1000000;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(prompt: string): Promise<{ text: string, tokens: number, usd: number }> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    // Fallback token estimation if usage metadata is missing
    const tokens = response.usageMetadata?.totalTokenCount || Math.ceil(prompt.length / 4);
    
    return {
      text: response.text || '',
      tokens,
      usd: tokens * this.USD_PER_TOKEN
    };
  }
}
