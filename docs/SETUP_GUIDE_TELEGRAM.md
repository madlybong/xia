# Setup Guide: Telegram Bot
### XIA Infrastructure — Phase 0

XIA uses a Telegram Bot to receive your commands on-the-go and send you task notifications. This guide walks you through creating the bot and retrieving its token.

---

## What You'll Get

At the end of this guide, you will have:
- A Telegram bot that belongs to you (no one else can use it)
- A **bot token** — a secret string that XIA uses to control the bot
- The bot set up to only respond to your Telegram account

---

## Step 1: Open Telegram and Find BotFather

**BotFather** is Telegram's official bot for creating and managing bots.

1. Open the Telegram app on your phone or desktop.
2. In the search bar at the top, type: `@BotFather`
3. Tap on the result that shows a blue checkmark ✅ — this is the official one.
4. Tap **Start** (or type `/start`).

You'll see a welcome message listing all the commands BotFather understands.

---

## Step 2: Create Your Bot

Type this command in the BotFather chat:

```
/newbot
```

BotFather will ask you two questions:

**Question 1:** *"Alright, a new bot. How are we going to call it? Please choose a name for your bot."*

Type a display name. This is what shows up in your chat list. Example:
```
XIA
```

**Question 2:** *"Good. Now let's choose a username for your bot. It must end in 'bot'."*

Type a unique username. This must be globally unique across all of Telegram. Example:
```
xia_myname_bot
```
*(replace `myname` with something unique to you)*

If the username is taken, BotFather will tell you. Try a different one.

---

## Step 3: Save Your Bot Token

After you choose a username, BotFather will reply with a message like this:

```
Done! Congratulations on your new bot. You will find it at t.me/xia_myname_bot.

Use this token to access the HTTP API:
7123456789:AAHdqTcvCH1vGWJxfSeofSoJSEIXNLF4Dls

Keep your token secure and store it safely, it can be used by anyone to control your bot.
```

**Copy the token** (the long string starting with numbers and a colon).

This is your `TELEGRAM_BOT_TOKEN`. It goes into your XIA secrets file.

> ⚠️ **Never share this token.** Anyone who has it can control your bot.

---

## Step 4: Store the Token on Your NUC

SSH into your NUC and open the global secrets file:

```bash
sudo nano /etc/xia/secrets/global.env
```

Add this line (replace with your actual token):

```
TELEGRAM_BOT_TOKEN=7123456789:AAHdqTcvCH1vGWJxfSeofSoJSEIXNLF4Dls
```

Save and exit. Verify the file permissions are locked down:

```bash
sudo chmod 600 /etc/xia/secrets/global.env
sudo chown xia:xia /etc/xia/secrets/global.env
```

---

## Step 5: Get Your Personal Telegram User ID

XIA must be configured to **only accept commands from you**. To do this, XIA needs your personal Telegram user ID (a number, not your username).

1. In Telegram, search for `@userinfobot`
2. Start a chat and type `/start`
3. It will reply with your user ID. It looks like: `Id: 987654321`

Copy that number and add it to your secrets file:

```bash
sudo nano /etc/xia/secrets/global.env
```

Add:
```
TELEGRAM_OWNER_ID=987654321
```

XIA's Telegram handler will reject all messages from any user ID that is not this one.

---

## Step 6: Set Bot Commands (Optional but Recommended)

This makes your bot show a menu of commands in Telegram. Back in the BotFather chat, type:

```
/setcommands
```

BotFather will ask which bot to configure. Send the username of your bot:
```
@xia_myname_bot
```

Then paste this list of commands:
```
run - Start a new task
status - Show all active tasks
approve - Approve a blocked task
cancel - Cancel a task
budget - Show current token spend
```

BotFather will confirm the commands are set.

---

## Step 7: Test Your Bot

1. In Telegram, search for your bot's username (e.g., `@xia_myname_bot`)
2. Tap **Start**
3. Send any message

Nothing will happen yet — XIA isn't running. But when XIA is running, this is where your commands will go.

---

## Summary: What You Have Now

| Item | Value |
|---|---|
| Bot Username | `@xia_myname_bot` |
| Bot Token | In `/etc/xia/secrets/global.env` as `TELEGRAM_BOT_TOKEN` |
| Your User ID | In `/etc/xia/secrets/global.env` as `TELEGRAM_OWNER_ID` |

---

*Setup complete. Telegram bot is created and token is stored.*
*Phase 0 infrastructure is now complete.*
*Next: [packages/core/types/index.ts](../packages/core/types/index.ts)*
