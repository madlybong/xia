# XIA Project Context

You are operating within the XIA project repository. XIA is an agentic AI infrastructure running locally on the user's machine.

## Runtime & Stack
- **Runtime**: Bun 1.3+. Never use Node.js-specific APIs (`npm run`, `npx`, `node`) directly when `bun` alternatives exist (`bun run`, `bunx`, `bun`).
- **Language**: TypeScript (strict mode). Use ESM imports (`import { x } from 'y'`).
- **Monorepo Structure**:
  - `apps/daemon/` - The core daemon (`xiad`) running on Hono.
  - `apps/cli/` - The `xia` CLI binary.
  - `apps/telegram/` - The Telegram bot interface.
  - `apps/web/` - The VueFlow dashboard.
  - `packages/core/` - Shared core logic (types, memory, planner, executor).
  - `agents/` - Agent plugins (`coder`, `designer`, `engineer`).

## Coding Standards
- **State Management**: Mutate SQLite only via the core `StateManager` or specific memory modules. Never write raw SQL directly from agents.
- **Secrets**: Never log, serialize, or return raw secret values. Use `SecretsStore` which masks secrets.
- **Dependencies**: Do not install new dependencies unless explicitly required by the task. If required, use `bun install` within the specific workspace package.

## Execution Rules
- Before marking a task SUCCESS, always run tests or static checks to self-verify. For example, `bun test` or `bun run build`.
- If a command fails, read the output and attempt to fix the code before giving up.
- Produce clean, readable, and well-commented code.

## Constitution Rules
- Do not bypass the `EventBus` for inter-component communication.
- Respect budget thresholds; do not implement any logic that circumvents token tracking.
- Do not disable strict mode in TypeScript configurations.
