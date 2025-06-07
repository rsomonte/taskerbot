import 'dotenv/config';

// Inline capitalize
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Inline InstallGlobalCommands
async function InstallGlobalCommands(appId, commands) {
  const endpoint = `https://discord.com/api/v10/applications/${appId}/commands`;
  try {
    await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
      },
      body: JSON.stringify(commands),
    });
  } catch (err) {
    console.error(err);
  }
}

// Submit command
const SUBMIT_COMMAND = {
  name: 'submit',
  description: 'Submit an image with an objective',
  options: [
    {
      type: 11, // ATTACHMENT type
      name: 'image',
      description: 'Image to submit',
      required: true,
    },
    {
      type: 3, // STRING type
      name: 'objective',
      description: 'Type your objective (*must match one you created*)',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const CREATE_OBJECTIVE_COMMAND = {
  name: 'create_objective',
  description: 'Create a new objective for yourself',
  options: [
    {
      type: 3, // STRING
      name: 'name',
      description: 'Objective name',
      required: true,
    },
    {
      type: 3, // STRING
      name: 'frequency',
      description: 'How often can this be submitted?',
      required: true,
      choices: [
        { name: 'Daily', value: 'daily' },
        { name: 'Weekly', value: 'weekly' },
        { name: 'Monthly', value: 'monthly' },
      ],
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const LIST_OBJECTIVES_COMMAND = {
  name: 'list_objectives',
  description: 'List your objectives',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [SUBMIT_COMMAND, CREATE_OBJECTIVE_COMMAND, LIST_OBJECTIVES_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
