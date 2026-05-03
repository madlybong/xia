#!/usr/bin/env bun
import { Command } from 'commander';
import { startDaemon } from '../apps/daemon/src/index';
import { runInit } from './commands/init';
import { runDoctor } from './commands/doctor';
import { runService } from './commands/service';

const program = new Command();
const API_URL = process.env.XIA_DAEMON_URL || 'http://localhost:3000';

program
  .name('xia')
  .description('XIA Autonomous Development Infrastructure')
  .version('1.0.0');

program.command('daemon')
  .description('Start the XIA background daemon')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('--bg', 'Run in background (placeholder)')
  .action((options) => {
    startDaemon(parseInt(options.port, 10));
  });

program.command('run')
  .description('Run a new DAG from a natural language intent')
  .argument('<intent>', 'The intent to execute')
  .option('-d, --domain <domain>', 'Domain config to use', 'general')
  .option('-p, --provider <provider>', 'AI provider to use', 'kilo')
  .action(async (intent, options) => {
    try {
      const res = await fetch(`${API_URL}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, domain: options.domain, provider: options.provider })
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Error:', data.error);
        process.exit(1);
      }
      console.log(`✅ Run queued successfully! Generated ${data.dagNodes} tasks.`);
      console.log(`Run 'xia monitor' to watch events, or 'xia tasks' to check status.`);
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('tasks')
  .description('List all tasks')
  .action(async () => {
    try {
      const res = await fetch(`${API_URL}/tasks`);
      const tasks = await res.json() as any[];
      if (tasks.length === 0) {
         console.log('No tasks found.');
         return;
      }
      console.table(tasks.map(t => ({ id: t.id, state: t.state, retries: t.retries, agent: t.agentId })));
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('status')
  .description('Get status of a specific task')
  .argument('<taskId>', 'Task ID')
  .action(async (taskId) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}`);
      if (!res.ok) {
        console.error('Task not found');
        return;
      }
      const task = await res.json();
      console.log(JSON.stringify(task, null, 2));
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('approve')
  .description('Approve a blocked task')
  .argument('<taskId>', 'Task ID')
  .action(async (taskId) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        console.log(`✅ Task ${taskId} approved!`);
      } else {
        console.error(`❌ Failed to approve task ${taskId}. It may not be in BLOCKED state.`);
      }
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('reject')
  .description('Reject a blocked task')
  .argument('<taskId>', 'Task ID')
  .argument('[feedback]', 'Feedback for rejection')
  .action(async (taskId, feedback) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedback || 'Rejected via CLI' })
      });
      const data = await res.json();
      if (data.success) {
        console.log(`✅ Task ${taskId} rejected.`);
      } else {
        console.error(`❌ Failed to reject task ${taskId}.`);
      }
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('cancel')
  .description('Cancel a task (marks as ABANDONED)')
  .argument('<taskId>', 'Task ID')
  .action(async (taskId) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        console.log(`✅ Task ${taskId} cancelled.`);
      } else {
        console.error(`❌ Failed to cancel task ${taskId}: ${data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('budget')
  .description('View budget snapshot')
  .action(async () => {
    try {
      const res = await fetch(`${API_URL}/budget`);
      const data = await res.json();
      console.log('--- Budget Snapshot ---');
      console.log(JSON.stringify(data, null, 2));
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('logs')
  .description('View logs for a task')
  .argument('<taskId>', 'Task ID')
  .action(async (taskId) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}`);
      if (!res.ok) {
        console.error('Task not found');
        return;
      }
      const task = await res.json();
      console.log(`--- Logs for ${taskId} ---`);
      console.log(task.output?.content || 'No output available');
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('secret')
  .description('Manage secrets')
  .command('set <keyValue>')
  .description('Set a runtime secret override (e.g. KEY=value)')
  .option('-s, --scope <scope>', 'Domain scope (optional)')
  .action(async (keyValue, options) => {
    const [key, ...rest] = keyValue.split('=');
    const value = rest.join('=');
    if (!key || !value) {
      console.error('Invalid format. Use KEY=value');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, scope: options.scope })
      });
      const data = await res.json();
      if (data.success) {
        console.log(`✅ Secret ${key} set successfully${options.scope ? ` for scope ${options.scope}` : ''}.`);
      } else {
        console.error(`❌ Failed to set secret: ${data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      console.error('Failed to connect to XIA daemon:', e.message);
    }
  });

program.command('monitor')
  .description('Stream events from the XIA daemon')
  .action(async () => {
    console.log(`Connecting to ${API_URL}/events ...`);
    try {
      const res = await fetch(`${API_URL}/events`);
      if (!res.body) {
        console.error('No response body');
        return;
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      console.log('Connected! Listening for events...');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        
        const lines = chunk.split('\n');
        let currentEvent = '';
        let currentData = '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) currentEvent = line.substring(7);
          if (line.startsWith('data: ')) {
            currentData = line.substring(6);
            if (currentEvent && currentEvent !== 'ping') {
              try {
                const dataObj = JSON.parse(currentData);
                console.log(`[${currentEvent}]`, dataObj.taskId || '');
              } catch (e) {
                 console.log(`[${currentEvent}]`, currentData);
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.error('Connection closed:', e.message);
    }
  });

program.command('init')
  .description('First-time setup wizard')
  .action(async () => {
    await runInit();
  });

program.command('doctor')
  .description('Health check for XIA infrastructure')
  .action(async () => {
    await runDoctor();
  });

program.command('service')
  .description('Manage XIA as a background service')
  .argument('<subcommand>', 'start, stop, status, install, uninstall')
  .action(async (subcommand) => {
    await runService(subcommand);
  });

program.command('dashboard')
  .description('Open the web dashboard')
  .action(async () => {
    console.log('Opening dashboard at http://localhost:3000');
    // Simple placeholder to open browser
  });

program.command('update')
  .description('Update XIA to latest version')
  .action(async () => {
    console.log('Update feature coming soon');
  });

program.parse(process.argv);
