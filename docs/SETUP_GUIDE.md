# XIA — Installation & Setup Guide

> **Estimated setup time:** 10–15 minutes  
> **Supported platforms:** Windows 10/11 · Linux (Ubuntu 20.04+) · macOS 12+

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Install Redis](#3-install-redis)
4. [Install Qdrant](#4-install-qdrant)
5. [Install XIA](#5-install-xia)
6. [Run the Setup Wizard](#6-run-the-setup-wizard)
7. [Verify Your Environment](#7-verify-your-environment)
8. [Start the Daemon](#8-start-the-daemon)
9. [Your First Task](#9-your-first-task)
10. [Install as a Background Service](#10-install-as-a-background-service)
11. [Optional: Telegram Integration](#11-optional-telegram-integration)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Overview

XIA runs as a persistent background daemon on your machine. Before it can start, two infrastructure services must be available:

| Service | Role | Required |
|---|---|---|
| **Redis** | Task queue backend (BullMQ) | ✅ Required |
| **Qdrant** | Semantic long-term memory (vector DB) | ✅ Required |
| **AI Provider Key** | Antigravity (Gemini) or Kilo | ✅ At least one |
| **Telegram Bot** | Remote control from your phone | Optional |

The XIA daemon (`xia daemon`) connects to both Redis and Qdrant on startup. If either is unreachable, the daemon will not start.

---

## 2. Prerequisites

Before you begin, ensure you have the following installed:

| Dependency | Minimum Version | Install |
|---|---|---|
| **Node.js** (for `npm install -g`) | v18+ | https://nodejs.org |
| **npm** | v9+ | Bundled with Node.js |

> **Note:** XIA itself runs on an embedded Bun runtime. You do not need Bun installed globally — it is bundled inside the binary you download via npm.

---

## 3. Install Redis

Redis is the backbone of XIA's task queue. It must be running before the daemon starts.

---

<details>
<summary><strong>🪟 Windows</strong></summary>

The recommended option is **Memurai** — a native Redis-compatible server built for Windows, licensed for development use.

**Install:**

1. Download the installer from: **https://www.memurai.com/get-memurai**
2. Run the installer with default options.
3. Memurai registers itself as a **Windows Service** and starts automatically on boot.

**Verify:**

Open PowerShell and run:
```powershell
redis-cli ping
```
Expected output:
```
PONG
```

> If `redis-cli` is not in your PATH, find it at `C:\Program Files\Memurai\redis-cli.exe`

</details>

---

<details>
<summary><strong>🐧 Linux (Ubuntu / Debian)</strong></summary>

**Install:**

```bash
sudo apt update && sudo apt install redis-server -y
```

**Enable persistence** (survives reboots — highly recommended):

```bash
sudo sed -i 's/appendonly no/appendonly yes/' /etc/redis/redis.conf
```

**Enable and start:**

```bash
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

**Verify:**

```bash
redis-cli ping
```
Expected output:
```
PONG
```

</details>

---

<details>
<summary><strong>🍎 macOS</strong></summary>

**Install via Homebrew** (install Homebrew from https://brew.sh if not already installed):

```bash
brew install redis
```

**Start as a background service** (auto-starts on login):

```bash
brew services start redis
```

**Verify:**

```bash
redis-cli ping
```
Expected output:
```
PONG
```

</details>

---

## 4. Install Qdrant

Qdrant is XIA's vector database for semantic long-term memory. It stores the outputs of previous agent runs and retrieves relevant context for future tasks.

---

<details>
<summary><strong>🪟 Windows</strong></summary>

**Download:**

1. Go to: **https://github.com/qdrant/qdrant/releases/latest**
2. Download: `qdrant-x86_64-pc-windows-msvc.zip`
3. Extract the zip and place `qdrant.exe` at `C:\qdrant\qdrant.exe`

**Run:**

```powershell
C:\qdrant\qdrant.exe
```

Leave this terminal open, or follow the service setup below to run it automatically.

**Run automatically at startup** (via Windows Task Scheduler):

```powershell
schtasks /create /tn "Qdrant" /tr "C:\qdrant\qdrant.exe" /sc onlogon /ru SYSTEM /f
```

**Verify** (in a new terminal):

```powershell
curl http://localhost:6333/readyz
```
Expected output:
```json
{"status":"ok"}
```

</details>

---

<details>
<summary><strong>🐧 Linux (Ubuntu / Debian)</strong></summary>

**Download and install:**

```bash
QDRANT_VERSION=$(curl -s https://api.github.com/repos/qdrant/qdrant/releases/latest \
  | grep tag_name | cut -d '"' -f 4)

wget "https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-x86_64-unknown-linux-gnu.tar.gz"
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
sudo mv qdrant /usr/local/bin/qdrant
sudo chmod +x /usr/local/bin/qdrant
rm qdrant-x86_64-unknown-linux-gnu.tar.gz
```

**Create data directories:**

```bash
sudo mkdir -p /var/lib/qdrant/storage /var/lib/qdrant/snapshots
```

**Install as a systemd service:**

```bash
sudo tee /etc/systemd/system/qdrant.service > /dev/null << 'EOF'
[Unit]
Description=Qdrant Vector Database
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/qdrant
WorkingDirectory=/var/lib/qdrant
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable qdrant
sudo systemctl start qdrant
```

**Verify:**

```bash
curl http://localhost:6333/readyz
```
Expected output:
```json
{"status":"ok"}
```

</details>

---

<details>
<summary><strong>🍎 macOS</strong></summary>

**Download and install:**

```bash
QDRANT_VERSION=$(curl -s https://api.github.com/repos/qdrant/qdrant/releases/latest \
  | grep tag_name | cut -d '"' -f 4)

# Apple Silicon (M1/M2/M3):
curl -L "https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-aarch64-apple-darwin.tar.gz" -o qdrant.tar.gz

# Intel Mac:
# curl -L "https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-x86_64-apple-darwin.tar.gz" -o qdrant.tar.gz

tar -xzf qdrant.tar.gz
sudo mv qdrant /usr/local/bin/qdrant
chmod +x /usr/local/bin/qdrant
rm qdrant.tar.gz
```

**Install as a launchd service** (auto-starts on login):

```bash
cat > ~/Library/LaunchAgents/io.qdrant.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.qdrant</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/qdrant</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/qdrant.log</string>
  <key>StandardErrorPath</key><string>/tmp/qdrant.error.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/io.qdrant.plist
```

**Verify:**

```bash
curl http://localhost:6333/readyz
```
Expected output:
```json
{"status":"ok"}
```

</details>

---

## 5. Install XIA

XIA is published to npm as a single package with embedded cross-platform binaries.

```bash
npm install -g @astrake/xia
```

Verify the installation:

```bash
xia --version
```

> **If `xia` is not found after install**, your npm global bin directory is not in your PATH. Run `npm bin -g` to find the correct path and add it to your shell profile (`.bashrc`, `.zshrc`, or Windows System Environment Variables).

---

## 6. Run the Setup Wizard

The `xia init` wizard creates your configuration directories, stores your API keys securely, and saves your infrastructure settings.

```bash
xia init
```

You will be prompted for the following:

| Prompt | Where to find it | Required |
|---|---|---|
| `ANTIGRAVITY_API_KEY` | [Google AI Studio](https://aistudio.google.com) → **Get API key** | ✅ |
| `KILO_API_KEY` | Your Kilo account → **API Keys** | Optional |
| `TELEGRAM_BOT_TOKEN` | See [Section 11](#11-optional-telegram-integration) | Optional |
| `TELEGRAM_OWNER_ID` | See [Section 11](#11-optional-telegram-integration) | Optional |
| Redis URL | Default: `redis://localhost:6379` — press Enter to accept | ✅ |
| Qdrant URL | Default: `http://localhost:6333` — press Enter to accept | ✅ |

After the wizard completes, your configuration will be stored here:

| Platform | Configuration Directory |
|---|---|
| **Windows** | `%APPDATA%\xia\` |
| **Linux** | `~/.config/xia/` |
| **macOS** | `~/Library/Application Support/xia/` |

The directory structure created:
```
<config-dir>/
├── config/
│   └── xia.json           # Daemon settings (ports, URLs, projects)
├── secrets/
│   └── global.env         # API keys and tokens (never share this file)
├── data/
│   └── xia.sqlite         # Task state and execution logs
└── logs/
    └── *.log              # Daemon and agent log files
```

---

## 7. Verify Your Environment

Run the health check to confirm everything is correctly configured:

```bash
xia doctor
```

A fully configured system should show:

```
=== XIA Health Check ===

✅ Bun runtime          1.3.13
✅ Redis                Configured at redis://localhost:6379
✅ Qdrant               Connected at http://localhost:6333 (v1.13.x)
✅ ANTIGRAVITY_API_KEY  Set
⚠️  KILO_API_KEY         Not set        ← Optional: AI fallback unavailable
⚠️  TELEGRAM_BOT_TOKEN   Not set        ← Optional: Telegram bot disabled

All checks passed! System is ready.
```

**You need at minimum:** Redis ✅, Qdrant ✅, and ANTIGRAVITY_API_KEY ✅ before proceeding.

---

## 8. Start the Daemon

```bash
xia daemon
```

Expected output:
```
Starting XIA daemon on port 3000...
```

The daemon is now running and accepting tasks. To stop it, press `Ctrl+C`.

> For production use, see [Section 10](#10-install-as-a-background-service) to run the daemon automatically as a system service.

---

## 9. Your First Task

With the daemon running, open a **second terminal** and submit a task in natural language:

```bash
xia run "Create a TypeScript utility function that debounces a callback, and write a unit test for it"
```

XIA will:
1. Classify the domain and select the appropriate agent
2. Generate a DAG (plan) of tasks
3. Execute them and report back

**Monitor progress:**

```bash
# List all tasks and their current state
xia tasks

# Get detailed status for a specific task
xia status <task-id>

# Stream live logs from a task
xia logs <task-id>
```

**Review and approve blocked tasks:**

Some tasks require human approval before they can be marked as complete (e.g., code that writes to disk or makes API calls). When a task is blocked:

```bash
# Approve a blocked task
xia approve <task-id>

# Reject a task with feedback (it will retry with your notes)
xia reject <task-id> "Use async/await instead of callbacks"
```

**Monitor token spend:**

```bash
xia budget
```

---

## 10. Install as a Background Service

To have the XIA daemon start automatically when your machine boots:

---

<details>
<summary><strong>🪟 Windows</strong></summary>

```bash
xia service install
```

This registers XIA as a **Windows Scheduled Task** that runs at logon.

Manage the service:
```bash
xia service start
xia service stop
xia service uninstall
```

</details>

---

<details>
<summary><strong>🐧 Linux (Ubuntu / Debian)</strong></summary>

```bash
# Replace 'youruser' with your actual Linux username
sudo tee /etc/systemd/system/xia.service > /dev/null << EOF
[Unit]
Description=XIA Autonomous Development Daemon
After=network.target redis.service qdrant.service

[Service]
Type=simple
User=$(whoami)
ExecStart=$(which xia) daemon
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable xia
sudo systemctl start xia

# Check status
sudo systemctl status xia

# View live logs
sudo journalctl -u xia -f
```

</details>

---

<details>
<summary><strong>🍎 macOS</strong></summary>

```bash
XIA_PATH=$(which xia)

cat > ~/Library/LaunchAgents/com.astrake.xia.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.astrake.xia</string>
  <key>ProgramArguments</key>
  <array>
    <string>${XIA_PATH}</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/xia.log</string>
  <key>StandardErrorPath</key><string>/tmp/xia.error.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.astrake.xia.plist

# View logs
tail -f /tmp/xia.log
```

</details>

---

## 11. Optional: Telegram Integration

Telegram integration lets you submit tasks and receive live notifications from anywhere — including voice notes transcribed via the Whisper API.

### Step 1 — Create a Bot

1. Open Telegram and search for **@BotFather** (verified with a blue ✅ checkmark).
2. Send `/newbot`
3. Follow the prompts to choose a display name and a unique username (must end in `bot`).
4. BotFather will reply with a **Bot Token** — a long string like:
   ```
   7123456789:AAHdqTcvCH1vGWJxfSeofSoJSEIXNLF4Dls
   ```
   **Copy this token. Treat it like a password — never share it.**

### Step 2 — Get Your Telegram User ID

XIA will only accept commands from your personal account. You need your numeric user ID:

1. In Telegram, search for **@userinfobot**
2. Send `/start`
3. It will reply with your ID, e.g., `Id: 987654321`

### Step 3 — Add to XIA

Run `xia init` again (it will merge with existing config, not overwrite) and enter your token and user ID when prompted. Or add them manually to your secrets file:

| Platform | Secrets File Path |
|---|---|
| Windows | `%APPDATA%\xia\secrets\global.env` |
| Linux | `~/.config/xia/secrets/global.env` |
| macOS | `~/Library/Application Support/xia/secrets/global.env` |

Add these lines:
```env
TELEGRAM_BOT_TOKEN=7123456789:AAHdqTcvCH1vGWJxfSeofSoJSEIXNLF4Dls
TELEGRAM_OWNER_ID=987654321
```

Restart the daemon for the changes to take effect.

### Step 4 — Set Bot Commands (Optional but recommended)

In BotFather, send `/setcommands`, select your bot, then paste:

```
run - Submit a new task by natural language
status - Show all active and queued tasks
approve - Approve a blocked task
cancel - Cancel a running task
budget - View current token spend
```

### Step 5 — Test It

Start the XIA daemon if it isn't already running (`xia daemon`), then send a message to your bot in Telegram.

---

## 12. Troubleshooting

### `xia: command not found` after `npm install -g`

Your npm global binary directory is not in your system PATH.

```bash
# Find the correct path
npm bin -g
```

Add the output path to your PATH:

- **Windows:** System Properties → Environment Variables → `Path`
- **Linux/macOS:** Add `export PATH="$(npm bin -g):$PATH"` to your `~/.bashrc` or `~/.zshrc`, then run `source ~/.bashrc`

---

### `xia doctor` shows Redis ❌

Redis is not running. Start it:

| Platform | Command |
|---|---|
| Windows | `net start memurai` (or restart the Memurai service from Services) |
| Linux | `sudo systemctl start redis-server` |
| macOS | `brew services start redis` |

---

### `xia doctor` shows Qdrant ❌

Qdrant is not running. Start it:

| Platform | Command |
|---|---|
| Windows | `C:\qdrant\qdrant.exe` (or check the Scheduled Task) |
| Linux | `sudo systemctl start qdrant` |
| macOS | `launchctl load ~/Library/LaunchAgents/io.qdrant.plist` |

---

### `xia doctor` shows ANTIGRAVITY_API_KEY ❌

Your API key is missing. Edit your secrets file directly:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\xia\secrets\global.env` |
| Linux | `~/.config/xia/secrets/global.env` |
| macOS | `~/Library/Application Support/xia/secrets/global.env` |

Add the line:
```env
ANTIGRAVITY_API_KEY=your-api-key-here
```

Then restart the daemon.

---

### Daemon crashes immediately on startup

The most common cause is Redis not being available. Ensure Redis is running and reachable at the URL shown in `xia doctor`, then start the daemon again.

---

### Port 3000 is already in use

Another process is using port 3000. Change the daemon port in your config file:

```json
// %APPDATA%\xia\config\xia.json  (or ~/.config/xia/config/xia.json)
{
  "daemonPort": 3001
}
```

---

## What's Next

- 📖 **[SPEC.md](./SPEC.md)** — Full architectural specification for XIA
- 🤝 **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Local development setup and release process
- 🐙 **[GitHub Repository](https://github.com/madlybong/xia)** — Source code, issues, and changelog

---

*XIA v0.1.0 — © 2026 Astrake. MIT License.*
