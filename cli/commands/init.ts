import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getXiaDataDir, getConfigDir, getSecretsDir, getDataDir, getLogsDir, loadConfig, saveConfig } from '../../packages/core/src/config/index';
import { runDoctor } from './doctor';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));

export async function runInit() {
  console.log('\n=== XIA Initialization Wizard ===\n');

  console.log(`Setting up configuration at: ${getXiaDataDir()}`);
  
  // Create directories
  const dirs = [getConfigDir(), getSecretsDir(), getDataDir(), getLogsDir()];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created ${dir}`);
    }
  }

  // Handle secrets
  const globalEnvPath = path.join(getSecretsDir(), 'global.env');
  const existingEnv = fs.existsSync(globalEnvPath) ? fs.readFileSync(globalEnvPath, 'utf8') : '';
  
  const antigravity = await question('Enter ANTIGRAVITY_API_KEY (leave blank to skip): ');
  const kilo = await question('Enter KILO_API_KEY (leave blank to skip): ');
  const telegramBot = await question('Enter TELEGRAM_BOT_TOKEN (leave blank to skip): ');
  const telegramOwner = await question('Enter TELEGRAM_OWNER_ID (leave blank to skip): ');

  let newEnv = existingEnv;
  if (antigravity) newEnv += `\nANTIGRAVITY_API_KEY=${antigravity}`;
  if (kilo) newEnv += `\nKILO_API_KEY=${kilo}`;
  if (telegramBot) newEnv += `\nTELEGRAM_BOT_TOKEN=${telegramBot}`;
  if (telegramOwner) newEnv += `\nTELEGRAM_OWNER_ID=${telegramOwner}`;

  fs.writeFileSync(globalEnvPath, newEnv.trim(), 'utf8');
  console.log(`\nSecrets saved to ${globalEnvPath}`);

  // Handle config
  const config = loadConfig();
  
  const redis = await question(`Enter Redis URL [${config.redisUrl}]: `);
  if (redis) config.redisUrl = redis;

  const qdrant = await question(`Enter Qdrant URL [${config.qdrantUrl}]: `);
  if (qdrant) config.qdrantUrl = qdrant;

  saveConfig(config);
  console.log(`Config saved to ${path.join(getConfigDir(), 'xia.json')}`);

  rl.close();

  console.log('\nInitialization complete! Running health check...\n');
  await runDoctor();
}
