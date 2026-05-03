import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskDomain, AIProvider, BudgetConfig, BudgetSnapshot } from '@xia/core';
import { getSpend, recordSpend, getConfigDir } from '@xia/core';
import { XiaEventBus } from '@xia/core';

export class BudgetEngine {
  private config: BudgetConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(getConfigDir(), 'budgets.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): BudgetConfig {
    const defaultCfg: BudgetConfig = {
      windows: { daily: true, weekly: false, monthly: true },
      providers: {
        antigravity: { daily: 10, monthly: 100 },
        kilo: { daily: 2, monthly: 20 }
      },
      projects: {
        auruvi: { daily: 5, priority: 'normal' },
        hermes: { daily: 15, priority: 'critical' },
        iocl: { daily: 5, priority: 'normal' },
        sail: { daily: 5, priority: 'normal' },
        iot: { daily: 5, priority: 'normal' },
        general: { daily: 5, priority: 'normal' }
      },
      thresholds: {
        warn_pct: 70,
        pause_pct: 90,
        hard_stop_pct: 100
      }
    };

    if (existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, 'utf-8');
        // Simple merge over defaults
        return { ...defaultCfg, ...JSON.parse(fileContent) };
      } catch (err) {
        console.error(`BudgetEngine: Failed to load ${this.configPath}. Using defaults.`, err);
      }
    } else {
      console.warn(`BudgetEngine: ${this.configPath} not found. Using defaults.`);
    }

    return defaultCfg;
  }

  private getWindowStart(window: 'daily' | 'weekly' | 'monthly'): number {
    const now = new Date();
    // Default to midnight UTC
    if (window === 'daily') {
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    }
    if (window === 'monthly') {
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
    }
    if (window === 'weekly') {
      const day = now.getUTCDay(); // 0 is Sunday
      const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff)).getTime();
    }
    return 0;
  }

  /**
   * Check if a specific provider and domain are within budget constraints.
   * Emits warnings if crossing thresholds.
   */
  check(provider: AIProvider, domain: TaskDomain, bus?: XiaEventBus): 'ok' | 'warn' | 'paused' | 'hard-stop' {
    let maxStatus: 'ok' | 'warn' | 'paused' | 'hard-stop' = 'ok';

    const windowsToCheck: ('daily' | 'monthly')[] = [];
    if (this.config.windows.daily) windowsToCheck.push('daily');
    if (this.config.windows.monthly) windowsToCheck.push('monthly');

    const projectConfig = this.config.projects[domain];
    const providerConfig = this.config.providers[provider];

    for (const w of windowsToCheck) {
      const start = this.getWindowStart(w);

      // Check Provider Level
      const provLimit = providerConfig[w];
      if (provLimit !== undefined) {
        const spent = getSpend(provider, null, start);
        const st = this.evaluateThreshold(spent, provLimit, projectConfig?.priority === 'critical');
        if (this.isWorse(st, maxStatus)) maxStatus = st;
      }

      // Check Project Level
      const projLimit = projectConfig[w as 'daily']; // projects currently only have daily in types, but could have monthly
      if (projLimit !== undefined) {
        const spent = getSpend(null, domain, start);
        const st = this.evaluateThreshold(spent, projLimit, projectConfig?.priority === 'critical');
        if (this.isWorse(st, maxStatus)) maxStatus = st;
      }
    }

    if (bus) {
      if (maxStatus === 'warn') bus.emit({ type: 'budget.warn', provider, pct: this.config.thresholds.warn_pct });
      if (maxStatus === 'paused') bus.emit({ type: 'budget.paused', provider });
      if (maxStatus === 'hard-stop') bus.emit({ type: 'budget.paused', provider });
    }

    return maxStatus;
  }

  private isWorse(a: string, b: string): boolean {
    const levels = { 'ok': 0, 'warn': 1, 'paused': 2, 'hard-stop': 3 };
    return levels[a as keyof typeof levels] > levels[b as keyof typeof levels];
  }

  private evaluateThreshold(spent: number, limit: number, isCritical: boolean): 'ok' | 'warn' | 'paused' | 'hard-stop' {
    if (limit <= 0) return 'hard-stop';
    const pct = (spent / limit) * 100;

    if (pct >= this.config.thresholds.hard_stop_pct) return 'hard-stop';
    if (pct >= this.config.thresholds.pause_pct) {
      return isCritical ? 'warn' : 'paused'; // Critical projects bypass pause, but not hard stop
    }
    if (pct >= this.config.thresholds.warn_pct) return 'warn';
    return 'ok';
  }

  /**
   * Wraps the SQLite recordSpend logic
   */
  record(provider: AIProvider, domain: TaskDomain, tokens: number, usd: number): void {
    recordSpend(provider, domain, tokens, usd);
  }

  /**
   * Generates a snapshot of all tracked budgets
   */
  snapshot(): BudgetSnapshot[] {
    const snaps: BudgetSnapshot[] = [];
    const windows: ('daily' | 'monthly')[] = [];
    if (this.config.windows.daily) windows.push('daily');
    if (this.config.windows.monthly) windows.push('monthly');

    for (const w of windows) {
      const start = this.getWindowStart(w);
      for (const prov of Object.keys(this.config.providers) as AIProvider[]) {
        const limit = this.config.providers[prov][w];
        if (limit !== undefined) {
          const spent = getSpend(prov, null, start);
          snaps.push({
            provider: prov,
            domain: 'general', // Global provider budget
            window: w,
            spent,
            limit,
            pct: (spent / limit) * 100,
            status: this.evaluateThreshold(spent, limit, false)
          });
        }
      }

      for (const dom of Object.keys(this.config.projects) as TaskDomain[]) {
        const projLimit = this.config.projects[dom][w as 'daily'];
        if (projLimit !== undefined) {
          const spent = getSpend(null, dom, start);
          snaps.push({
            provider: 'kilo', // generic assignment for project snapshot
            domain: dom,
            window: w,
            spent,
            limit: projLimit,
            pct: (spent / projLimit) * 100,
            status: this.evaluateThreshold(spent, projLimit, this.config.projects[dom]?.priority === 'critical')
          });
        }
      }
    }

    return snaps;
  }
}

export const budgetEngine = new BudgetEngine();
