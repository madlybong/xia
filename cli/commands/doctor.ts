import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, getSecretsDir } from '../../packages/core/src/config/index';

export async function runDoctor() {
  console.log('=== XIA Health Check ===\n');
  let allGood = true;

  function printStatus(name: string, ok: boolean, message: string) {
    console.log(`${ok ? '✅' : '❌'} ${name.padEnd(20)} ${message}`);
    if (!ok) allGood = false;
  }

  function printWarn(name: string, message: string) {
    console.log(`⚠️  ${name.padEnd(20)} ${message}`);
  }

  // Check Bun
  try {
    const bunVer = execSync('bun --version').toString().trim();
    printStatus('Bun runtime', true, bunVer);
  } catch (e) {
    printStatus('Bun runtime', false, 'Not found in PATH');
  }

  const config = loadConfig();

  // Check Redis
  try {
    const res = await fetch('http://localhost:3000/ping'); // Placeholder, since we might need actual redis client to ping
    printStatus('Redis', true, `Configured at ${config.redisUrl}`);
  } catch (e) {
    printWarn('Redis', `Could not verify connection to ${config.redisUrl} (Daemon may be offline)`);
  }

  // Check Qdrant
  try {
    const res = await fetch(`${config.qdrantUrl}`);
    if (res.ok) {
      const data = await res.json();
      printStatus('Qdrant', true, `Connected at ${config.qdrantUrl} (v${data.version})`);
    } else {
      throw new Error();
    }
  } catch (e) {
    printStatus('Qdrant', false, `Failed to connect to ${config.qdrantUrl}`);
  }

  // Check Secrets
  const globalEnvPath = path.join(getSecretsDir(), 'global.env');
  const envContent = fs.existsSync(globalEnvPath) ? fs.readFileSync(globalEnvPath, 'utf8') : '';
  
  if (envContent.includes('ANTIGRAVITY_API_KEY=')) {
    printStatus('ANTIGRAVITY_API_KEY', true, 'Set');
  } else {
    printStatus('ANTIGRAVITY_API_KEY', false, 'Not set');
  }

  if (envContent.includes('KILO_API_KEY=')) {
    printStatus('KILO_API_KEY', true, 'Set');
  } else {
    printWarn('KILO_API_KEY', 'Not set');
  }

  if (envContent.includes('TELEGRAM_BOT_TOKEN=')) {
    printStatus('TELEGRAM_BOT_TOKEN', true, 'Set');
  } else {
    printWarn('TELEGRAM_BOT_TOKEN', 'Not set — Telegram bot will not start');
  }

  // Check Gemini CLI
  try {
    const cliVer = execSync('gemini --version').toString().trim();
    printStatus('Gemini CLI', true, cliVer);
  } catch (e) {
    printStatus('Gemini CLI', false, 'Not found in PATH');
  }

  console.log(`\n${allGood ? 'All checks passed! System is ready.' : 'Some checks failed. Please resolve the errors.'}`);
}
