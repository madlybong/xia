import { Telegraf } from 'telegraf';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { transcribeVoice } from './voice';
import { getSecretsDir } from '@xia/core';

// Simple env loader since we are a separate process
function loadEnv() {
  const file = join(getSecretsDir(), 'global.env');
  if (existsSync(file)) {
    const lines = readFileSync(file, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        if (!process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
      }
    }
  }
}
loadEnv();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = parseInt(process.env.TELEGRAM_OWNER_ID || '0', 10);
const DAEMON_URL = process.env.XIA_DAEMON_URL || 'http://localhost:3000';

if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN missing. Exiting.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// 3.2 Auth & Whitelist Middleware
bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.from.id !== OWNER_ID) {
    console.warn(`Unauthorized access attempt from ${ctx.from?.id}`);
    return;
  }
  await next();
});

bot.start((ctx) => ctx.reply('XIA Orchestrator is online. Send me an intent to run a task.'));

bot.command('tasks', async (ctx) => {
  try {
    const res = await fetch(`${DAEMON_URL}/tasks`);
    const tasks = await res.json() as any[];
    if (tasks.length === 0) {
      return ctx.reply('No tasks found.');
    }
    const msg = tasks.map(t => `${t.id}: ${t.state} (${t.agentId})`).join('\n');
    ctx.reply(`Tasks:\n${msg}`);
  } catch (err: any) {
    ctx.reply(`Error connecting to daemon: ${err.message}`);
  }
});

bot.command('status', async (ctx) => {
  // Alias for tasks
  return ctx.reply('Use /tasks to see all tasks');
});

bot.command('budget', async (ctx) => {
  try {
    const res = await fetch(`${DAEMON_URL}/budget`);
    const data = await res.json();
    ctx.reply(`Budget Snapshot:\n<pre>${JSON.stringify(data, null, 2)}</pre>`, { parse_mode: 'HTML' });
  } catch (err: any) {
    ctx.reply(`Error connecting to daemon: ${err.message}`);
  }
});

bot.command('cancel', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  if (parts.length < 2) return ctx.reply('Usage: /cancel <taskId>');
  const taskId = parts[1];
  try {
    const res = await fetch(`${DAEMON_URL}/tasks/${taskId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      ctx.reply(`✅ Task ${taskId} cancelled.`);
    } else {
      ctx.reply(`❌ Failed to cancel task ${taskId}.`);
    }
  } catch (err: any) {
    ctx.reply(`Error: ${err.message}`);
  }
});

// Any text message is treated as an intent
bot.on('text', async (ctx) => {
  const intent = ctx.message.text;
  
  if (intent.startsWith('/')) return; // ignore other commands
  
  try {
    const res = await fetch(`${DAEMON_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, domain: 'general', provider: 'kilo' })
    });
    const data = await res.json();
    if (!res.ok) {
      return ctx.reply(`Error queueing run: ${data.error}`);
    }
    ctx.reply(`✅ Run queued successfully! Generated ${data.dagNodes} tasks.`);
  } catch (err: any) {
    ctx.reply(`Error connecting to daemon: ${err.message}`);
  }
});

// 3.3 Voice Processing
bot.on('voice', async (ctx) => {
  const voice = ctx.message.voice;
  try {
    const link = await ctx.telegram.getFileLink(voice.file_id);
    await ctx.reply('🎙️ Voice received. Transcribing with Gemini...');
    
    // Real STT hook
    const intent = await transcribeVoice(link.toString()); 
    await ctx.reply(`🎙️ Got it: '${intent}'. Starting...`);
    
    const res = await fetch(`${DAEMON_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, domain: 'general', provider: 'kilo' })
    });
    const data = await res.json();
    if (!res.ok) {
      return ctx.reply(`Error queueing run: ${data.error}`);
    }
    ctx.reply(`✅ Voice command queued! Generated ${data.dagNodes} tasks.`);
  } catch (err: any) {
    ctx.reply(`Error processing voice: ${err.message}`);
  }
});

// Inline callbacks for Approval Gates
bot.on('callback_query', async (ctx) => {
  // We use format `approve:taskId` or `reject:taskId`
  const data = (ctx.callbackQuery as any).data;
  if (!data) return;

  const [action, taskId] = data.split(':');
  
  try {
    if (action === 'approve') {
      const res = await fetch(`${DAEMON_URL}/tasks/${taskId}/approve`, { method: 'POST' });
      const out = await res.json();
      if (out.success) {
        await ctx.editMessageText(`✅ Task ${taskId} approved.`);
      } else {
        await ctx.answerCbQuery(`Failed to approve task ${taskId}`);
      }
    } else if (action === 'reject') {
      const res = await fetch(`${DAEMON_URL}/tasks/${taskId}/reject`, { method: 'POST' });
      const out = await res.json();
      if (out.success) {
        await ctx.editMessageText(`❌ Task ${taskId} rejected.`);
      } else {
        await ctx.answerCbQuery(`Failed to reject task ${taskId}`);
      }
    }
  } catch (err: any) {
    await ctx.answerCbQuery(`Error: ${err.message}`);
  }
});

// 3.4 SSE Bridging
async function streamDaemonEvents() {
  console.log(`Connecting to ${DAEMON_URL}/events ...`);
  try {
    const res = await fetch(`${DAEMON_URL}/events`);
    if (!res.body) {
      setTimeout(streamDaemonEvents, 5000);
      return;
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    
    console.log('Connected to daemon SSE stream.');
    
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
              handleDaemonEvent(currentEvent, dataObj);
            } catch (e) {
               // silent ignore
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('SSE Connection failed. Retrying in 5s...');
    setTimeout(streamDaemonEvents, 5000);
  }
}

function handleDaemonEvent(event: string, data: any) {
  if (event === 'task.blocked' && data.reason === 'human-approve gate') {
    // Send interactive approval message
    bot.telegram.sendMessage(OWNER_ID, `⚠️ Task requires human approval.\nTask ID: ${data.taskId}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve:${data.taskId}` },
            { text: '❌ Reject', callback_data: `reject:${data.taskId}` }
          ]
        ]
      }
    });
  } else if (event === 'task.completed') {
    const output = data.output?.content || '';
    if (output.split('\n').length > 50) {
      bot.telegram.sendMessage(OWNER_ID, `✅ Task Completed: ${data.taskId}\nOutput is large. View on dashboard: http://localhost:5173`);
    } else {
      bot.telegram.sendMessage(OWNER_ID, `✅ Task Completed: ${data.taskId}\nOutput: ${output}`);
    }
  } else if (event === 'task.failed') {
    bot.telegram.sendMessage(OWNER_ID, `❌ Task Failed: ${data.taskId}\nError: ${data.error}`);
  } else if (event === 'task.abandoned') {
    bot.telegram.sendMessage(OWNER_ID, `☠️ Task Abandoned: ${data.taskId}\nFinal Error: ${data.finalError}`);
  } else if (event === 'budget.warn') {
    bot.telegram.sendMessage(OWNER_ID, `⚠️ Budget Warning (${data.provider}): Exceeded ${data.pct}% threshold.`);
  } else if (event === 'budget.paused') {
    bot.telegram.sendMessage(OWNER_ID, `🛑 Budget Paused (${data.provider}): Limit exceeded.`);
  } else if (event === 'worker.progress') {
    const icon = data.status === 'running' ? '⏳' : data.status === 'success' ? '✅' : '❌';
    bot.telegram.sendMessage(OWNER_ID, `[${data.providerId}] ${icon} Worker: ${data.workerName}`);
  }
}

// Renotifier for BLOCKED tasks
setInterval(async () => {
  try {
    const res = await fetch(`${DAEMON_URL}/tasks`);
    const tasks = await res.json() as any[];
    const blockedTasks = tasks.filter(t => t.state === 'BLOCKED');
    for (const t of blockedTasks) {
      // Very basic logic: just remind about all blocked tasks every hour
      bot.telegram.sendMessage(OWNER_ID, `⏰ REMINDER: Task ${t.id} is waiting for human approval.`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `approve:${t.id}` },
              { text: '❌ Reject', callback_data: `reject:${t.id}` }
            ]
          ]
        }
      });
    }
  } catch (e) {
    // silently fail
  }
}, 3600000); // 1 hour

streamDaemonEvents();
bot.launch(() => {
  console.log('Telegram bot started!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
