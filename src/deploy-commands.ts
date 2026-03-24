/**
 * Script para registrar os comandos slash no Discord.
 * Execute uma vez após criar ou modificar comandos:
 *   pnpm tsx src/deploy-commands.ts
 */
import "dotenv/config";
import path from "path";
import fs from "fs";
import { REST, Routes } from "discord.js";
import { logger } from "./utils/logger";

async function deployCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN e DISCORD_CLIENT_ID devem estar definidos no .env");
  }

  const commands: unknown[] = [];
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
      if (cmd?.data) {
        commands.push(cmd.data.toJSON());
        logger.info(`Preparando comando: /${cmd.data.name}`);
      }
    }
  }

  const rest = new REST().setToken(token);
  const guildId = process.env.GUILD_ID;

  if (guildId) {
    logger.info(`Registrando ${commands.length} comando(s) no servidor ${guildId} (instantâneo)...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    logger.info("Comandos registrados no servidor com sucesso!");
  } else {
    logger.info(`Registrando ${commands.length} comando(s) globalmente (pode demorar até 1h)...`);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info("Comandos registrados globalmente com sucesso!");
  }
}

deployCommands().catch((err) => {
  logger.error("Erro ao registrar comandos:", err);
  process.exit(1);
});
