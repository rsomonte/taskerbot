# Tasker Bot

Tasker Bot is a Discord bot designed to help users track and maintain personal objectives with streaks and submission limits. You can add this bot to your own Discord server or app to empower your community with goal tracking and accountability.

## Commands

For a full list of commands and usage examples, please see [COMMANDS.md](COMMANDS.md).

---

## Features

- **Personal Objectives:** Each user can create and manage their own objectives.
- **Submission Limits:** Objectives can be submitted daily, weekly, or monthly.
- **Streak Tracking:** Keep track of your consecutive completions for extra motivation.
- **Image Proof:** Require an image as evidence for each submission.
- **Permanent Deletion:** Remove objectives you no longer want to track.

---

## Add Tasker Bot to Your Server

You can [add Tasker Bot](https://discord.com/oauth2/authorize?client_id=1378919723189932124) to your Discord server or apps section and start using these commands right away!

---

## Self-Hosting with Docker

You can run Tasker Bot on your own server using Docker and Docker Compose. This is the recommended way to deploy for personal or private use.

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- A publicly accessible server or domain name
- Discord bot application set up in the [Discord Developer Portal](https://discord.com/developers/applications)
- A [Turso](https://turso.tech/) database

### Setup Steps
1. **Clone the repository:**
   ```bash
   git clone https://github.com/rsomonte/taskerbot.git
   cd taskerbot
   ```

2. **Create a `.env` file:**
   Copy your Discord bot credentials and Turso database details into a `.env` file in the project root:
   ```env
   APP_ID=your_discord_app_id
   DISCORD_TOKEN=your_discord_bot_token
   PUBLIC_KEY=your_discord_public_key
   PORT=3000
   TURSO_DATABASE_URL=libsql://your-database.turso.io
   TURSO_AUTH_TOKEN=your_turso_auth_token
   ```

3. **Configure Discord Developer Portal:**
   - Go to your [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your bot application
   - Navigate to "General Information" and set the **Interactions Endpoint URL** to:
     ```
     https://your-domain.com/interactions
     ```
   - Replace `your-domain.com` with your actual server's domain or IP address

4. **Start the bot:**
   ```bash
   docker-compose up -d
   ```

The bot will be available on port 3000. Make sure this port is accessible from the internet so Discord can send interaction events to your bot.

The database is hosted on Turso, so your data is persisted automatically.

### Updating
To update your bot, pull the latest code and rebuild:
```bash
git pull
docker-compose up -d --build
```

### Stopping
To stop the container:
```bash
docker-compose down
```

## Disclaimer

The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement or course of performance.
