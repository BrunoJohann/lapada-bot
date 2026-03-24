import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";

export interface Command {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { name: string; toJSON: () => any };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface BotClient extends Client {
  commands: Collection<string, Command>;
}

export function createClient(): BotClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,       // PRIVILEGED
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,     // PRIVILEGED
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User],
  }) as BotClient;

  client.commands = new Collection<string, Command>();

  return client;
}
