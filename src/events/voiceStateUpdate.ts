import { Events, VoiceState } from "discord.js";
import { prisma } from "../database/prisma";
import { getCachedGuildConfig, isParticipant } from "../utils/guildConfig";
import { logger } from "../utils/logger";

export const name = Events.VoiceStateUpdate;
export const once = false;

export async function execute(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const userId = member.id;
  const guildId = newState.guild.id;

  // Verifica se o membro participa das métricas
  const config = await getCachedGuildConfig(guildId);
  if (!isParticipant(member, config)) return;

  const joinedChannel = !oldState.channelId && newState.channelId;
  const leftChannel = oldState.channelId && !newState.channelId;
  const switchedChannel = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

  try {
    // Garante que o usuário existe
    await prisma.user.upsert({
      where: { id: userId },
      update: { username: member.user.username, displayName: member.displayName },
      create: {
        id: userId,
        guildId,
        username: member.user.username,
        displayName: member.displayName,
      },
    });

    if (joinedChannel) {
      // Abre nova sessão de voz
      await prisma.voiceSession.create({
        data: {
          userId,
          guildId,
          channelId: newState.channelId!,
          joinedAt: new Date(),
        },
      });
    } else if (leftChannel || switchedChannel) {
      // Fecha a sessão aberta mais recente
      const openSession = await prisma.voiceSession.findFirst({
        where: { userId, guildId, leftAt: null },
        orderBy: { joinedAt: "desc" },
      });

      if (openSession) {
        const leftAt = new Date();
        const durationMs = leftAt.getTime() - openSession.joinedAt.getTime();

        await prisma.voiceSession.update({
          where: { id: openSession.id },
          data: { leftAt, durationMs },
        });
      }

      // Se trocou de canal, abre nova sessão
      if (switchedChannel && newState.channelId) {
        await prisma.voiceSession.create({
          data: {
            userId,
            guildId,
            channelId: newState.channelId,
            joinedAt: new Date(),
          },
        });
      }
    }
  } catch (error) {
    logger.error("Erro ao registrar estado de voz:", error);
  }
}
