import "dotenv/config";
import path from "path";
import fs from "fs";
import { Events, ActivityType } from "discord.js";
import { createClient } from "./client";
import { logger } from "./utils/logger";
import { scheduleWeeklyReport } from "./tasks/weeklyReport";
import { scheduleMonthlyReport, scheduleDailyAggregate } from "./tasks/monthlyReport";

const client = createClient();

// Carrega eventos dinamicamente
async function loadEvents(): Promise<void> {
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js") || f.endsWith(".ts"));

  for (const file of eventFiles) {
    const event = await import(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
    logger.debug(`Evento carregado: ${event.name}`);
  }
}

// Carrega comandos dinamicamente
async function loadCommands(): Promise<void> {
  const commandDirs = [
    path.join(__dirname, "commands"),
    path.join(__dirname, "commands", "admin"),
  ];

  for (const dir of commandDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !fs.statSync(path.join(dir, f)).isDirectory());

    for (const file of files) {
      const command = await import(path.join(dir, file));
      const cmd = command.default ?? command;
      if (cmd?.data && cmd?.execute) {
        client.commands.set(cmd.data.name, cmd);
        logger.debug(`Comando carregado: /${cmd.data.name}`);
      }
    }
  }
}

// Handler de interações (comandos slash + autocomplete)
client.on(Events.InteractionCreate, async (interaction) => {
  // Autocomplete
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      logger.error(`Erro no autocomplete de /${interaction.commandName}:`, error);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error(`Erro ao executar /${interaction.commandName}:`, error);
    const errorMsg = { content: "Ocorreu um erro ao executar este comando.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMsg);
    } else {
      await interaction.reply(errorMsg);
    }
  }
});

// Bot pronto
client.once(Events.ClientReady, (c) => {
  logger.info(`Bot online como ${c.user.tag}`);
  logger.info(`Presente em ${c.guilds.cache.size} servidor(es)`);

  c.user.setActivity("atividade dos membros", { type: ActivityType.Watching });

  scheduleWeeklyReport(client);
  scheduleMonthlyReport(client);
  scheduleDailyAggregate(client);
});

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN não definido no .env");

  await loadEvents();
  await loadCommands();
  await client.login(token);
}

main().catch((err) => {
  logger.error("Erro fatal ao inicializar o bot:", err);
  process.exit(1);
});
