import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';

// Create an express app
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
    PRIMARY KEY (userId, name)
  )
`);

// Helper functions
function getObjectives(userId) {
  return db.prepare('SELECT * FROM objectives WHERE userId = ?').all(userId);
}
function getObjective(userId, name) {
  return db.prepare('SELECT * FROM objectives WHERE userId = ? AND name = ?').get(userId, name);
}
function upsertObjective(obj) {
  db.prepare(`
    INSERT INTO objectives (userId, name, frequency, lastSubmitted, streak, lastStreakDay)
    VALUES (@userId, @name, @frequency, @lastSubmitted, @streak, @lastStreakDay)
    ON CONFLICT(userId, name) DO UPDATE SET
      frequency=excluded.frequency,
      lastSubmitted=excluded.lastSubmitted,
      streak=excluded.streak,
      lastStreakDay=excluded.lastStreakDay
  `).run(obj);
}
function createObjective(obj) {
  db.prepare(`
    INSERT INTO objectives (userId, name, frequency, lastSubmitted, streak, lastStreakDay)
    VALUES (@userId, @name, @frequency, NULL, 0, NULL)
  `).run(obj);
}

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
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Missing both image and objective.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      if (!attachment) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Missing image.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      if (!objective) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Missing objective.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      // Find the objective object in the database
      let obj = getObjective(userId, objective);

      if (!obj) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Objective "${objective}" not found. Please create it first with /create_objective.`,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      // Frequency check
      const now = Date.now();
      let nextAllowed = 0;
      if (obj.lastSubmitted) {
        if (obj.frequency === 'daily') nextAllowed = obj.lastSubmitted + 24 * 60 * 60 * 1000;
        if (obj.frequency === 'weekly') nextAllowed = obj.lastSubmitted + 7 * 24 * 60 * 60 * 1000;
        if (obj.frequency === 'monthly') nextAllowed = obj.lastSubmitted + 30 * 24 * 60 * 60 * 1000;
        if (now < nextAllowed) {
          // Discord timestamp: <t:unix:relative>
          const discordTs = `<t:${Math.floor(nextAllowed / 1000)}:R>`;
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `You have already submitted **${objective}**. Try again ${discordTs}.`,
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        }
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

      // Calculate next allowed submission time
      if (obj.frequency === 'daily') nextAllowed = obj.lastSubmitted + 24 * 60 * 60 * 1000;
      if (obj.frequency === 'weekly') nextAllowed = obj.lastSubmitted + 7 * 24 * 60 * 60 * 1000;
      if (obj.frequency === 'monthly') nextAllowed = obj.lastSubmitted + 30 * 24 * 60 * 60 * 1000;
      const discordTs = `<t:${Math.floor(nextAllowed / 1000)}:R>`;
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

    /*
      * This command allows users to create a new objective.
      * Users can specify the name and frequency of the objective.
      * The created objective is stored in memory for the user.
    */
    if (name === 'create_objective') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const nameOption = data.options.find(opt => opt.name === 'name');
      const freqOption = data.options.find(opt => opt.name === 'frequency');
      const objectiveName = nameOption?.value?.trim();
      const frequency = freqOption?.value;

      if (!objectiveName || !frequency) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Objective name and frequency are required.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      // Check if already exists
      if (getObjective(userId, objectiveName)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Objective "${objectiveName}" already exists.`,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      createObjective({
        userId,
        name: objectiveName,
        frequency,
      });

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Objective "${objectiveName}" (${frequency}) created!`,
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    // "list_objectives" command
    /*
      * This command allows users to list their objectives.
      * It does not require any options.
      * Returns a list of objectives the user has created with the time remaining until they can be submitted again.
    */
    if (name === 'list_objectives') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const objectives = getObjectives(userId);
      if (objectives.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'You have no objectives.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      const now = Date.now();
      const lines = objectives.map(obj => {
        let nextAllowed = 0;
        if (obj.lastSubmitted) {
          if (obj.frequency === 'daily') nextAllowed = obj.lastSubmitted + 24 * 60 * 60 * 1000;
          if (obj.frequency === 'weekly') nextAllowed = obj.lastSubmitted + 7 * 24 * 60 * 60 * 1000;
          if (obj.frequency === 'monthly') nextAllowed = obj.lastSubmitted + 30 * 24 * 60 * 60 * 1000;
        }
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
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Your objectives:\n${lines.join('\n')}`,
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
