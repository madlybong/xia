import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { serveStatic } from 'hono/bun';
import { EventEmitter } from 'node:events';
import { 
  initSQLite, getTask, listTasks, 
  XiaEventBus, planFromIntent, approveTask, rejectTask, createTask, updateTask,
  type AgentPlugin,
  type AgentInput,
  type AgentOutput,
  sendFatal,
  loadConfig,
  AIRouter,
  secretsStore,
  budgetEngine,
  cancelTask,
  queryMemory,
  qdrantClient
} from '@xia/core';
import { OrchestratorEngine } from './engine';
import { CoderAgent } from '../../../agents/coder';
import { DesignerAgent } from '../../../agents/designer';
import { EngineerAgent } from '../../../agents/engineer';

const app = new Hono();
app.use('*', cors());
const bus = new XiaEventBus();
const sseEmitter = new EventEmitter();

// Forward all XiaEvents to SSE subscribers
bus.onAny((event) => {
  sseEmitter.emit('xia-event', event);
});

// Initialize core services
initSQLite();
secretsStore.loadFromDisk();

// Handle fatal errors
process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err);
  bus.emit({ type: 'system.fatal', error: err.message, stack: err.stack });
});

bus.on('system.fatal', async (event: any) => {
  await sendFatal(`System fatal error: ${event.error}\n${event.stack || ''}`);
});

// Simple agent registry mapping
const agentRegistry = (taskId: string): AgentPlugin => {
  const task = getTask(taskId);
  const domain = task?.domain || 'general';
  const agentId = task?.agentId || 'generic';
  
  if (agentId === 'coder') return { ...CoderAgent, domain };
  if (agentId === 'designer') return { ...DesignerAgent, domain };
  if (agentId === 'engineer') return { ...EngineerAgent, domain };
  
  return {
    id: agentId,
    domain,
    version: '1.0',
    description: 'Dynamic Router Agent',
    async run(input: AgentInput): Promise<AgentOutput> {
      const router = new AIRouter('kilo', domain, bus); // Default to kilo
      const text = await router.generate(input.instruction);
      return {
        success: true,
        content: text,
        tokensUsed: Math.ceil(text.length / 4), // Estimated
        provider: 'kilo',
        completedAt: new Date().toISOString()
      };
    }
  };
};

const engine = new OrchestratorEngine(bus, agentRegistry);

app.get('/health', (c) => {
  return c.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/events', (c) => {
  return streamSSE(c, async (stream) => {
    const listener = (event: any) => {
      stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
      });
    };
    sseEmitter.on('xia-event', listener);
    
    stream.onAbort(() => {
      sseEmitter.off('xia-event', listener);
    });

    while (true) {
      await stream.sleep(15000);
      await stream.writeSSE({ event: 'ping', data: 'keep-alive' });
    }
  });
});

app.post('/run', async (c) => {
  const body = await c.req.json();
  const intent = body.intent;
  const domain = body.domain || 'general';
  const provider = body.provider || 'kilo';

  if (!intent) return c.json({ error: 'Missing intent' }, 400);

  try {
    let domain = body.domain;
    const router = new AIRouter(provider, domain || 'general', bus);
    
    if (!domain || domain === 'auto' || domain === 'general') {
      const classification = await router.generate(`Classify the following task intent into a single word domain (e.g. 'web', 'backend', 'hardware', 'design', 'general'). Return ONLY the single word domain in lowercase. INTENT: ${intent}`);
      domain = classification.trim().toLowerCase().replace(/[^a-z]/g, '');
      if (!domain) domain = 'general';
    }

    const config = loadConfig();
    const projectConfig = config.projects[domain] || { path: process.cwd(), constitution: [] };
    const workingDir = projectConfig.path;

    const dag = await planFromIntent(intent, domain, router);
    
    for (const node of dag) {
      createTask({
        id: node.id,
        agentId: node.agentId,
        domain: node.domain,
        state: 'PENDING',
        dependencies: node.dependencies,
        requiredGates: node.requiredGates,
        retries: 0,
        maxRetries: 3,
        priority: node.priority,
        contextScope: node.contextScope,
        workingDir: workingDir,
        input: {
          instruction: node.instruction,
          memory: [],
          dependencyOutputs: {},
          constraints: projectConfig.constitution || [],
          masked: true,
          estimatedTokens: Math.ceil(node.instruction.length / 4)
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // Trigger engine evaluation
    await engine.enqueueReadyTasks();

    return c.json({ status: 'queued', dagNodes: dag.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/tasks', (c) => {
  return c.json(listTasks());
});

app.get('/tasks/:taskId', (c) => {
  const t = getTask(c.req.param('taskId'));
  if (!t) return c.json({ error: 'Not found' }, 404);
  return c.json(t);
});

app.post('/tasks/:taskId/cancel', async (c) => {
  const ok = cancelTask(c.req.param('taskId'), bus);
  return c.json({ success: ok, error: ok ? undefined : 'Cannot cancel task in current state' });
});

app.get('/memory', async (c) => {
  const domain = c.req.query('domain') || 'general';
  const query = c.req.query('query') || '';
  try {
    const results = await queryMemory(domain, query);
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete('/memory/:id', async (c) => {
  try {
    const domain = c.req.query('domain') || 'general';
    await qdrantClient.delete(domain, {
      points: [c.req.param('id')]
    });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/tasks/:taskId/approve', async (c) => {
  const ok = approveTask(c.req.param('taskId'), bus);
  if (ok) await engine.enqueueReadyTasks(); // re-eval
  return c.json({ success: ok });
});

app.post('/tasks/:taskId/reject', async (c) => {
  const body = await c.req.json().catch(() => ({ feedback: 'Rejected via API' }));
  const ok = rejectTask(c.req.param('taskId'), body.feedback || 'Rejected', bus);
  if (ok) await engine.enqueueReadyTasks();
  return c.json({ success: ok });
});

app.get('/budget', (c) => {
  return c.json(budgetEngine.snapshot());
});

app.post('/secret', async (c) => {
  const body = await c.req.json();
  if (!body.key || !body.value) return c.json({ error: 'Missing key or value' }, 400);
  secretsStore.set(body.key, body.value, body.scope);
  return c.json({ success: true });
});

// Serve web dashboard
app.use('/*', serveStatic({ root: '../web/dist' }));

export function startDaemon(port: number = parseInt(process.env.PORT || '3000', 10)) {
  console.log(`Starting XIA daemon on port ${port}...`);
  return Bun.serve({
    port,
    fetch: app.fetch,
  });
}
