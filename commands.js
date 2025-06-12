import 'dotenv/config';

// Inline capitalize
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

 /**
 * Registers or updates global application commands for a Discord bot.
 *
 * Sends a PUT request to the Discord API to set the provided commands as the global commands
 * for the specified application. This will overwrite all existing global commands.
 *
 * @async
 * @param {string} appId - The Discord application (bot) ID.
 * @param {Array<Object>} commands - An array of command objects to register globally.
 * @returns {Promise<void>} Resolves when the commands are successfully registered or updated.
 * @throws Will log an error to the console if the request fails.
 *
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands}
 */
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

/*
  * This command allows users to submit an image with a specific objective.
  * The objective must match one that the user has created previously.
*/
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

/** * This command allows users to create a new objective.
 * Users can specify the name and frequency of the objective.
 */
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

/**
 * This command allows users to list their objectives.
 * It does not require any options.
 */
const LIST_OBJECTIVES_COMMAND = {
  name: 'list_objectives',
  description: 'List your objectives',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};


/**
 * This command allows users to delete an objective.
 * Users must specify the name of the objective they want to delete.
 */
const DELETE_OBJECTIVE_COMMAND = {
  name: 'delete_objective',
  description: 'Delete one of your objectives forever',
  options: [
    {
      type: 3, // STRING
      name: 'name',
      description: 'Objective name to delete',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [
  SUBMIT_COMMAND,
  CREATE_OBJECTIVE_COMMAND,
  LIST_OBJECTIVES_COMMAND,
  DELETE_OBJECTIVE_COMMAND, 
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
