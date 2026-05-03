# XIA — Personal AI Development Infrastructure
### v1.0 — Single Source of Truth

---

> XIA is not a tool. It is not a chatbot. It is not an IDE plugin.
>
> XIA is a **persistent, always-on autonomous development platform** — a private AI-powered node that orchestrates the full lifecycle of software development across enterprise, financial, industrial, and embedded domains.
>
> The core mental shift: **stop using AI. Build a system that uses AI for you.**

---

## Table of Contents

1. [Philosophy & Mental Model](#1-philosophy--mental-model)
2. [Mission & Domain Coverage](#2-mission--domain-coverage)
3. [System Constitution](#3-system-constitution)
4. [System Architecture](#4-system-architecture)
5. [The Orchestrator](#5-the-orchestrator)
6. [Execution Workflow](#6-execution-workflow)
7. [Agent Communication & Control](#7-agent-communication--control)
8. [Human <> XIA Communication](#8-human--xia-communication)
9. [Technology Stack](#9-technology-stack)
10. [Monorepo Structure](#10-monorepo-structure)

---

## 1. Philosophy & Mental Model

### The Fundamental Shift

Most developers use AI tools the way they use a calculator — you pick it up, ask a question, get an answer, put it down. XIA inverts this entirely.

You do not pick XIA up. **XIA runs continuously.** You interact with it the way a factory director gives instructions to a plant — a high-level goal is communicated, and the plant executes, reports back, and waits for the next directive.

### The Three Pillars

**Pillar 1: Deterministic Control over Non-Deterministic Agents**

LLMs are probabilistic. They hallucinate. They drift. They produce inconsistent output. XIA's Orchestrator is the antidote. It is a strict, rule-enforcing runtime that wraps non-deterministic AI agents in a deterministic shell — enforcing lifecycle states, dependency resolution, retry thresholds, and failure boundaries. The Orchestrator has zero creativity. It has 100% control.

**Pillar 2: Background Autonomy**

XIA must continue working when you are offline. You give a directive, XIA executes the plan, and your phone gets a notification when it's done — or when it's blocked and needs you. You should be able to throw a voice note at XIA from a car and come home to 80% of the work completed.

**Pillar 3: Specialization, Not Generalization**

The same AI model cannot be best at architectural reasoning, raw C++ generation, and HFT profiling simultaneously. XIA enforces an AI routing strategy — classifying each task and dispatching it to the most capable provider or model for that specific job type.

### The Manager vs. Worker Mental Model

XIA is the **Manager**. The Agents are the **Workers**. A factory manager directing a steel plant does not need to be made of steel themselves. XIA is built in TypeScript/Bun (for extreme developer velocity) and dispatches work to C++ compilers, Rust toolchains, Python scripts, LLM APIs, and embedded firmware flashers. The manager's job is to coordinate, not to manufacture.

---

## 2. Mission & Domain Coverage

XIA is purpose-built to orchestrate development for four distinct, high-stakes domains. Each imposes unique constraints on the system's architecture.

### 2.1 Auruvi — Enterprise Healthcare Ecosystem

Auruvi is a compliance-sensitive, enterprise-scale healthcare platform. The stakes are high: data security, patient privacy, and regulatory compliance are non-negotiable.

**Constraints on XIA:**
- **Data Masking:** The Context Injector must strip or mask sensitive fields (patient records, API keys, auth credentials) before any prompt leaves the NUC to an external LLM API.
- **Local LLM Mode:** Sensitive code reviews that involve proprietary business logic must be routable to a locally hosted model, preventing data from ever leaving the private network.
- **Compliance Awareness:** Agents working on Auruvi tasks must have access to a HIPAA/compliance rule-set injected as a system constraint in their context.

### 2.2 Hermes — High-Frequency Trading Platform

Hermes processes over ₹100 crore in trading volume monthly. Every microsecond of latency introduced by a code change is a financial liability. The codebase is almost certainly C++ or Rust, and correctness is not optional.

**Constraints on XIA:**
- **Mandatory Benchmark Node:** The DAG Planner must enforce a `[Benchmark]` node as a required gate before any Hermes task can be marked `SUCCESS`. A code change that improves readability but degrades throughput by 2% is a regression, not a fix.
- **Profiler Integration:** XIA must be able to spawn profiling tools (`perf`, `valgrind`, `gprof`), parse their output, and feed structured performance data back into the LLM's analysis context.
- **Zero-Tolerance for Partial Completion:** Hermes tasks cannot be left in a partial state. The failure handler must enforce full rollback or a hold state rather than a partial merge.

### 2.3 IOCL & SAIL — Industrial Enterprise Applications

Government-grade industrial clients (IOCL, SAIL) operate with large legacy codebases, bureaucratic change processes, and strict integration constraints. Touching one module can cascade failures across unrelated systems.

**Constraints on XIA:**
- **Long-Term Architectural Memory:** Every time an agent touches an industrial codebase, it must first query the Vector Database (Qdrant) for established architectural patterns, prior decisions, and known integration constraints for that project. Ignorance is not excusable.
- **Integration Testing Gates:** The DAG for any industrial task must include a mandatory `[Integration Test]` node before completion.
- **Audit Trails:** Every agent action, prompt, and output for industrial tasks must be logged in full. These logs serve as an audit trail for client-facing accountability.

### 2.4 IoT & Robotics — Embedded Programming

Embedded development is fundamentally different. Code runs on hardware. Compilation targets are foreign architectures. A bug doesn't cause a 500 error; it bricks a device.

**Constraints on XIA:**
- **Hardware-in-the-Loop:** The NUC (Ubuntu Server) has a critical advantage — IoT boards (Arduino, ESP32, Raspberry Pi, STM32) can be physically connected via USB/Serial. XIA's daemon can execute `esptool`, `avrdude`, or `openocd` to flash firmware to physically connected devices, read back serial telemetry, and feed the output to an agent for iterative debugging.
- **Cross-Compilation Toolchains:** XIA must manage cross-compilation environments for foreign architectures (ARM, RISC-V, AVR) via Docker containers or native toolchains installed on the NUC.
- **Serial Monitor Agent:** A dedicated agent must exist that can listen to a device's serial output over a defined period and report anomalies.

---

## 3. System Constitution

The Constitution defines the inviolable laws of XIA. These are non-negotiable architectural rules. Any feature or implementation that violates these laws is, by definition, incorrect.

**Law 1 — The Orchestrator has Zero Creativity.**
The Orchestrator's job is to enforce structure, not to make creative decisions. It resolves dependencies, manages state, and triggers retries. All intelligence lives inside the Agents.

**Law 2 — Agents are Isolated.**
Agents cannot communicate with each other directly. Agent A cannot call Agent B. All inter-agent coordination happens through the Orchestrator's Event Bus.

**Law 3 — Context is Scoped, Not Dumped.**
No agent receives a full dump of the system memory. Every agent receives only the minimum required context for its specific task. This prevents context bloat, token waste, and hallucination from irrelevant information.

**Law 4 — Every Task Has a Finite Lifecycle.**
No task can run indefinitely. Every task must eventually reach a terminal state: `SUCCESS`, `FAILED`, or `ABANDONED`. Retry budgets are fixed. Infinite loops are a critical system failure.

**Law 5 — Sensitive Data Never Leaves the Perimeter Unmasked.**
Before any prompt is dispatched to an external LLM API, the Context Injector runs a masking pass. Keys, credentials, patient data, and proprietary fields are stripped or replaced with tokens.

**Law 6 — Every Action is Observable.**
Every decision the Orchestrator makes, every agent output, and every state transition is emitted as an event and logged. There are no silent operations in XIA.

**Law 7 — Human Approval is the Final Gate for Destructive Actions.**
Any task that results in a destructive, irreversible, or deployment-level action (e.g., database migration, production deployment, firmware flash to hardware) requires explicit human `[Approve]` before the Executor dispatches it.

---

## 4. System Architecture

XIA is composed of four distinct architectural layers. Each layer has a single, well-defined responsibility.

```
┌─────────────────────────────────────────────────────────────┐
│                      Human Interaction Layer                 │
│         CLI / TUI  |  Web Dashboard  |  Telegram  |  Push   │
└────────────────────────────┬────────────────────────────────┘
                             │ RPC / WebSocket / Polling
┌────────────────────────────▼────────────────────────────────┐
│                         xiad (Daemon)                        │
│          Hono.js  |  Event Bus  |  AI Router  |  Task Queue  │
└─────────┬─────────────────────────────────┬─────────────────┘
          │                                 │
┌─────────▼──────────┐           ┌──────────▼──────────────────┐
│  Orchestrator Core  │           │     Tool Executor           │
│  Planner           │           │  Bun.spawn → cmake/gcc      │
│  Scheduler         │           │  esptool / valgrind / perf  │
│  Executor          │           │  bash scripts               │
│  Context Injector  │           └─────────────────────────────┘
│  Failure Handler   │
└─────────┬──────────┘
          │
┌─────────▼────────────────────────────────────────────────────┐
│                        Memory & Data Layer                    │
│    SQLite (State/Logs)  |  Qdrant (Vector/Semantic Memory)   │
└──────────────────────────────────────────────────────────────┘
```

### Layer 1: Access & Environment
- **Host Node:** Ubuntu Server on an Intel NUC (minimum 8GB RAM, no GPU required).
- **Network:** Tailscale mesh VPN. All clients connect through Tailscale. Zero open ports. Zero public exposure.
- **Development Interface:** VS Code Remote SSH for deep-work sessions.

### Layer 2: Intelligence Layer
- **AI Router:** A centralized routing gateway inside `xiad`. Every prompt is classified before dispatch.
- **Routing Table:**

  | Task Classification | Provider |
  |---|---|
  | Deep Architecture, Long-Context Reasoning | Gemini Pro |
  | Raw Code Generation | Codex / Claude |
  | Fast Iteration, Refactoring | Kilo (Claude/GPT mix) |
  | Sensitive / Compliance Work | Local LLM (Ollama) |
  | Performance Analysis | Specialized Profiler Agent |

### Layer 3: The Orchestrator Core
The brain. Described in full in Section 5.

### Layer 4: Memory & Data
- **SQLite:** Embedded, zero-config. Stores task state, execution logs, retry history, and run-context memory.
- **Qdrant (Vector DB):** Dockerized on the NUC. Stores long-term, semantic project memory — architectural decisions, patterns, past agent outputs — queryable by embedding similarity for any new agent task.

---

## 5. The Orchestrator

The Orchestrator is a deterministic runtime engine. It is the only component that has a global view of the system. It has no creativity; it has total control.

### 5.1 The Planner

Translates a high-level human intent into a Directed Acyclic Graph (DAG) of atomic, executable tasks.

- Input: Natural language goal (text or voice-transcribed).
- Output: A typed DAG where each node has an `id`, `agent`, `dependencies[]`, `context_scope`, and `required_gates[]`.

```
"Refactor the auth module in Hermes"

→ DAG:
  [read-codebase]
  [benchmark-current]       ← depends on [read-codebase]
  [refactor-agent]          ← depends on [read-codebase]
  [compile]                 ← depends on [refactor-agent]
  [benchmark-new]           ← depends on [compile]
  [compare-benchmarks]      ← depends on [benchmark-current, benchmark-new]
  [human-approve]           ← depends on [compare-benchmarks]
  [commit]                  ← depends on [human-approve]
```

### 5.2 The Scheduler

Resolves the DAG and manages the execution order.

- Continuously scans for tasks whose all dependencies are in `SUCCESS` state.
- Dispatches all unblocked tasks in parallel.
- Waits for the Event Bus to notify it of a state change before re-evaluating.

### 5.3 The Executor

Dispatches individual tasks to the appropriate agent or tool.

- For LLM tasks: Builds context via the Context Injector, calls the AI Router, streams the response.
- For tool tasks: Uses `Bun.spawn()` to invoke shell commands (compilers, flashers, profilers), captures stdout/stderr, and stores the result.
- Emits `task.started`, `task.completed`, and `task.failed` events.

### 5.4 The Context Injector

The most critical security and quality component.

Every agent receives a scoped context object — nothing more, nothing less:
```
{
  memory: qdrant.query(task.scope),     // Relevant long-term memory
  dependencies: store.getOutputs(deps), // Results of predecessor tasks
  instructions: task.meta,             // The specific task directive
  constraints: project.constitution,   // Domain-specific rules (HIPAA, etc.)
  masked: true                         // Ensures PII/secrets are scrubbed
}
```

### 5.5 The Failure Handler

- **Retry Logic:** Each task has a `maxRetries` (default: 2). On failure, the task is re-queued with the failure reason appended to the context so the agent can self-correct.
- **Fallback Agents:** If a primary agent exceeds its retry budget, the Orchestrator can route to a simpler fallback agent.
- **Partial Completion:** Some domains (Healthcare, IoT) allow partial DAG completion with a hold state. HFT tasks do not — they require full rollback.
- **FATAL Escalation:** If the Orchestrator itself crashes or a task enters an irrecoverable state, a `FATAL` push notification is dispatched immediately to the human's phone.

### 5.6 The Event Bus

The nervous system of XIA. Every internal state change — every decision, transition, and output — is published as a typed event.

```
Event Types:
  task.queued
  task.started
  task.completed
  task.failed
  task.blocked         ← Waiting for human approval
  agent.output         ← Streaming token output
  system.fatal         ← Daemon-level failure
  memory.written       ← Long-term memory updated
```

The Web Dashboard and Telegram bot both subscribe to this bus to provide real-time visibility.

### 5.7 Task State Machine

```
PENDING → RUNNING → SUCCESS
                 ↘ FAILED → RETRYING → SUCCESS
                                    ↘ ABANDONED
         → BLOCKED (awaiting human approval)
```

---

## 6. Execution Workflow

### Full End-to-End Example:

**Scenario:** You are driving. You send a Telegram voice note:
*"Xia, scaffold the payment gateway integration for Auruvi. Use the existing auth module. Make sure there's no patient data in the schema."*

1. **Voice Transcription:** Whisper API transcribes the audio to text.
2. **Intent Parsing:** The Planner reads the transcription and generates a DAG (6 tasks: read-schema, design-api, generate-code, review-compliance, human-approve-diff, commit).
3. **DAG Acknowledged:** Telegram message: *"DAG created (6 tasks). Execute?"* → You tap `[Execute]`.
4. **Parallel Execution:** `read-schema` and `design-api` (independent) run in parallel.
5. **Context Injection:** When `generate-code` runs, the Context Injector queries Qdrant for Auruvi architectural patterns and adds the Auruvi compliance constraint: *"No PII fields in public schema."* It also strips any environment variables from the context before the prompt is sent to the external LLM.
6. **Compliance Review:** `review-compliance` agent analyzes the generated code against HIPAA constraints.
7. **Human Gate:** Task `human-approve-diff` triggers a `task.blocked` event. Telegram message: *"Code generated. Complex multi-file diff requires your review. [Open Dashboard →]"*
8. **Visual Review:** You open the Tailscale Web Dashboard on your tablet, see the side-by-side diff, and tap `[Approve]`.
9. **Commit:** The final task commits the code to the repository.
10. **Completion:** Telegram message: *"✅ Payment gateway scaffolded. 6/6 tasks complete."*

---

## 7. Agent Communication & Control

XIA enforces strict isolation between agents. The following rules are absolute:

- **No Direct Agent-to-Agent Calls.** Agent A cannot invoke Agent B. There are no agent-to-agent APIs.
- **All Communication is Mediated.** If Agent A needs a result from Agent B, it emits a request onto the Event Bus. The Orchestrator receives it and determines if and when that request is fulfilled.
- **Injection, Not Pull.** Agents are passive. They do not fetch their own context. The Context Injector pushes exactly what they need into their input payload.
- **Output is a Datum.** Agent output is a structured result stored in SQLite and Qdrant. It is not an action. The Orchestrator decides what happens with that datum.

---

## 8. Human <> XIA Communication

XIA's interaction model is tiered based on the human's context and urgency.

### Tier 1 — Deep Focus (At the Desk)
**Interface:** `xia` CLI + TUI
- `xiad` (the daemon) runs persistently via `systemd` on the NUC.
- `xia` is a local RPC client that fires commands at the daemon. Closing the terminal does not kill the task.
- `> xia ui` opens a rich TUI (Terminal UI) for real-time DAG visualization, agent log tailing, and memory inspection without needing a browser.

| Command | Action |
|---|---|
| `xia run "refactor auth"` | Starts a new orchestration plan |
| `xia status` | Shows all active/queued tasks |
| `xia approve --task <id>` | Unblocks a task awaiting human review |
| `xia kill --task <id>` | Force-terminates a running task |
| `xia ui` | Opens the rich TUI |
| `xia logs --tail <agent>` | Streams live agent output |

### Tier 2 — Oversight (On the Couch / Tablet)
**Interface:** Web Dashboard (Tailscale only)
- A Vue 3 SPA served by `xiad`, accessible only over the Tailscale network.
- **Primary Use Case:** Reviewing complex, multi-file code diffs side-by-side before approving.
- **Secondary Use Cases:** Visual DAG graph tracking, memory management (browsing/editing project knowledge), agent log review, token budget monitoring.

### Tier 3 — Asynchronous / On-The-Go
**Interface:** Telegram Bot + Voice Integration
- The bot runs inside `xiad` via polling (no open webhook ports).
- **Text Commands:** Natural language directives dispatched from anywhere.
- **Voice Notes:** Recorded voice memos are passed through the Whisper API, transcribed, and fed to the Planner as text intent.
- **Smart Routing for Approvals:** Simple blockers (e.g., missing API key) offer inline Telegram buttons. Complex code diffs trigger a notification with a Web Dashboard link for visual review.

### Tier 4 — Emergency Fail-Safes
**Interface:** NTFY / Pushover Push Notifications
- Self-hosted push notification service integrated into the Orchestrator's FATAL error handler.
- **Strict Usage:** Only dispatched for events that require immediate human intervention.
  - NUC thermal limit exceeded.
  - LLM daily token budget hard-cap hit.
  - Daemon process crash.
  - Database corruption detected.
- Configured to bypass iOS/Android "Do Not Disturb" at maximum priority.

---

## 9. Technology Stack

### Stack Selection Rationale

**Why TypeScript/Bun over C++:**
AI orchestration workloads are dominated by network I/O — waiting for LLM API responses over HTTPS. Raw CPU speed (the primary C++ advantage) is entirely wasted sitting behind a 200ms LLM API call. Meanwhile, TypeScript natively handles JSON parsing, async streaming, and string manipulation — which comprise 90% of orchestration logic. C++ in this role would multiply developer friction by 5x without meaningful performance gain. Bun specifically was chosen for its near-native I/O performance, built-in SQLite driver, and native test runner.

**Why Custom Orchestrator over Existing Frameworks:**
- **LangGraph/LangChain:** Heavily bloated, opinionated, difficult to debug. Not suitable for domain-specific constitutions (HIPAA, HFT benchmark gates).
- **Temporal.io:** Enterprise-grade reliability, but requires running a Temporal cluster. Overkill for a private NUC daemon.
- **N8N / Flowise:** UI-first. Destroys the code-first, CLI-driven philosophy of XIA.

Building a custom DAG executor in Bun ensures 100% control over runtime behavior, failure states, and domain-specific enforcement rules.

### Component Map

| Component | Technology | Justification |
|---|---|---|
| Daemon Language | TypeScript (Strict) | Type-safe contracts between Orchestrator, Agents, and Events |
| Daemon Runtime | Bun | Near-native I/O speed, native SQLite, built-in tooling |
| HTTP / WebSocket | Hono.js | Ultra-lightweight, optimized for Bun, serves CLI RPC + Web SPA |
| Task Queue | BullMQ + Redis | Battle-tested parallel job queue with retry semantics |
| State & Logs | SQLite (bun:sqlite) | Zero-config, embedded, zero-overhead for a single-node daemon |
| Long-Term Memory | Qdrant (Dockerized) | Self-hosted vector DB for semantic project memory |
| Web Dashboard | Vue 3 + Tailwind CSS | Matches your existing expertise; compiled to a static SPA |
| CLI / TUI | Ink (React for Terminal) | Rich, reactive terminal graphs without manual ANSI code |
| Telegram Bot | Telegraf | Most robust Bun-compatible Telegram Bot API library |
| Voice Transcription | OpenAI Whisper API | Reliable, fast, removes need for local GPU |
| Network Layer | Tailscale | Zero-config VPN, no public port exposure |
| Process Manager | systemd | Native Ubuntu daemon management, auto-restart on crash |
| IoT Tooling | Bun.spawn → esptool/avrdude | Subprocess execution to flash connected hardware |
| Profiler Integration | Bun.spawn → perf/valgrind | Subprocess execution, stdout parsed and fed to LLM |

---

## 10. Monorepo Structure

XIA is a monorepo managed with Bun Workspaces:

```
xia/
├── packages/
│   └── core/                   # The pure orchestration engine
│       ├── planner/            # Intent → DAG
│       ├── scheduler/          # Dependency resolution + parallelism
│       ├── executor/           # Task dispatch + tool spawning
│       ├── context/            # Context Injector + Data Masking
│       ├── memory/             # SQLite adapter + Qdrant client
│       ├── event-bus/          # Typed event system
│       └── types/              # Shared TypeScript contracts (Task, Agent, Event)
│
├── apps/
│   ├── daemon/                 # xiad — the Ubuntu background service
│   │   ├── ai-router/          # LLM provider dispatch logic
│   │   ├── telegram/           # Telegram bot + Whisper integration
│   │   ├── push/               # NTFY / Pushover integration
│   │   └── server/             # Hono.js server (RPC + WebSockets + SPA)
│   │
│   ├── cli/                    # xia — the RPC client terminal binary
│   │   └── tui/                # Ink-based Terminal UI
│   │
│   └── dashboard/              # Vue 3 Web SPA
│       ├── dag-viewer/         # Real-time DAG graph
│       ├── diff-review/        # Side-by-side code diff + Approve/Reject
│       └── memory-manager/     # Qdrant memory browser + editor
│
├── agents/                     # Agent definitions (I/O contracts)
│   ├── strategy/
│   ├── code-writer/
│   ├── refactor/
│   ├── critic/
│   ├── profiler/               # Hermes-specific
│   ├── compliance-reviewer/    # Auruvi-specific
│   └── serial-monitor/         # IoT-specific
│
└── projects/                   # Where your actual codebases live
    ├── auruvi/
    ├── hermes/
    ├── iocl/
    └── iot/
```

---

*Document Version: 1.0*
*Last Consolidated: 2026-05-01*
*Source files merged: XIA_COMMUNICATION_FINAL.md, XIA_TECH_STACK.md, XIA_DOMAIN_STRATEGY.md*
