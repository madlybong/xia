import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskDomain, ResolvedSecrets } from '@xia/core';
import { getSecretsDir } from '@xia/core';

export class SecretsStore {
  private baseDir: string;
  private memoryStore = new Map<string, string>();

  // scope "global" -> key -> value
  // scope "hermes" -> key -> value
  private diskStore = new Map<string, Map<string, string>>();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || getSecretsDir();
    if (!existsSync(this.baseDir)) {
      console.warn(`SecretsStore: Directory ${this.baseDir} not found. Running in memory-only mode.`);
    }
  }

  /**
   * Load global.env and all <domain>.env files from disk into memory.
   */
  loadFromDisk(): void {
    this.diskStore.clear();

    const domains = ['global', 'auruvi', 'hermes', 'iocl', 'sail', 'iot', 'general'];
    for (const d of domains) {
      const file = join(this.baseDir, `${d}.env`);
      const map = new Map<string, string>();
      if (existsSync(file)) {
        try {
          const content = readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const eqIdx = trimmed.indexOf('=');
              if (eqIdx > 0) {
                const k = trimmed.substring(0, eqIdx).trim();
                const v = trimmed.substring(eqIdx + 1).trim();
                map.set(k, v);
              }
            }
          }
        } catch (err) {
          console.error(`SecretsStore: Failed to read ${file}`, err);
        }
      }
      this.diskStore.set(d, map);
    }
  }

  /**
   * Resolve a key, checking in order:
   * 1. Runtime memory override (`scope:key`)
   * 2. Domain-specific .env from disk (`<domain>.env`)
   * 3. Global .env from disk (`global.env`)
   * 4. Process environment (`process.env.KEY`)
   */
  get(key: string, domain?: TaskDomain): string | undefined {
    // 1. Runtime override
    if (domain) {
      const memDomainKey = `${domain}:${key}`;
      if (this.memoryStore.has(memDomainKey)) return this.memoryStore.get(memDomainKey);
    }
    const memGlobalKey = `global:${key}`;
    if (this.memoryStore.has(memGlobalKey)) return this.memoryStore.get(memGlobalKey);

    // 2. Domain specific from disk
    if (domain) {
      const domainMap = this.diskStore.get(domain);
      if (domainMap?.has(key)) return domainMap.get(key);
    }

    // 3. Global from disk
    const globalMap = this.diskStore.get('global');
    if (globalMap?.has(key)) return globalMap.get(key);

    // 4. Process Env
    if (process.env[key] !== undefined) return process.env[key];

    return undefined;
  }

  /**
   * Set a runtime override (in memory only, never written to disk).
   */
  set(key: string, value: string, domain?: TaskDomain | 'global'): void {
    const scope = domain || 'global';
    this.memoryStore.set(`${scope}:${key}`, value);
  }

  /**
   * Get fully resolved secrets object, checking required keys.
   */
  resolveAll(domain?: TaskDomain): ResolvedSecrets {
    return {
      antigravityKey: this.get('ANTIGRAVITY_API_KEY', domain) || '',
      kiloKey: this.get('KILO_API_KEY', domain) || '',
      kiloOrgId: this.get('KILO_ORG_ID', domain),
      telegramBotToken: this.get('TELEGRAM_BOT_TOKEN', domain) || '',
      telegramOwnerId: this.get('TELEGRAM_OWNER_ID', domain) || '',
      ntfyUrl: this.get('NTFY_URL', domain)
    };
  }
}

// Singleton for daemon use
export const secretsStore = new SecretsStore();
