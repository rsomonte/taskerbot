import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import Database from 'better-sqlite3';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

// --- Discord.js client for DMs ---
const botClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});
botClient.login(process.env.DISCORD_TOKEN);

// --- Express app setup ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- SQLite setup ---
const db = new Database('./data/objectives.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS objectives (
    userId TEXT,
    name TEXT,
    frequency TEXT,
    lastSubmitted INTEGER,
    streak INTEGER,
    lastStreakDay TEXT,
    lastReminded INTEGER,
    PRIMARY KEY (userId, name)
  )
`);

// --- Helper functions ---

function getObjectives(userId) {
  return db.prepare('SELECT * FROM objectives WHERE userId = ?').all(userId);
}
function getObjective(userId, name) {
  return db.prepare('SELECT * FROM objectives WHERE userId = ? AND name = ?').get(userId, name);
}
function upsertObjective(obj) {
  db.prepare(`
    INSERT INTO objectives (userId, name, frequency, lastSubmitted, streak, lastStreakDay, lastReminded)
    VALUES (@userId, @name, @frequency, @lastSubmitted, @streak, @lastStreakDay, @lastReminded)
    ON CONFLICT(userId, name) DO UPDATE SET
      frequency=excluded.frequency,
      lastSubmitted=excluded.lastSubmitted,
      streak=excluded.streak,
      lastStreakDay=excluded.lastStreakDay,
      lastReminded=excluded.lastReminded
  `).run(obj);
}
function createObjective(obj) {
  db.prepare(`
    INSERT INTO objectives (userId, name, frequency, lastSubmitted, streak, lastStreakDay, lastReminded)
    VALUES (@userId, @name, @frequency, NULL, 0, NULL, NULL)
  `).run(obj);
}
function deleteObjective(userId, name) {
  db.prepare('DELETE FROM objectives WHERE userId = ? AND name = ?').run(userId, name);
}
function renameObjective(userId, currentName, newName) {
  db.prepare('UPDATE objectives SET name = ? WHERE userId = ? AND name = ?').run(newName, userId, currentName);
}

/**
 * Returns the next allowed submission timestamp for an objective.
 * @param {object} obj - The objective object from the DB.
 * @returns {number} - Timestamp in ms when the window opens.
 */
function getNextAllowedTime(obj) {
  if (!obj.lastSubmitted) return Date.now(); // Window is open now if never submitted
  if (obj.frequency === 'daily') {
    return obj.lastSubmitted + 22 * 60 * 60 * 1000;
  }
  if (obj.frequency === 'weekly') {
    return obj.lastSubmitted + (7 * 24 - 6) * 60 * 60 * 1000;
  }
  if (obj.frequency === 'monthly') {
    return obj.lastSubmitted + (30 * 24 - 6) * 60 * 60 * 1000;
  }
  return Date.now();
}

// Helper for ephemeral error responses
function sendEphemeral(res, content) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

// --- 24h Reminder Job ---
setInterval(async () => {
  const now = Date.now();
  const objectives = db.prepare(`SELECT * FROM objectives`).all();

  for (const obj of objectives) {
    const windowOpen = getNextAllowedTime(obj);

    // Only remind if:
    // - The window has been open for more than 24h
    // - The user hasn't been reminded since the window opened
    // - The user hasn't submitted since the window opened
    if (
      now > windowOpen + 24 * 60 * 60 * 1000 &&
      (!obj.lastReminded || obj.lastReminded < windowOpen)
    ) {
      try {
        const user = await botClient.users.fetch(obj.userId);
        if (user) {
          await user.send(
            `⏰ Reminder: You haven't submitted your objective "**${obj.name}**" since it became available over 24 hours ago. Don't forget to keep your streak going!`
          );
          db.prepare(
            `UPDATE objectives SET lastReminded = ? WHERE userId = ? AND name = ?`
          ).run(now, obj.userId, obj.name);
        }
      } catch (err) {
        // Handle specific Discord API errors
        if (err.code === 50007) {
          // Cannot send messages to this user (DMs disabled or blocked)
          console.log(`User ${obj.userId} has DMs disabled or blocked the bot. Skipping reminder for objective "${obj.name}".`);
          // Mark as reminded to prevent spam attempts
          db.prepare(
            `UPDATE objectives SET lastReminded = ? WHERE userId = ? AND name = ?`
          ).run(now, obj.userId, obj.name);
        } else if (err.code === 10013) {
          // Unknown user (user account deleted or invalid)
          console.log(`User ${obj.userId} not found (account may be deleted). Skipping reminder for objective "${obj.name}".`);
          // Mark as reminded to prevent future attempts
          db.prepare(
            `UPDATE objectives SET lastReminded = ? WHERE userId = ? AND name = ?`
          ).run(now, obj.userId, obj.name);
        } else {
          // Other errors - log but don't mark as reminded to retry later
          console.error(`Failed to send DM to user ${obj.userId} for objective "${obj.name}":`, err.message);
        }
      }
    }
  }
}, 60 * 60 * 1000); // Check every hour

// --- Express route for interactions ---
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { id, type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    if (name === 'submit') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const imageOption = data.options.find(opt => opt.name === 'image');
      const objectiveOption = data.options.find(opt => opt.name === 'objective');
      const objective = objectiveOption?.value?.trim();

      // Try to find the attachment in all possible locations
      let attachment = null;
      if (imageOption?.value && typeof imageOption.value === 'object' && imageOption.value.url) {
        attachment = imageOption.value;
      } else if (imageOption?.value && data.resolved && data.resolved.attachments) {
        attachment = data.resolved.attachments[imageOption.value];
      } else if (imageOption?.value && req.body.attachments) {
        attachment = req.body.attachments.find(att => att.id === imageOption.value);
      }

      // Error handling
      if (!attachment && !objective) {
        return sendEphemeral(res, 'Missing both image and objective.');
      }
      if (!attachment) {
        return sendEphemeral(res, 'Missing image.');
      }
      if (!objective) {
        return sendEphemeral(res, 'Missing objective.');
      }

      // Find the objective object in the database
      let obj = getObjective(userId, objective);

      if (!obj) {
        return sendEphemeral(res, `Objective "${objective}" not found. Please create it first with /create_objective.`);
      }

      // Frequency check
      const now = Date.now();
      const nextAllowed = getNextAllowedTime(obj);
      if (obj.lastSubmitted && now < nextAllowed) {
        const discordTs = `<t:${Math.floor(nextAllowed / 1000)}:R>`;
        return sendEphemeral(res, `You have already submitted **${objective}**. Try again ${discordTs}.`);
      }

      // Mark as submitted
      obj.lastSubmitted = now;

      // Streak logic
      const today = new Date();
      const lastStreakDay = obj.lastStreakDay ? new Date(obj.lastStreakDay) : null;
      let isConsecutive = false;
      if (lastStreakDay) {
        // Check if last streak day was yesterday (for daily), last week (for weekly), last month (for monthly)
        if (obj.frequency === 'daily') {
          const diff = Math.floor((today - lastStreakDay) / (24 * 60 * 60 * 1000));
          isConsecutive = diff === 1;
        } else if (obj.frequency === 'weekly') {
          const diff = Math.floor((today - lastStreakDay) / (7 * 24 * 60 * 60 * 1000));
          isConsecutive = diff === 1;
        } else if (obj.frequency === 'monthly') {
          isConsecutive = (today.getMonth() === lastStreakDay.getMonth() + 1) &&
                          (today.getFullYear() === lastStreakDay.getFullYear());
        }
      }
      if (isConsecutive) {
        obj.streak = (obj.streak || 0) + 1;
      } else {
        obj.streak = 1;
      }
      obj.lastStreakDay = today.toISOString().split('T')[0]; // Store as YYYY-MM-DD

      upsertObjective(obj);

      // Calculate next allowed submission time for response (AFTER updating lastSubmitted)
      const nextAllowedAfter = getNextAllowedTime(obj);
      const discordTs = `<t:${Math.floor(nextAllowedAfter / 1000)}:R>`;
      const userMention = `<@${userId}>`;

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              description: `Objective '${objective}' completed!` +
                (obj.streak > 3 ? `\nStreak: ${obj.streak} 🔥` : ''),
              image: { url: attachment.url },
            },
            {
              description: `${userMention} will be able to submit this objective again ${discordTs}`,
            },
          ],
        },
      });
    }

    // "create_objective" command
    if (name === 'create_objective') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const nameOption = data.options.find(opt => opt.name === 'name');
      const freqOption = data.options.find(opt => opt.name === 'frequency');
      const objectiveName = nameOption?.value?.trim();
      const frequency = freqOption?.value;

      if (!objectiveName || !frequency) {
        return sendEphemeral(res, 'Objective name and frequency are required.');
      }

      // Check if already exists
      if (getObjective(userId, objectiveName)) {
        return sendEphemeral(res, `Objective "${objectiveName}" already exists.`);
      }

      createObjective({
        userId,
        name: objectiveName,
        frequency,
      });

      return sendEphemeral(res, `Objective "${objectiveName}" (${frequency}) created!`);
    }

    // "list_objectives" command
    if (name === 'list_objectives') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const objectives = getObjectives(userId);
      if (objectives.length === 0) {
        return sendEphemeral(res, 'You have no objectives.');
      }
      const now = Date.now();
      const lines = objectives.map(obj => {
        const nextAllowed = getNextAllowedTime(obj);
        let timeStr = '';
        if (!obj.lastSubmitted) {
          timeStr = 'Available now';
        } else if (now >= nextAllowed) {
          timeStr = 'Available now';
        } else {
          timeStr = `<t:${Math.floor(nextAllowed / 1000)}:R>`;
        }
        return `- *${obj.name}* (${obj.frequency}) - ${timeStr}` +
          (obj.streak > 3 ? ` | Streak: ${obj.streak} 🔥` : '');
      });
      return sendEphemeral(res, `Your objectives:\n${lines.join('\n')}`);
    }

    // "delete_objective" command
    if (name === 'delete_objective') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const nameOption = data.options.find(opt => opt.name === 'name');
      const objectiveName = nameOption?.value?.trim();

      if (!objectiveName) {
        return sendEphemeral(res, 'Objective name is required.');
      }

      if (!getObjective(userId, objectiveName)) {
        return sendEphemeral(res, `Objective "${objectiveName}" not found.`);
      }

      deleteObjective(userId, objectiveName);

      return sendEphemeral(res, `Objective "${objectiveName}" has been deleted forever.`);
    }

    // "rename" command
    if (name === 'rename') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const currentNameOption = data.options.find(opt => opt.name === 'current_name');
      const newNameOption = data.options.find(opt => opt.name === 'new_name');
      const currentName = currentNameOption?.value?.trim();
      const newName = newNameOption?.value?.trim();

      if (!currentName || !newName) {
        return sendEphemeral(res, 'Both current name and new name are required.');
      }

      if (!getObjective(userId, currentName)) {
        return sendEphemeral(res, `Objective "${currentName}" not found.`);
      }

      if (getObjective(userId, newName)) {
        return sendEphemeral(res, `An objective with the name "${newName}" already exists.`);
      }

      renameObjective(userId, currentName, newName);

      return sendEphemeral(res, `Objective "${currentName}" has been renamed to "${newName}".`);
    }

    console.error(`unknown command type: ${type}`);
    return res.sendStatus(400);
  }

  res.sendStatus(404);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});