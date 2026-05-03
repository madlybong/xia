import { test, expect } from 'bun:test';
import { planFromIntent, PlannerPromptBuilder, LLMProvider, PlannerError } from './index';

class StubLLM implements LLMProvider {
  constructor(public responsePayload: string, public secondAttemptPayload?: string) {}

  private attempt = 1;

  async generate(prompt: string): Promise<string> {
    if (this.attempt === 1) {
      this.attempt++;
      return this.responsePayload;
    }
    return this.secondAttemptPayload || this.responsePayload;
  }
}

test('PlannerPromptBuilder generates correctly', () => {
  const builder = new PlannerPromptBuilder();
  const prompt = builder.build('Build a login page', 'general', [{ id: '1', content: 'Use JWT', score: 0.9, domain: 'general', tags: [], createdAt: 0 }], ['No raw HTML']);
  
  expect(prompt).toContain('Build a login page');
  expect(prompt).toContain('No raw HTML');
  expect(prompt).toContain('Use JWT');
});

test('planFromIntent handles valid JSON', async () => {
  const validJson = JSON.stringify([
    {
      id: 'task-1',
      agentId: 'code-writer',
      domain: 'general',
      instruction: 'Write code',
      dependencies: [],
      requiredGates: [],
      priority: 'normal',
      contextScope: ['auth']
    }
  ]);

  const llm = new StubLLM(validJson);
  const dag = await planFromIntent('Build login', 'general', llm);
  
  expect(dag.length).toBe(1);
  expect(dag[0].id).toBe('task-1');
  expect(dag[0].agentId).toBe('code-writer');
});

test('planFromIntent strips markdown and parses', async () => {
  const markdownJson = `\`\`\`json\n[
    {
      "id": "task-1",
      "agentId": "code-writer",
      "domain": "general",
      "instruction": "Write code",
      "dependencies": [],
      "requiredGates": [],
      "priority": "normal",
      "contextScope": []
    }
  ]\n\`\`\``;

  const llm = new StubLLM(markdownJson);
  const dag = await planFromIntent('Build login', 'general', llm);
  
  expect(dag.length).toBe(1);
});

test('planFromIntent retries on invalid JSON', async () => {
  const invalidJson = `{"this": "is not an array"}`;
  const validJson = JSON.stringify([
    {
      id: 'task-1',
      agentId: 'code-writer',
      domain: 'general',
      instruction: 'Write code',
      dependencies: [],
      requiredGates: [],
      priority: 'normal',
      contextScope: []
    }
  ]);

  const llm = new StubLLM(invalidJson, validJson);
  const dag = await planFromIntent('Build login', 'general', llm);
  
  expect(dag.length).toBe(1);
});

test('planFromIntent throws after 2 failures', async () => {
  const invalidJson = `bad json`;
  const llm = new StubLLM(invalidJson, invalidJson);
  
  expect(planFromIntent('Build login', 'general', llm)).rejects.toThrow(PlannerError);
});

test('planFromIntent validates DAG semantic structure', async () => {
  const missingDepJson = JSON.stringify([
    {
      id: 'task-1',
      agentId: 'code-writer',
      domain: 'general',
      instruction: 'Write code',
      dependencies: ['task-2'], // task-2 doesn't exist
      requiredGates: [],
      priority: 'normal',
      contextScope: []
    }
  ]);

  // It will fail once, then second attempt gets same missingDepJson -> fails again
  const llm = new StubLLM(missingDepJson);
  
  expect(planFromIntent('Build login', 'general', llm)).rejects.toThrow(/Failed to generate valid DAG/);
});
