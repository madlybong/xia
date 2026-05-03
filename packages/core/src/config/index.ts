import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfigDir } from './paths';

export * from './paths';

export interface XiaConfig {
  daemonPort: number;
  redisUrl: string;
  qdrantUrl: string;
  defaultProvider: string;
  telegramBotToken?: string;
  telegramOwnerId?: string;
  ntfyUrl?: string;
  pushoverToken?: string;
  projects: Record<string, { path: string; constitution: string[] }>;
}

const DEFAULT_CONFIG: XiaConfig = {
  daemonPort: 3000,
  redisUrl: 'redis://localhost:6379',
  qdrantUrl: 'http://localhost:6333',
  defaultProvider: 'kilo',
  projects: {}
};

export function loadConfig(): XiaConfig {
  const configPath = path.join(getConfigDir(), 'xia.json');
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(data);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (e) {
    console.error('Failed to parse xia.json, using defaults', e);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: XiaConfig): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const configPath = path.join(dir, 'xia.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}
