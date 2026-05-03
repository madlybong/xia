# Contributing to XIA

Welcome to the XIA development repository! 

## Repository Structure

XIA is a monorepo managed with Bun Workspaces:

```
xia/
├── cli/                        # The unified binary entry point (main.ts + commands/)
├── apps/
│   ├── daemon/                 # The backend orchestrator (Hono + BullMQ)
│   ├── telegram/               # Telegram bot + Whisper voice integration
│   └── web/                    # Vue 3 web dashboard SPA
├── packages/
│   └── core/                   # @xia/core — shared orchestration engine
├── agents/                     # Provider agent plugins (coder, designer, engineer)
├── platform/                   # Platform-specific compiled binary npm packages
└── scripts/                    # build-all.sh, publish.sh, xia-manager.sh
```

## Setup for Local Development

1. **Install Bun:** (v1.3.13+)
2. **Install dependencies:** `bun install`
3. **Run the daemon in dev mode:** `bun run dev` (from root package.json)
4. **Compile binaries locally:** `bash scripts/build-all.sh`

## Publishing a Release

Releases are handled entirely by GitHub Actions.

1. Ensure your working tree is clean.
2. Bump the version in `package.json` and all `platform/*/package.json` files.
3. Commit and tag:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. The `.github/workflows/release.yml` will automatically build the cross-platform binaries using Bun, wrap them in platform-specific npm packages, and publish them to the npm registry.
