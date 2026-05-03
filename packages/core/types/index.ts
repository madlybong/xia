/**
 * XIA — Core Type Contracts
 * packages/core/types/index.ts
 *
 * These are the foundational TypeScript interfaces and types for the entire
 * XIA system. Every component — the Orchestrator, the AI Router, the Daemon,
 * the CLI, the Dashboard — is built on top of these definitions.
 *
 * Constitution Rule: If a type change here breaks something downstream,
 * the downstream component is wrong, not the type.
 */

// ─────────────────────────────────────────────
// DOMAIN
// ─────────────────────────────────────────────

/**
 * The project domain a task belongs to.
 * Determines which constitution rules apply and which budget to charge.
 */
export type TaskDomain =
  | 'auruvi'   // Enterprise healthcare — HIPAA constraints
  | 'hermes'   // HFT platform — mandatory benchmark gates
  | 'iocl'     // Industrial enterprise — integration test gates
  | 'sail'     // Industrial enterprise — integration test gates
  | 'iot'      // Embedded / robotics — hardware-in-the-loop
  | 'general'  // Unclassified internal tasks

// ─────────────────────────────────────────────
// TASK STATE MACHINE
// ─────────────────────────────────────────────

/**
 * Every task must eventually reach a terminal state.
 * Law 4: No task can run indefinitely.
 */
export type TaskState =
  | 'PENDING'   // Created, waiting for dependencies
  | 'RUNNING'   // Executor has dispatched this task
  | 'SUCCESS'   // Completed successfully
  | 'FAILED'    // Execution error, within retry budget
  | 'RETRYING'  // Being re-queued after failure
  | 'BLOCKED'   // Awaiting explicit human approval (holds forever)
  | 'ABANDONED' // Retry budget exhausted, no fallback available

/**
 * Terminal states — a task in one of these states will never transition again.
 */
export type TerminalState = 'SUCCESS' | 'ABANDONED'

// ─────────────────────────────────────────────
// GATES
// ─────────────────────────────────────────────

/**
 * Required gates that must pass before a task can be marked SUCCESS.
 * Gates are enforced by the Executor and cannot be skipped.
 */
export type GateType =
  | 'human-approve'      // Human must tap [Approve] via CLI, Telegram, or Dashboard
  | 'benchmark'          // Mandatory for all Hermes tasks
  | 'integration-test'   // Mandatory for IOCL/SAIL tasks
  | 'compliance-review'  // Mandatory for Auruvi tasks
  | 'compile'            // Code must compile without errors

// ─────────────────────────────────────────────
// AGENT
// ─────────────────────────────────────────────

/**
 * Agent types available in the system.
 * Domain-specific agents are loaded dynamically from the plugin registry.
 */
export type AgentId =
  | 'planner'
  | 'strategy'
  | 'code-writer'
  | 'refactor'
  | 'critic'
  | 'documenter'
  | 'profiler'             // Hermes — spawns perf/valgrind
  | 'compliance-reviewer'  // Auruvi — HIPAA rule enforcement
  | 'serial-monitor'       // IoT — reads device serial output
  | 'cross-compiler'       // IoT — ARM/RISC-V toolchain
  | 'integration-tester'   // IOCL/SAIL — legacy system test runner
  | string                 // Plugin agents registered at runtime

// ─────────────────────────────────────────────
// MEMORY
// ─────────────────────────────────────────────

/**
 * A chunk of long-term semantic memory retrieved from Qdrant.
 * The Context Injector queries Qdrant and injects relevant chunks
 * into the agent's input before dispatch.
 */
export interface MemoryChunk {
  id: string
  content: string        // The raw text of the memory
  score: number          // Similarity score from Qdrant (0–1)
  domain: TaskDomain
  tags: string[]
  createdAt: number
}

// ─────────────────────────────────────────────
// AGENT I/O CONTRACTS
// ─────────────────────────────────────────────

/**
 * The exact payload delivered to an agent by the Context Injector.
 * Law 3: Agents receive ONLY what they need. No full system dumps.
 */
export interface AgentInput {
  /** The specific instruction for this task */
  instruction: string

  /** Relevant long-term memories retrieved from Qdrant */
  memory: MemoryChunk[]

  /** Structured outputs from all predecessor tasks in the DAG */
  dependencyOutputs: Record<string, AgentOutput>

  /** Domain-specific constitutional rules injected as constraints */
  constraints: string[]

  /**
   * Indicates the masking pass has been applied.
   * If false, the Executor must refuse to dispatch.
   */
  masked: boolean

  /** Estimated token count for this payload (pre-dispatch check) */
  estimatedTokens: number
}

/**
 * The structured result an agent returns after execution.
 * This is a datum — it does not trigger anything. The Orchestrator
 * decides what happens with it.
 */
export interface AgentOutput {
  success: boolean

  /** The primary text output (code, analysis, report, etc.) */
  content: string

  /**
   * Optional typed structured payload.
   * Examples: { dag: DAGNode[] }, { benchmarkScore: number }, { compileErrors: string[] }
   */
  structured?: unknown

  /** Actual tokens consumed by this agent call (for budget accounting) */
  tokensUsed: number

  /** The AI provider that handled this output */
  provider: AIProvider

  /** ISO timestamp of completion */
  completedAt: string
}

// ─────────────────────────────────────────────
// TASK
// ─────────────────────────────────────────────

/**
 * The core unit of work in XIA.
 * Created by the Planner, managed by the Scheduler and Executor,
 * persisted to SQLite, and never mutated directly by agents.
 */
export interface Task {
  id: string
  agentId: AgentId
  domain: TaskDomain
  state: TaskState

  /** IDs of tasks that must be SUCCESS before this task can run */
  dependencies: string[]

  /** Gates that must pass before this task can be marked SUCCESS */
  requiredGates: GateType[]

  contextScope?: string[]
  workingDir?: string

  /** Current retry attempt (0 = first attempt) */
  retries: number

  /** Maximum allowed retries before the task is ABANDONED */
  maxRetries: number

  /**
   * Task priority.
   * 'critical' tasks bypass the 90% budget pause (but not 100% hard stop).
   */
  priority: 'normal' | 'critical'

  input: AgentInput
  output?: AgentOutput

  /** Reason for the last failure, appended to context on retry */
  lastError?: string

  /** Unix timestamps */
  createdAt: number
  updatedAt: number
}

// ─────────────────────────────────────────────
// DAG
// ─────────────────────────────────────────────

/**
 * A node in the Directed Acyclic Graph produced by the Planner.
 * The Planner returns an array of these, which the Scheduler resolves.
 */
export interface DAGNode {
  id: string
  agentId: AgentId
  domain: TaskDomain
  instruction: string
  dependencies: string[]
  requiredGates: GateType[]
  priority: 'normal' | 'critical'
  contextScope: string[]  // Qdrant query terms for this node's memory retrieval
  workingDir?: string
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────

/**
 * Every internal state change in XIA is published as a typed Event.
 * Law 6: Every action is observable. There are no silent operations.
 *
 * The Event Bus is the nervous system — the Dashboard and Telegram
 * bot both subscribe to it.
 */
export type XiaEvent =
  | { type: 'task.queued';     taskId: string; domain: TaskDomain }
  | { type: 'task.started';    taskId: string; agentId: AgentId }
  | { type: 'task.completed';  taskId: string; output: AgentOutput }
  | { type: 'task.failed';     taskId: string; error: string; retriesLeft: number }
  | { type: 'task.blocked';    taskId: string; reason: string; blockedAt: number }
  | { type: 'task.abandoned';  taskId: string; finalError: string }
  | { type: 'agent.output';    taskId: string; chunk: string; agentId?: string; timestamp?: number }    // Streaming token
  | { type: 'worker.progress'; taskId: string; providerId: string; workerName: string; status: 'running' | 'success' | 'failed'; message?: string }
  | { type: 'memory.written';  domain: TaskDomain; summary: string }
  | { type: 'budget.warn';     provider: AIProvider; pct: number }
  | { type: 'budget.paused';   provider: AIProvider }
  | { type: 'budget.resumed';  provider: AIProvider }
  | { type: 'system.fatal';    message: string; timestamp: number }

// ─────────────────────────────────────────────
// AI PROVIDERS
// ─────────────────────────────────────────────

/**
 * Available AI providers.
 * Routing logic in apps/daemon/ai-router/ uses these.
 */
export type AIProvider =
  | 'antigravity'  // Gemini — deep architecture, long-context reasoning
  | 'kilo'         // Kilo — fast iteration, refactoring, code generation

/**
 * Task classification used by the AI Router to select a provider.
 */
export type TaskClassification =
  | 'architecture'      // → antigravity
  | 'long-context'      // → antigravity
  | 'code-generation'   // → kilo
  | 'refactor'          // → kilo
  | 'fast-iteration'    // → kilo
  | 'analysis'          // → antigravity

// ─────────────────────────────────────────────
// SECRETS
// ─────────────────────────────────────────────

/**
 * The shape of resolved secrets after the SecretsStore loads
 * and merges all layers (global → project → runtime override).
 * Raw values are never passed to agents.
 */
export interface ResolvedSecrets {
  antigravityKey: string
  kiloKey: string
  kiloOrgId?: string
  telegramBotToken: string
  telegramOwnerId: string
  ntfyUrl?: string
  [key: string]: string | undefined  // Project-specific secrets
}

// ─────────────────────────────────────────────
// BUDGET
// ─────────────────────────────────────────────

/**
 * Per-provider and per-project budget thresholds loaded from
 * the app data directory via getConfigDir()
 */
export interface BudgetConfig {
  windows: {
    daily: boolean
    weekly: boolean
    monthly: boolean
  }
  providers: Record<AIProvider, {
    daily?: number
    monthly?: number
  }>
  projects: Record<TaskDomain, {
    daily?: number
    priority?: 'normal' | 'critical'
  }>
  thresholds: {
    warn_pct: number       // Default: 70
    pause_pct: number      // Default: 90
    hard_stop_pct: number  // Default: 100
  }
}

/**
 * A snapshot of current spend for a given window.
 */
export interface BudgetSnapshot {
  provider: AIProvider
  domain: TaskDomain
  window: 'daily' | 'weekly' | 'monthly'
  spent: number
  limit: number
  pct: number
  status: 'ok' | 'warn' | 'paused' | 'hard-stop'
}

// ─────────────────────────────────────────────
// AGENT PLUGIN (for dynamic registry)
// ─────────────────────────────────────────────

/**
 * The interface every domain-specific agent plugin must implement.
 * The Executor discovers plugins by scanning the agents/ directory at startup.
 */
export interface AgentRunContext {
  taskId: string
  bus: XiaEventBus
  workingDir: string
}

export interface AgentPlugin {
  id: string // ProviderId
  domain: TaskDomain
  version: string
  description: string
  run(input: AgentInput, context: AgentRunContext): Promise<AgentOutput>
}

// ─────────────────────────────────────────────
// PROJECT CONSTITUTION
// ─────────────────────────────────────────────

/**
 * Domain-specific rules injected as constraints into every agent
 * working on that project. These are the "laws" for each domain.
 */
export interface ProjectConstitution {
  domain: TaskDomain
  rules: string[]           // Natural language constraint strings
  requiredGates: GateType[] // Gates always enforced for this domain
  maskingPatterns: string[] // Regex patterns for data masking
}
