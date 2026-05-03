# XIA — Complete Setup Guide
### Fresh Installation on Windows, Linux, and macOS

This guide takes you from a **bare machine** to a fully operational XIA installation in under 15 minutes.

---

## What You're Installing

| Component | Purpose | Required |
|---|---|---|
| **Redis** | Task queue backend (BullMQ) | ✅ Yes |
| **Qdrant** | Long-term semantic memory (vector DB) | ✅ Yes |
| **XIA** | The orchestration engine itself | ✅ Yes |
| Telegram Bot | On-the-go task control from your phone | Optional |

---

## Step 1 — Install Redis

Redis is the backbone of XIA's task queue. It must be running before the daemon starts.

### 🪟 Windows

The recommended option is **Memurai**, a Redis-compatible server built for Windows.

1. Download the installer from: https://www.memurai.com/get-memurai
2. Run the installer. Accept defaults.
3. Memurai installs as a Windows Service and starts automatically.

Verify it's running:
```powershell
redis-cli ping
# Expected output: PONG
```

> If `redis-cli` is not in your PATH, find it at `C:\Program Files\Memurai\redis-cli.exe`

---

### 🐧 Linux (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install redis-server -y

# Enable persistence (survives reboot)
sudo sed -i 's/appendonly no/appendonly yes/' /etc/redis/redis.conf

# Enable and start
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify
redis-cli ping
# Expected: PONG
```

---

### 🍎 macOS

```bash
# Install via Homebrew (install Homebrew first from https://brew.sh if needed)
brew install redis

# Start as a background service (auto-starts on login)
brew services start redis

# Verify
redis-cli ping
# Expected: PONG
```

---

## Step 2 — Install Qdrant

Qdrant is XIA's vector database for semantic long-term memory. XIA will work without it, but memory features will be disabled.

### 🪟 Windows

XIA on Windows expects the Qdrant binary at `C:\qdrant\qdrant.exe`. You can use any location — just update `xia.json` later.

1. Download the latest Windows binary from:  
   https://github.com/qdrant/qdrant/releases/latest  
   Look for: `qdrant-x86_64-pc-windows-msvc.zip`

2. Extract the zip and place `qdrant.exe` in `C:\qdrant\`.

3. Run Qdrant in a terminal (or add it as a Windows Scheduled Task / Task Scheduler):
```powershell
C:\qdrant\qdrant.exe
```

Verify it's running (in a separate terminal):
```powershell
curl http://localhost:6333/readyz
# Expected: {"status":"ok"}
```

**To run Qdrant automatically at login**, create a Scheduled Task:
```powershell
schtasks /create /tn "Qdrant" /tr "C:\qdrant\qdrant.exe" /sc onlogon /ru SYSTEM
```

---

### 🐧 Linux (Ubuntu / Debian)

```bash
# Fetch latest version
QDRANT_VERSION=$(curl -s https://api.github.com/repos/qdrant/qdrant/releases/latest | grep tag_name | cut -d '"' -f 4)

# Download and install
wget https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
sudo mv qdrant /usr/local/bin/
sudo chmod +x /usr/local/bin/qdrant
rm qdrant-x86_64-unknown-linux-gnu.tar.gz

# Create data directories
sudo mkdir -p /var/lib/qdrant/storage /var/lib/qdrant/snapshots

# Install as systemd service
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

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable qdrant
sudo systemctl start qdrant

# Verify
curl http://localhost:6333/readyz
# Expected: {"status":"ok"}
```

---

### 🍎 macOS

```bash
# Download the macOS binary
QDRANT_VERSION=$(curl -s https://api.github.com/repos/qdrant/qdrant/releases/latest | grep tag_name | cut -d '"' -f 4)

curl -L https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-aarch64-apple-darwin.tar.gz -o qdrant.tar.gz
# Note: use x86_64-apple-darwin for Intel Macs

tar -xzf qdrant.tar.gz
sudo mv qdrant /usr/local/bin/
sudo chmod +x /usr/local/bin/qdrant
rm qdrant.tar.gz

# Run as a background service via launchd
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/io.qdrant.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.qdrant</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/qdrant</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/io.qdrant.plist

# Verify
curl http://localhost:6333/readyz
# Expected: {"status":"ok"}
```

---

## Step 3 — Install XIA

XIA is distributed as a single npm package with embedded cross-platform binaries. You need **Node.js** (`node` / `npm`) installed for the global install, but XIA itself runs via the embedded Bun runtime — no further dependencies needed.

```bash
npm install -g @astrake/xia
```

Verify the install:
```bash
xia --version
```

---

## Step 4 — Initialize XIA

Run the interactive setup wizard. It will:
- Create your configuration directories in the appropriate platform location
- Prompt you for your AI provider API keys
- Save everything to a local `global.env` secrets file

```bash
xia init
```

You'll be asked for:

| Prompt | Where to get it |
|---|---|
| `ANTIGRAVITY_API_KEY` | https://aistudio.google.com → API Keys |
| `KILO_API_KEY` | Your Kilo account → API Keys (optional) |
| `TELEGRAM_BOT_TOKEN` | See [SETUP_GUIDE_TELEGRAM.md](./SETUP_GUIDE_TELEGRAM.md) (optional) |
| `TELEGRAM_OWNER_ID` | See [SETUP_GUIDE_TELEGRAM.md](./SETUP_GUIDE_TELEGRAM.md) (optional) |
| Redis URL | Leave as default `redis://localhost:6379` unless you changed it |
| Qdrant URL | Leave as default `http://localhost:6333` unless you changed it |

Your configuration is stored here:

| Platform | Config Directory |
|---|---|
| **Windows** | `%APPDATA%\xia\` |
| **Linux** | `~/.config/xia/` |
| **macOS** | `~/Library/Application Support/xia/` |

The secrets file is at `<config-dir>/secrets/global.env`.

---

## Step 5 — Verify Your Environment

```bash
xia doctor
```

This runs a full health check. Here's what each line means:

```
✅ Bun runtime          1.3.13     → XIA's embedded runtime is working
✅ Redis                Connected  → Task queue is available
✅ Qdrant               Connected  → Long-term memory is available
✅ ANTIGRAVITY_API_KEY  Set        → Primary AI provider configured
⚠️  KILO_API_KEY         Not set   → Optional, AI fallback unavailable
⚠️  TELEGRAM_BOT_TOKEN   Not set   → Optional, Telegram bot will not start
```

**You need at minimum:** Redis ✅, Qdrant ✅, and ANTIGRAVITY_API_KEY ✅.

---

## Step 6 — Start the Daemon

The XIA daemon (`xiad`) is the always-on orchestration engine. Start it:

```bash
xia daemon
```

You should see:
```
Starting XIA daemon on port 3000...
```

The daemon is now running and listening for tasks. Keep this terminal open, or install it as a background service (see below).

---

## Step 7 — Your First Task

Open a **second terminal** and submit your first task:

```bash
xia run "Create a hello world function in TypeScript and write a test for it"
```

Watch the daemon terminal for live progress. Check the status:
```bash
xia tasks
```

If a task requires your approval (e.g., it hit a `human-approve` gate):
```bash
xia approve <task-id>
```

View logs for a specific task:
```bash
xia logs <task-id>
```

---

## Step 8 — (Optional) Install as a Background Service

To have XIA start automatically when your machine boots:

### 🪟 Windows

```bash
xia service install
```

This registers XIA as a Windows Scheduled Task that starts at logon.

To manage it:
```bash
xia service start
xia service stop
xia service uninstall
```

---

### 🐧 Linux

```bash
# The xia-manager.sh script handles systemd service installation
bash /path/to/xia/scripts/xia-manager.sh install

# Or manually:
sudo tee /etc/systemd/system/xia.service > /dev/null << 'EOF'
[Unit]
Description=XIA Autonomous Development Daemon
After=network.target redis.service qdrant.service

[Service]
Type=simple
User=$USER
ExecStart=xia daemon
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable xia
sudo systemctl start xia
```

---

### 🍎 macOS

```bash
cat > ~/Library/LaunchAgents/com.astrake.xia.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.astrake.xia</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/xia</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/xia.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/xia.error.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.astrake.xia.plist
```

---

## Troubleshooting

**`xia: command not found` after npm install**  
→ Your npm global bin directory is not in PATH.  
→ Run `npm bin -g` to find the path, then add it to your PATH.

**`xia doctor` shows Redis ❌**  
→ Redis/Memurai is not running. Start it:
  - Windows: `net start memurai`
  - Linux: `sudo systemctl start redis-server`
  - macOS: `brew services start redis`

**`xia doctor` shows Qdrant ❌**  
→ Qdrant is not running. Start it manually: `qdrant` (or `C:\qdrant\qdrant.exe` on Windows).

**`xia doctor` shows ANTIGRAVITY_API_KEY ❌**  
→ Run `xia init` again to enter your API key. Or manually edit:
  - Windows: `%APPDATA%\xia\secrets\global.env`
  - Linux: `~/.config/xia/secrets/global.env`
  - macOS: `~/Library/Application Support/xia/secrets/global.env`

**Daemon crashes immediately on start**  
→ Check that Redis is running first. The daemon requires Redis to connect BullMQ on startup.

---

## Next Steps

- 📱 **[Set up Telegram bot](./SETUP_GUIDE_TELEGRAM.md)** — Control XIA from your phone
- 🔐 **Configure domain projects** — Edit `%APPDATA%\xia\config\xia.json` to define project paths and constitutions
- 📊 **Web Dashboard** — Open `http://localhost:3000` in your browser while the daemon is running

---

*XIA v0.1.0 — For issues, visit https://github.com/madlybong/xia*
