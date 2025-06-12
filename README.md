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
`/create_objective name: "Read a book" frequency: daily`

---

### `/submit`
Submit an image as proof of completing an objective.  
**Options:**
- `image` (attachment, required): The image to submit as evidence.
- `objective` (string, required): The name of the objective you are submitting for (must match an objective you created).

**Example:**  
`/submit image: [upload file] objective: "Read a book"`

- The bot will enforce the frequency you set for each objective.
- If you try to submit too soon, it will tell you when you can submit again.
- Streaks are tracked and displayed for consecutive completions.

---

### `/list_objectives`
List all your current objectives, including their frequency, streaks, and when you can next submit.

**Example:**  
`/list_objectives`

---

### `/delete_objective`
Delete one of your objectives forever.  
**Options:**
- `name` (string, required): The name of the objective you want to delete.

**Example:**  
`/delete_objective name: "Read a book"`

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

## Disclaimer

All objectives and related data are stored in a database managed by the bot owner. While your data is not shared with third parties, the server administrator has access to the stored information. Please use the bot with this in mind if privacy is a concern.
