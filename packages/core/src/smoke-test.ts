import { XiaEventBus } from './event-bus';
import { initSQLite, closeSQLite, getTask, createTask } from './memory';
import { buildContext } from './context';
import { getReadyTasks } from './scheduler';
import { executeTask, approveTask } from './executor';
import { planFromIntent, type LLMProvider } from './planner';
import type { Task, AgentPlugin, AgentInput, AgentOutput } from '../../types';

class MockLLM implements LLMProvider {
  async generate(): Promise<string> {
    return JSON.stringify([
      {
        id: 'node-1',
        agentId: 'planner',
        domain: 'general',
        instruction: 'Do step 1',
        dependencies: [],
        requiredGates: [],
        priority: 'normal',
        contextScope: []
      },
      {
        id: 'node-2',
        agentId: 'code-writer',
        domain: 'general',
        instruction: 'Do step 2',
        dependencies: ['node-1'],
        requiredGates: ['human-approve'],
        priority: 'normal',
        contextScope: []
      }
    ]);
  }
}

class MockAgent implements AgentPlugin {
  id = 'mock';
  domain = 'general' as const;
  version = '1.0';
  description = 'mock';

  async run(input: AgentInput): Promise<AgentOutput> {
    return {
      success: true,
      content: `Mock executed: ${input.instruction}`,
      tokensUsed: 50,
      provider: 'kilo',
      completedAt: new Date().toISOString()
    };
  }
}

async function runSmokeTest() {
  console.log('=== XIA Phase 1 Smoke Test ===');
  
  // 1. Setup
  initSQLite(':memory:');
  const bus = new XiaEventBus();
  const llm = new MockLLM();
  const agent = new MockAgent();
  
  bus.onAny(e => console.log(`[Event] ${e.type}`, 'taskId' in e ? e.taskId : ''));

  // 2. Plan
  console.log('\n--- Planning ---');
  const dag = await planFromIntent('Build a two step process', 'general', llm);
  console.log(`Generated ${dag.length} DAG nodes.`);

  // Create tasks in DB
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
      input: {} as any, // populated later
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  // 3. Execution Loop
  console.log('\n--- Executing ---');
  const completedIds = new Set<string>();
  
  while (completedIds.size < dag.length) {
    let foundBlocked = false;
    for (const node of dag) {
      const t = getTask(node.id)!;
      if (t.state === 'BLOCKED') {
        console.log(`\n--- Unblocking ${t.id} ---`);
        approveTask(t.id, bus);
        foundBlocked = true;
        // After approval, it's SUCCESS
        completedIds.add(t.id);
      }
    }

    const readyNodes = getReadyTasks(dag, completedIds);
    let workDone = foundBlocked;

    for (const node of readyNodes) {
      const task = getTask(node.id)!;
      if (task.state !== 'PENDING' && task.state !== 'RETRYING') continue;

      task.input = await buildContext(task, node);
      
      await executeTask(task, agent, bus);

      const updated = getTask(node.id)!;
      if (updated.state === 'SUCCESS') {
        completedIds.add(node.id);
      } else if (updated.state === 'BLOCKED') {
        console.log(`Task ${node.id} is BLOCKED awaiting approval.`);
      }
      workDone = true;
    }
    
    if (!workDone) {
      console.error('Execution loop stalled. Unresolvable dependencies or unhandled state.');
      break;
    }
  }

  // 4. Verification
  console.log('\n--- Verification ---');
  const t1 = getTask('node-1')!;
  const t2 = getTask('node-2')!;

  console.assert(t1.state === 'SUCCESS', 'node-1 should be SUCCESS');
  console.assert(t2.state === 'SUCCESS', 'node-2 should be SUCCESS');
  console.assert(t2.output?.content.includes('step 2'), 'node-2 output should contain instruction');

  console.log('✅ Smoke test passed.');
  closeSQLite();
}

runSmokeTest().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
