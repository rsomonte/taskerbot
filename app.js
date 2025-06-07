import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import fetch from 'node-fetch';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// Stores objectives for each user by their userId
const userObjectives = {}; 

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
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

      // Find the objective object
      const userObjs = userObjectives[userId] || [];
      const obj = userObjs.find(o => o.name === objective);

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
              description: `Objective '${objective}' completed!`,
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
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Objective name and frequency are required.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }

      if (!userObjectives[userId]) userObjectives[userId] = [];
      userObjectives[userId].push({
        name: objectiveName,
        frequency,
        lastSubmitted: null,
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
    if (name === 'list_objectives') {
      const userId = req.body.member?.user?.id || req.body.user?.id;
      const objectives = userObjectives[userId] || [];
      if (objectives.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'You have no objectives.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      const lines = objectives.map(obj => `• **${obj.name}** (${obj.frequency})`);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Your objectives:\n${lines.join('\n')}`,
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

// Helper to send a DM to a user
async function sendDM(userId, content) {
  // Create DM channel
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: userId }),
  });
  const dmChannel = await dmRes.json();
  // Send message
  await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
}

// Periodic check every 10 minutes
setInterval(async () => {
  const now = Date.now();
  for (const [userId, objectives] of Object.entries(userObjectives)) {
    for (const obj of objectives) {
      if (!obj.lastSubmitted) continue;
      let nextAllowed = 0;
      if (obj.frequency === 'daily') nextAllowed = obj.lastSubmitted + 24 * 60 * 60 * 1000;
      if (obj.frequency === 'weekly') nextAllowed = obj.lastSubmitted + 7 * 24 * 60 * 60 * 1000;
      if (obj.frequency === 'monthly') nextAllowed = obj.lastSubmitted + 30 * 24 * 60 * 60 * 1000;
      // If the window has been open for more than 36 hours and not submitted
      if (now > nextAllowed + 36 * 60 * 60 * 1000 && (!obj.notified || obj.notified < nextAllowed)) {
        // Send DM
        await sendDM(
          userId,
          `You haven't submitted your objective "${obj.name}" for more than 36 hours since it became available!`
        );
        // Mark as notified so we don't spam
        obj.notified = now;
      }
    }
  }
}, 10 * 60 * 1000); // every 10 minutes

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
