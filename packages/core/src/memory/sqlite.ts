import { Database } from 'bun:sqlite';
import type { Task, AIProvider, TaskDomain } from '../../types';

let db: Database;

export function initSQLite(dbPath = 'xia.sqlite'): Database {
  if (db) return db;
  
  db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL;');

  // Tasks Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      domain TEXT NOT NULL,
      state TEXT NOT NULL,
      dependencies TEXT NOT NULL,
      requiredGates TEXT NOT NULL,
      retries INTEGER NOT NULL,
      maxRetries INTEGER NOT NULL,
      priority TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      lastError TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  // Task Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      line TEXT NOT NULL,
      FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  // Token Spend Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_spend (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      domain TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      usd REAL NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  return db;
}

export function closeSQLite() {
  if (db) {
    db.close();
    db = undefined as any;
  }
}

// ─────────────────────────────────────────────
// Task CRUD
// ─────────────────────────────────────────────

export function createTask(task: Task): void {
  const insert = db.prepare(`
    INSERT INTO tasks (
      id, agentId, domain, state, dependencies, requiredGates,
      retries, maxRetries, priority, input, output, lastError,
      createdAt, updatedAt
    ) VALUES (
      $id, $agentId, $domain, $state, $dependencies, $requiredGates,
      $retries, $maxRetries, $priority, $input, $output, $lastError,
      $createdAt, $updatedAt
    )
  `);

  insert.run({
    $id: task.id,
    $agentId: task.agentId,
    $domain: task.domain,
    $state: task.state,
    $dependencies: JSON.stringify(task.dependencies),
    $requiredGates: JSON.stringify(task.requiredGates),
    $retries: task.retries,
    $maxRetries: task.maxRetries,
    $priority: task.priority,
    $input: JSON.stringify(task.input),
    $output: task.output ? JSON.stringify(task.output) : null,
    $lastError: task.lastError || null,
    $createdAt: task.createdAt,
    $updatedAt: task.updatedAt
  });
}

export function updateTask(task: Task): void {
  const update = db.prepare(`
    UPDATE tasks SET
      state = $state,
      retries = $retries,
      output = $output,
      lastError = $lastError,
      updatedAt = $updatedAt
    WHERE id = $id
  `);

  update.run({
    $id: task.id,
    $state: task.state,
    $retries: task.retries,
    $output: task.output ? JSON.stringify(task.output) : null,
    $lastError: task.lastError || null,
    $updatedAt: task.updatedAt
  });
}

export function getTask(id: string): Task | null {
  const query = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  const row = query.get(id) as any;
  if (!row) return null;
  return mapRowToTask(row);
}

export function listTasks(filter?: { domain?: TaskDomain; state?: string }): Task[] {
  let sql = `SELECT * FROM tasks`;
  const params: any[] = [];
  if (filter) {
    const conditions: string[] = [];
    if (filter.domain) {
      conditions.push(`domain = ?`);
      params.push(filter.domain);
    }
    if (filter.state) {
      conditions.push(`state = ?`);
      params.push(filter.state);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }
  }

  const query = db.prepare(sql);
  const rows = query.all(...params) as any[];
  return rows.map(mapRowToTask);
}

function mapRowToTask(row: any): Task {
  return {
    id: row.id,
    agentId: row.agentId,
    domain: row.domain,
    state: row.state,
    dependencies: JSON.parse(row.dependencies),
    requiredGates: JSON.parse(row.requiredGates),
    retries: row.retries,
    maxRetries: row.maxRetries,
    priority: row.priority,
    input: JSON.parse(row.input),
    output: row.output ? JSON.parse(row.output) : undefined,
    lastError: row.lastError || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

// ─────────────────────────────────────────────
// Task Logs & Spend Tracking
// ─────────────────────────────────────────────

export function appendLog(taskId: string, line: string): void {
  const insert = db.prepare(`
    INSERT INTO task_logs (taskId, timestamp, line)
    VALUES ($taskId, $timestamp, $line)
  `);
  insert.run({
    $taskId: taskId,
    $timestamp: Date.now(),
    $line: line
  });
}

export function getTaskLogs(taskId: string): string[] {
  const query = db.prepare(`SELECT line FROM task_logs WHERE taskId = ? ORDER BY timestamp ASC`);
  const rows = query.all(taskId) as { line: string }[];
  return rows.map(r => r.line);
}

export function recordSpend(provider: AIProvider, domain: TaskDomain, tokens: number, usd: number): void {
  const insert = db.prepare(`
    INSERT INTO token_spend (provider, domain, tokens, usd, timestamp)
    VALUES ($provider, $domain, $tokens, $usd, $timestamp)
  `);
  insert.run({
    $provider: provider,
    $domain: domain,
    $tokens: tokens,
    $usd: usd,
    $timestamp: Date.now()
  });
}

export function getSpend(
  provider: AIProvider | null,
  domain: TaskDomain | null,
  sinceTimestamp: number
): number {
  let sql = `SELECT SUM(usd) as total FROM token_spend WHERE timestamp >= ?`;
  const params: any[] = [sinceTimestamp];

  if (provider) {
    sql += ` AND provider = ?`;
    params.push(provider);
  }
  
  if (domain) {
    sql += ` AND domain = ?`;
    params.push(domain);
  }

  const query = db.prepare(sql);
  const result = query.get(...params) as { total: number | null };
  return result?.total || 0;
}
