# ⚛️ XIA — Autonomous Development Infrastructure

**XIA** is a powerful, locally-hosted agentic AI orchestration engine. It transforms natural language intents into directed acyclic graphs (DAGs) of tasks, dispatches them to domain-specific agent workers, and executes them with strict constitutional constraints.

[![npm version](https://badge.fury.io/js/@astrake%2Fxia.svg)](https://badge.fury.io/js/@astrake%2Fxia)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 🚀 Quick Start

XIA is distributed as a single, compiled cross-platform binary. You do not need Bun or Node.js installed to run it.

```bash
npm install -g @astrake/xia
```

### 1. Prerequisites
Before initializing XIA, you must have the following running locally:
* **Redis** (or Memurai on Windows) — Used for the BullMQ task queue.
* **Qdrant** — Vector database for semantic long-term memory.

You will also need API keys for your chosen AI providers (configured during `xia init`):
* **Antigravity API key** — For Gemini 2.5 Flash access.
* **Kilo API key** — For fast code generation (optional).

### 2. Initialization
Run the interactive setup wizard to configure your directories and API keys:

```bash
xia init
```
This will create your config directories (e.g., `%APPDATA%\xia` on Windows, `~/.config/xia` on Linux).

### 3. Health Check
Verify your environment is healthy:

```bash
xia doctor
```

### 4. Start the Daemon
Start the XIA background orchestrator:

```bash
xia daemon
```

*(You can also use `xia service install` to install it as a systemd service or Windows Scheduled Task).*

---

## 💻 Usage

Submit tasks via natural language. The orchestrator will automatically classify the domain, plan the DAG, and dispatch the correct provider agents (Coder, Designer, Engineer).

```bash
xia run "Scaffold a new authentication module using JWT"
```

View the status of your tasks:
```bash
xia tasks
xia status <task_id>
```

Approve or reject tasks blocked by the `human-approve` gate:
```bash
xia approve <task_id>
xia reject <task_id> "Make the password validation stricter"
```

---

## 🧠 Architecture Overview

* **Planner:** Converts intent into a validated DAG (Directed Acyclic Graph) of tasks.
* **Scheduler (BullMQ):** Resolves dependencies and executes tasks in parallel.
* **Context Injector:** Queries Qdrant memory and injects domain-specific rules.
* **Executor:** Dispatches to Provider Agents and enforces gates (e.g., deterministic compile gates, HIPAA compliance gates).
* **Provider Agents:** Two-tier architecture (Provider → Worker). Providers orchestrate granular sub-tasks executed deterministically by workers using `Bun.spawn`.

---

## 📡 Integrations

* **Telegram Bot:** Dispatch tasks via text or voice (Whisper API) directly from your phone. Receive live `worker.progress` updates and inline approval buttons.
* **Web Dashboard:** (Coming Soon) VueFlow-based DAG visualizer and Monaco side-by-side diff reviewer.
* **Push Alerts:** Integration with NTFY and Pushover for `FATAL` daemon alerts.
* **Local LLMs:** Seamless failover to Ollama for sensitive domain rules (e.g., HIPAA compliance).

---

## 🔐 Domain Scoping

XIA natively supports working across different projects. Define your projects in `xia.json`:

```json
{
  "projects": {
    "auruvi": {
      "path": "/home/user/projects/auruvi",
      "constitution": ["HIPAA Compliance Required", "No PII in logs"]
    },
    "hermes": {
      "path": "/home/user/projects/hermes",
      "constitution": ["HFT Latency Constraints", "Zero allocations"]
    }
  }
}
```
When an intent is classified into a domain, XIA automatically scopes the execution to the correct `workingDir` and injects the project's constitution into every agent prompt.

---

## 🤝 Contributing
See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for local development instructions.

## 📖 Detailed Setup Guide
For step-by-step installation instructions for Windows, Linux, and macOS — including Redis, Qdrant, and background service setup — see **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)**.
