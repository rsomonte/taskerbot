# Tasker Bot Commands

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

**Example:**  
![](https://i.imgur.com/G7rsDSJ.gif)

---
### `/help`
Get help with the commands of the bot directly in discord.
Choose the command you need help as an option.

**Example:**  
![](https://i.imgur.com/wAn5Xiq.gif)
---
### `/settings`
Change settings for how the bot interacts with you.  
**Options:**
- `visibility` (string, optional): Choose how the bot's messages are displayed to you. Options are:
  - `ephemeral` (default): Messages are only visible to you.
  - `public`: Messages are visible to everyone in the channel.

**Example:**  
![](https://i.imgur.com/fMPyBjF.gif)
