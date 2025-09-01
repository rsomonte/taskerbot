# Tasker Bot

Tasker Bot is a Discord bot designed to help users track and maintain personal objectives with streaks and submission limits. You can add this bot to your own Discord server or app to empower your community with goal tracking and accountability.

## Commands

### `/create_objective`
Create a new objective for yourself.  
**Options:**
- `name` (string, required): The name of your objective.
- `frequency` (string, required): How often you can submit this objective. Choices are:
  - `daily`
  - `weekly`
  - `monthly`

**Example:**  
![](https://i.imgur.com/Z936pXa.gif)

---

### `/submit`
Submit an image as proof of completing an objective.  
**Options:**
- `image` (attachment, required): The image to submit as evidence.
- `objective` (string, required): The name of the objective you are submitting for (must match an objective you created).

**Example:**  
![](https://i.imgur.com/UAbUQ28.gif)

- The bot will enforce the frequency you set for each objective.
- If you try to submit too soon, it will tell you when you can submit again.
- Streaks are tracked and displayed for consecutive completions.

---

### `/list_objectives`
List all your current objectives, including their frequency, streaks, and when you can next submit.

**Example:**  
![](https://i.imgur.com/ANsLTEk.gif)

---

### `/delete_objective`
Delete one of your objectives forever.  
**Options:**
- `name` (string, required): The name of the objective you want to delete.

**Example:**  
![](https://i.imgur.com/Oi7NVT7.gif)

---

### `/rename`
Rename one of your objectives.  
**Options:**
- `current_name` (string, required): The current name of the objective you want to rename.
- `new_name` (string, required): The new name for the objective.

This command allows you to change the name of an existing objective while preserving all its data including streak count, submission history, and frequency settings.

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

### Setup Steps
1. **Clone the repository:**
  ```bash
  git clone https://github.com/rsomonte/taskerbot.git
  cd taskerbot
  ```

2. **Create a `.env` file:**
  Copy your Discord bot token, public key, and other secrets into a `.env` file in the project root. Example:
  ```env
  APP_ID=your_discord_app_id
  DISCORD_TOKEN=your_discord_bot_token
  PUBLIC_KEY=your_discord_public_key
  NGROK_AUTHTOKEN=your_ngrok_authtoken
  ```

3. **Build and start the containers:**
  ```bash
  docker-compose up --build
  ```


This will start two containers:
- `taskerbot_app`: The main bot application.
- `ngrok_tunnel`: An ngrok tunnel to expose your bot to Discord for development/testing.

The SQLite database will be stored in the `data/` directory and persisted between restarts.

**Disclaimer:** The ngrok public URL may not appear directly in the output of the `docker-compose up` command. To retrieve the active tunnel URL, run:
```bash
curl http://127.0.0.1:4040/api/tunnels
```
Copy the HTTPS forwarding URL from the output and paste it into your Discord developer portal as the interaction endpoint.

### Updating
To update your bot, pull the latest code and rebuild:
```bash
git pull
docker-compose up --build
```

### Stopping
To stop the containers:
```bash
docker-compose down
```

## Disclaimer

All objectives and related data are stored in a database managed by the bot owner. While your data is not shared with third parties, the server administrator has access to the stored information. Please use the bot with this in mind if privacy is a concern.
