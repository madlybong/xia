import { Queue, Worker, Job } from 'bullmq';
import { loadConfig } from '../config/index';

const config = loadConfig();

const connection = {
  url: config.redisUrl,
};

export const taskQueue = new Queue('xia-tasks', { connection });

export async function enqueueTask(taskId: string, priority: number = 0, maxRetries: number = 3) {
  await taskQueue.add('execute-task', { taskId }, { 
    jobId: taskId,
    priority,
    attempts: maxRetries,
    removeOnComplete: true,
    removeOnFail: false
  });
}
