import { Events, Message } from "discord.js";
import { prisma } from "../database/prisma";
import { getCachedGuildConfig, isParticipant } from "../utils/guildConfig";
import { logger } from "../utils/logger";

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message: Message): Promise<void> {
  // Ignora bots e DMs
  if (message.author.bot || !message.guildId) return;

  const userId = message.author.id;
  const guildId = message.guildId;

  // Verifica se o membro participa das métricas
  if (message.member) {
    const config = await getCachedGuildConfig(guildId);
    if (!isParticipant(message.member, config)) return;
  }

  try {
    // Upsert do usuário
    await prisma.user.upsert({
      where: { id: userId },
      update: { username: message.author.username, displayName: message.member?.displayName },
      create: {
        id: userId,
        guildId,
        username: message.author.username,
        displayName: message.member?.displayName,
      },
    });

    // Registra a mensagem
    await prisma.messageActivity.create({
      data: {
        userId,
        guildId,
        channelId: message.channelId,
      },
    });
  } catch (error) {
    logger.error("Erro ao registrar mensagem:", error);
  }
}
