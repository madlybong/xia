# Setup Guide: Qdrant (Native Binary Install)
### XIA Infrastructure — Phase 0

Qdrant is XIA's long-term semantic memory store (vector database). This guide installs the native Qdrant binary directly on your Ubuntu Server NUC and runs it as a proper systemd background service — no Docker required.

---

## Step 1: Download the Qdrant Binary

Qdrant is written in Rust and ships as a single, self-contained binary. Run this on your NUC:

```bash
# Fetch the latest version tag from GitHub
QDRANT_VERSION=$(curl -s https://api.github.com/repos/qdrant/qdrant/releases/latest | grep tag_name | cut -d '"' -f 4)

echo "Installing Qdrant $QDRANT_VERSION..."

# Download the binary for x86_64 Linux
wget https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-x86_64-unknown-linux-gnu.tar.gz

# Extract the binary
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz

# Move it to a system directory and make it executable
sudo mv qdrant /usr/local/bin/
sudo chmod +x /usr/local/bin/qdrant

# Clean up the downloaded archive
rm qdrant-x86_64-unknown-linux-gnu.tar.gz
```

Verify the binary works:

```bash
qdrant --version
```

You should see a version number printed. ✅

---

## Step 2: Create Directories

Qdrant needs places to store its data and configuration:

```bash
sudo mkdir -p /var/lib/qdrant/storage
sudo mkdir -p /var/lib/qdrant/snapshots
sudo mkdir -p /etc/qdrant
```

---

## Step 3: Create the Configuration File

```bash
sudo nano /etc/qdrant/config.yaml
```

Paste the following content exactly:

```yaml
storage:
  storage_path: "/var/lib/qdrant/storage"
  snapshots_path: "/var/lib/qdrant/snapshots"

service:
  host: "127.0.0.1"    # Localhost only — not accessible on Tailscale
  http_port: 6333
  grpc_port: 6334

# Uncomment and set this when you're ready to add authentication
# api_key: "your-secret-api-key-here"
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

> **Important:** `host: "127.0.0.1"` binds Qdrant to localhost only. XIA's daemon (`xiad`) talks to it locally. Nothing else can reach it.

---

## Step 4: Create a Dedicated System User

Running Qdrant as root is bad practice. Create a dedicated user:

```bash
sudo useradd --system --no-create-home --shell /bin/false qdrant
```

Give this user ownership of the data directories:

```bash
sudo chown -R qdrant:qdrant /var/lib/qdrant
sudo chown -R qdrant:qdrant /etc/qdrant
```

---

## Step 5: Create the systemd Service

```bash
sudo nano /etc/systemd/system/qdrant.service
```

Paste the following:

```ini
[Unit]
Description=Qdrant Vector Database
After=network.target

[Service]
Type=simple
User=qdrant
Group=qdrant
ExecStart=/usr/local/bin/qdrant --config-path /etc/qdrant/config.yaml
WorkingDirectory=/var/lib/qdrant
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Save and exit.

---

## Step 6: Enable and Start Qdrant

```bash
sudo systemctl daemon-reload
sudo systemctl enable qdrant
sudo systemctl start qdrant
```

---

## Step 7: Verify It Works

```bash
curl http://localhost:6333/readyz
```

You should see:

```json
{"status":"ok"}
```

If you see `{"status":"ok"}`, Qdrant is running correctly. ✅

---

## Step 8: Check Status Anytime

```bash
sudo systemctl status qdrant
```

---

## Troubleshooting

**Problem:** `curl` returns `Connection refused`
**Fix:** Wait 5 seconds after starting — Qdrant takes a moment to initialize. Then try again.

**Problem:** `qdrant: command not found` when running the version check
**Fix:** The binary may not be in your PATH. Try running `/usr/local/bin/qdrant --version` directly.

**Problem:** Service fails with `Permission denied` on the storage directory
**Fix:** Re-run `sudo chown -R qdrant:qdrant /var/lib/qdrant` to ensure the qdrant user owns its directories.

---

*Setup complete. Qdrant is running natively on the NUC.*
*Next: [SETUP_GUIDE_TELEGRAM.md](./SETUP_GUIDE_TELEGRAM.md)*
