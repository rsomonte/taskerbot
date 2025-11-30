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
db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    userId TEXT PRIMARY KEY,
    visibility TEXT DEFAULT 'ephemeral'
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
 * Gets the visibility setting for a user. Defaults to 'ephemeral'.
 * @param {string} userId - The user's Discord ID.
 * @returns {'ephemeral' | 'public'}
 */
function getUserVisibility(userId) {
  let setting = db.prepare('SELECT visibility FROM user_settings WHERE userId = ?').get(userId);
  return setting ? setting.visibility : 'ephemeral';
}

function setUserVisibility(userId, visibility) {
  db.prepare('INSERT INTO user_settings (userId, visibility) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET visibility=excluded.visibility')
    .run(userId, visibility);
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

/**
 * Sends a response that respects the user's visibility setting.
 * @param {object} res - The Express response object.
 * @param {string} userId - The user's Discord ID.
 * @param {object} data - The response data payload (content, embeds, etc.).
 */
function sendResponse(res, userId, data) {
  const visibility = getUserVisibility(userId);
  if (visibility === 'ephemeral') {
    data.flags = InteractionResponseFlags.EPHEMERAL;
  }
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data,
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

  if (type === InteractionType.MESSAGE_COMPONENT) {
    const userId = req.body.member?.user?.id || req.body.user?.id;
    const { custom_id } = data;

    if (custom_id.startsWith('visibility_')) {
      const newVisibility = custom_id.split('_')[1]; // 'public' or 'ephemeral'
      setUserVisibility(userId, newVisibility);

      // Update the original message in place
      const currentVisibility = newVisibility;
      const otherVisibility = currentVisibility === 'ephemeral' ? 'public' : 'ephemeral';

      return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
          embeds: [{
            title: 'Settings',
            description: 'Manage your bot preferences here.',
            color: 0x5865F2, // Discord blurple
            fields: [
              {
                name: 'Message Visibility',
                value: `Your responses are currently set to **${currentVisibility}**.`,
              },
            ],
          }],
          components: [{
            type: 1, // Action Row
            components: [{
              type: 2, // Button
              style: 2, // Secondary (grey)
              label: `Switch to ${otherVisibility.charAt(0).toUpperCase() + otherVisibility.slice(1)}`,
              custom_id: `visibility_${otherVisibility}`,
            }],
          }],
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    return res.sendStatus(400);
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
        return sendResponse(res, userId, { content: 'Missing both image and objective.' });
      }
      if (!attachment) {
        return sendResponse(res, userId, { content: 'Missing image.' });
      }
      if (!objective) {
        return sendResponse(res, userId, { content: 'Missing objective.' });
      }

      // Find the objective object in the database
      let obj = getObjective(userId, objective);

      if (!obj) {
        return sendResponse(res, userId, { content: `Objective "${objective}" not found. Please create it first with /create_objective.` });
      }

      // Frequency check
      const now = Date.now();
      const nextAllowed = getNextAllowedTime(obj);
      if (obj.lastSubmitted && now < nextAllowed) {
        const discordTs = `<t:${Math.floor(nextAllowed / 1000)}:R>`;        return sendResponse(res, userId, { content: `You have already submitted **${objective}**. Try again ${discordTs}.` });
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
      
      const responseData = {
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
      };
      return sendResponse(res, userId, responseData);
    }

    // "create_objective" command
    if (name === 'create_objective') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const nameOption = data.options.find(opt => opt.name === 'name');
      const freqOption = data.options.find(opt => opt.name === 'frequency');
      const objectiveName = nameOption?.value?.trim();
      const frequency = freqOption?.value;

      if (!objectiveName || !frequency) {
        return sendResponse(res, userId, { content: 'Objective name and frequency are required.' });
      }

      // Check if already exists
      if (getObjective(userId, objectiveName)) {
        return sendResponse(res, userId, { content: `Objective "${objectiveName}" already exists.` });
      }

      createObjective({
        userId,
        name: objectiveName,
        frequency,
      });

      return sendResponse(res, userId, { content: `Objective "${objectiveName}" (${frequency}) created!` });
    }

    // "list_objectives" command
    if (name === 'list_objectives') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const objectives = getObjectives(userId);
      if (objectives.length === 0) {
        return sendResponse(res, userId, { content: 'You have no objectives.' });
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
      return sendResponse(res, userId, { content: `Your objectives:\n${lines.join('\n')}` });
    }

    // "delete_objective" command
    if (name === 'delete_objective') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const nameOption = data.options.find(opt => opt.name === 'name');
      const objectiveName = nameOption?.value?.trim();

      if (!objectiveName) {
        return sendResponse(res, userId, { content: 'Objective name is required.' });
      }

      if (!getObjective(userId, objectiveName)) {
        return sendResponse(res, userId, { content: `Objective "${objectiveName}" not found.` });
      }

      deleteObjective(userId, objectiveName);

      return sendResponse(res, userId, { content: `Objective "${objectiveName}" has been deleted forever.` });
    }

    // "rename" command
    if (name === 'rename') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const currentNameOption = data.options.find(opt => opt.name === 'current_name');
      const newNameOption = data.options.find(opt => opt.name === 'new_name');
      const currentName = currentNameOption?.value?.trim();
      const newName = newNameOption?.value?.trim();

      if (!currentName || !newName) {
        return sendResponse(res, userId, { content: 'Both current name and new name are required.' });
      }

      if (!getObjective(userId, currentName)) {
        return sendResponse(res, userId, { content: `Objective "${currentName}" not found.` });
      }

      if (getObjective(userId, newName)) {
        return sendResponse(res, userId, { content: `An objective with the name "${newName}" already exists.` });
      }

      renameObjective(userId, currentName, newName);

      return sendResponse(res, userId, { content: `Objective "${currentName}" has been renamed to "${newName}".` });
    }

    // "help" command
    if (name === 'help') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const commandOption = data.options.find(opt => opt.name === 'command');
      const commandName = commandOption?.value;

      let title = '';
      let description = '';
      let image = null;
      let url = null;

      switch (commandName) {
        case 'submit':
          title = '`/submit`';
          description = 'Submit a picture for one of your objectives. You must provide the image and the name of an objective you have already created.';
          image = { url: 'https://i.imgur.com/UAbUQ28.gif' };
          break;
        case 'create_objective':
          title = '`/create_objective`';
          description = 'Create a new objective. You need to provide a unique name and select a frequency (daily, weekly, or monthly).';
          image = { url: 'https://i.imgur.com/Z936pXa.gif' };
          break;
        case 'list_objectives':
          title = '`/list_objectives`';
          description = 'Lists all of your current objectives, their frequency, and when you can next submit them.';
          image = { url: 'https://i.imgur.com/ANsLTEk.gif' };
          break;
        case 'delete_objective':
          title = '`/delete_objective`';
          description = 'Permanently delete one of your objectives. You must provide the name of the objective to delete.';
          image = { url: 'https://i.imgur.com/Oi7NVT7.gif' };
          break;
        case 'rename':
          title = '`/rename`';
          description = 'Rename one of your existing objectives. You must provide the current name and the new name.';
          image = { url: 'https://i.imgur.com/G7rsDSJ' };
          break;
        case 'settings':
          title = '`/settings`';
          description = 'Adjust your bot preferences, such as message visibility (ephemeral or public).';
          image = { url: 'https://i.imgur.com/fMPyBjF.gif' };
          break;
        case 'help':
          title = '`/help`';
          description = 'Get detailed information about how to use each of the bot commands.';
          image = { url: 'https://i.imgur.com/wAn5Xiq' };
          break;
        case 'GitHub':
          title = 'GitHub Repository';
          description = 'Check out the source code for this bot on [GitHub](https://github.com/rsomonte/taskerbot)!';
          url = 'https://github.com/rsomonte/taskerbot'; 
          break;
      }

      const embed = {
        title: title,
        description: description,
        color: 0x5865F2, // Discord blurple
      };

      if (image) {
        embed.image = image;
      }
      if (url) {
        embed.url = url;
      }

      return sendResponse(res, userId, { embeds: [embed] });
    }

    // settings command
    if (name === 'settings') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const currentVisibility = getUserVisibility(userId);
      const otherVisibility = currentVisibility === 'ephemeral' ? 'public' : 'ephemeral';

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: 'Settings',
            description: 'Manage your bot preferences here.',
            color: 0x5865F2, // Discord blurple
            fields: [
              {
                name: 'Message Visibility',
                value: `Your responses are currently set to **${currentVisibility}**.`,
              },
            ],
          }],
          components: [{
            type: 1, // Action Row
            components: [{
              type: 2, // Button
              style: 2, // Secondary (grey)
              label: `Switch to ${otherVisibility.charAt(0).toUpperCase() + otherVisibility.slice(1)}`,
              custom_id: `visibility_${otherVisibility}`,
            }],
          }],
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
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