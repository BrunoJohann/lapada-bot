import { Events, MessageReaction, User, PartialMessageReaction, PartialUser } from "discord.js";
import { prisma } from "../database/prisma";
import { getCachedGuildConfig, isParticipant } from "../utils/guildConfig";
import { logger } from "../utils/logger";

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  // Fetch partials se necessário
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  if (!reaction.message.guildId) return;

  const targetUser = reaction.message.author;
  if (!targetUser || targetUser.bot) return;

  const actorId = user.id;
  const targetId = targetUser.id;
  const guildId = reaction.message.guildId;

  // Não contar auto-reações
  if (actorId === targetId) return;

  // Verifica se o alvo da reação participa das métricas
  const targetMember = reaction.message.guild?.members.cache.get(targetId);
  if (targetMember) {
    const config = await getCachedGuildConfig(guildId);
    if (!isParticipant(targetMember, config)) return;
  }

  try {
    // Garante que os dois usuários existem
    await prisma.user.upsert({
      where: { id: actorId },
      update: { username: user.username ?? "unknown" },
      create: { id: actorId, guildId, username: user.username ?? "unknown" },
    });

    await prisma.user.upsert({
      where: { id: targetId },
      update: { username: targetUser.username },
      create: { id: targetId, guildId, username: targetUser.username },
    });

    await prisma.reactionActivity.create({
      data: {
        targetUserId: targetId,
        actorUserId: actorId,
        guildId,
        channelId: reaction.message.channelId,
        emoji: reaction.emoji.name ?? reaction.emoji.id ?? "unknown",
      },
    });
  } catch (error) {
    logger.error("Erro ao registrar reação:", error);
  }
}
