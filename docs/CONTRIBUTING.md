# Contributing to XIA

Welcome to the XIA development repository! 

## Repository Structure

XIA is a monorepo managed with Bun Workspaces:

```
xia/
├── packages/
│   ├── core/                   # The pure orchestration engine
│   └── platform/               # Platform-specific compiled binary packages
├── apps/
│   ├── daemon/                 # The backend orchestrator (Hono/BullMQ)
│   ├── cli/                    # (Deprecated) Old CLI codebase, now merged to main
│   ├── telegram/               # Telegram bot interface
│   └── web/                    # Vue 3 Dashboard
├── agents/                     # Domain-specific workers (compile, profiler, compliance)
└── src/                        # The single unified binary entry point (main.ts)
```

## Setup for Local Development

1. **Install Bun:** (v1.3.13+)
2. **Install dependencies:** `bun install`
3. **Run the daemon in dev mode:** `bun run dev` (from root package.json)
4. **Compile binaries locally:** `bash scripts/build-all.sh`

## Publishing a Release

Releases are handled entirely by GitHub Actions.

1. Ensure your working tree is clean.
2. Bump the version in `package.json` and all `packages/platform/*/package.json` files.
3. Commit and tag:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. The `.github/workflows/release.yml` will automatically build the cross-platform binaries using Bun, wrap them in platform-specific npm packages, and publish them to the npm registry.
