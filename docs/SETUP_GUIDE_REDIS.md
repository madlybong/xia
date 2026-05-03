# Setup Guide: Redis (Native Install)
### XIA Infrastructure — Phase 0

Redis is used by XIA as the task queue backend (via BullMQ). This guide installs Redis natively on your Ubuntu Server NUC — no Docker required.

---

## Step 1: Install Redis

```bash
sudo apt update
sudo apt install redis-server -y
```

That's the install. Redis is now on your machine.

---

## Step 2: Configure Redis for Persistence

By default, Redis is a pure in-memory store. If the NUC reboots, your queue is gone. We fix this by enabling **Append-Only File (AOF)** persistence.

Open the Redis config file:

```bash
sudo nano /etc/redis/redis.conf
```

Find the line that says:

```
appendonly no
```

Change it to:

```
appendonly yes
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

---

## Step 3: Bind Redis to Localhost Only

In the same config file, find the line:

```
bind 127.0.0.1 -::1
```

Make sure it looks exactly like this (it usually does by default). This ensures Redis is **only accessible from the NUC itself** — not from Tailscale or the internet.

---

## Step 4: Enable and Start Redis

```bash
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

`enable` means Redis will automatically start every time the NUC boots.

---

## Step 5: Verify It Works

```bash
redis-cli ping
```

You should see:

```
PONG
```

If you see `PONG`, Redis is running correctly. ✅

---

## Step 6: Check Status Anytime

```bash
sudo systemctl status redis-server
```

---

## Troubleshooting

**Problem:** `redis-cli ping` returns `Could not connect to Redis`
**Fix:** The service may not have started. Run `sudo systemctl start redis-server` and try again.

**Problem:** `Unit redis-server.service not found`
**Fix:** The package name may differ. Try `sudo systemctl start redis` instead.

---

*Setup complete. Redis is running natively on the NUC.*
*Next: [SETUP_GUIDE_QDRANT.md](./SETUP_GUIDE_QDRANT.md)*
