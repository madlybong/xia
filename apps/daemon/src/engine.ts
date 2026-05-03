import { listTasks, getTask, buildContext, executeTask, enqueueTask, loadConfig } from '@xia/core';
import type { XiaEventBus, AgentPlugin } from '@xia/core';
import { Worker } from 'bullmq';

export class OrchestratorEngine {
  private worker: Worker;

  constructor(
    private bus: XiaEventBus,
    private resolveAgent: (taskId: string) => AgentPlugin
  ) {
    const config = loadConfig();

    // The Worker processes jobs from BullMQ
    this.worker = new Worker('xia-tasks', async job => {
      const { taskId } = job.data;
      const task = getTask(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      // Reconstruct a minimal DAGNode for context builder
      const node: any = {
        id: task.id,
        domain: task.domain,
        contextScope: task.contextScope || [],
        workingDir: task.workingDir,
        instruction: task.input.instruction || ''
      };

      task.input = await buildContext(task, node);
      const agent = this.resolveAgent(task.id);
      
      const runContext = {
        taskId: task.id,
        bus: this.bus,
        workingDir: task.workingDir || process.cwd()
      };
      
      // We await the executeTask so BullMQ knows if it succeeds or fails
      await executeTask(task, agent, runContext as any);
      
    }, { connection: { url: config.redisUrl } });

    // When a task finishes successfully, see if we can enqueue any pending tasks
    this.bus.on('task.completed', () => this.enqueueReadyTasks());
  }

  async enqueueReadyTasks() {
    const allTasks = listTasks();
    const activeTasks = allTasks.filter(t => t.state === 'PENDING' || t.state === 'RETRYING');

    const tasksToEnqueue: Promise<any>[] = [];

    for (const task of activeTasks) {
      let ready = true;
      for (const depId of task.dependencies) {
        const dep = getTask(depId);
        if (!dep || dep.state !== 'SUCCESS') {
          ready = false;
          break;
        }
      }

      if (ready) {
        // Enqueue to BullMQ
        tasksToEnqueue.push(enqueueTask(task.id, 0, task.maxRetries));
      }
    }
    
    await Promise.all(tasksToEnqueue);
  }

  // Graceful shutdown
  async stop() {
    await this.worker.close();
  }
}

