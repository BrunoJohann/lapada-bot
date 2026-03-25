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

  const config = await getCachedGuildConfig(guildId);
  if (!isParticipant(member, config)) return;

  const joinedChannel   = !oldState.channelId && newState.channelId;
  const leftChannel     = oldState.channelId  && !newState.channelId;
  const switchedChannel = oldState.channelId  && newState.channelId && oldState.channelId !== newState.channelId;

  const streamStarted = !oldState.streaming && newState.streaming;
  const streamStopped =  oldState.streaming && !newState.streaming;

  try {
    await prisma.user.upsert({
      where: { id: userId },
      update: { username: member.user.username, displayName: member.displayName },
      create: { id: userId, guildId, username: member.user.username, displayName: member.displayName },
    });

    // ── Voz ──────────────────────────────────────────────────────────────
    if (joinedChannel) {
      const channel = newState.channel;
      const nonBots = channel?.members.filter((m) => !m.user.bot) ?? new Map();
      const memberCount = nonBots.size;

      if (memberCount >= 2) {
        // Abre sessão para quem acabou de entrar
        await prisma.voiceSession.create({
          data: { userId, guildId, channelId: newState.channelId!, joinedAt: new Date() },
        });

        // Abre sessão para quem estava sozinho e agora tem companhia
        for (const [otherId] of nonBots) {
          if (otherId === userId) continue;
          const existing = await prisma.voiceSession.findFirst({
            where: { userId: otherId, guildId, leftAt: null },
          });
          if (!existing) {
            await prisma.voiceSession.create({
              data: { userId: otherId, guildId, channelId: newState.channelId!, joinedAt: new Date() },
            });
          }
        }

        // Stream: abre sessão para streamer que estava sozinho
        if (config?.streamEnabled) {
          for (const [streamerId, streamerMember] of nonBots) {
            if (streamerId === userId || !streamerMember.voice.streaming) continue;
            const existing = await prisma.streamSession.findFirst({
              where: { userId: streamerId, guildId, endedAt: null },
            });
            if (!existing) {
              await prisma.streamSession.create({
                data: { userId: streamerId, guildId, channelId: newState.channelId!, startedAt: new Date() },
              });
            }
          }
        }
      }
      // se entrou sozinho: não abre nenhuma sessão

    } else if (leftChannel || switchedChannel) {
      // Fecha sessão de voz de quem saiu/trocou
      await closeOpenVoice(userId, guildId);

      // Fecha sessão de stream de quem saiu
      if (leftChannel) {
        await closeOpenStream(userId, guildId);
      }

      // Verifica se quem ficou no canal antigo está sozinho agora
      const oldChannel = oldState.channel;
      if (oldChannel) {
        const remaining = oldChannel.members.filter((m) => !m.user.bot);
        if (remaining.size < 2) {
          for (const [remainId, remainMember] of remaining) {
            await closeOpenVoice(remainId, guildId);
            if (remainMember.voice.streaming) {
              await closeOpenStream(remainId, guildId);
            }
          }
        }
      }

      // Se trocou de canal, abre sessão no novo apenas se ≥2 pessoas
      if (switchedChannel && newState.channelId) {
        const newChannel = newState.channel;
        const nonBots = newChannel?.members.filter((m) => !m.user.bot).size ?? 0;
        if (nonBots >= 2) {
          await prisma.voiceSession.create({
            data: { userId, guildId, channelId: newState.channelId, joinedAt: new Date() },
          });
        }
      }
    }

    // ── Stream ────────────────────────────────────────────────────────────
    if (config?.streamEnabled) {
      if (streamStarted && newState.channelId) {
        const nonBots = newState.channel?.members.filter((m) => !m.user.bot).size ?? 0;
        if (nonBots >= 2) {
          await prisma.streamSession.create({
            data: { userId, guildId, channelId: newState.channelId, startedAt: new Date() },
          });
        }
      } else if (streamStopped) {
        await closeOpenStream(userId, guildId);
      }
    }
  } catch (error) {
    logger.error("Erro ao registrar estado de voz:", error);
  }
}

async function closeOpenVoice(userId: string, guildId: string): Promise<void> {
  const open = await prisma.voiceSession.findFirst({
    where: { userId, guildId, leftAt: null },
    orderBy: { joinedAt: "desc" },
  });
  if (open) {
    const leftAt = new Date();
    await prisma.voiceSession.update({
      where: { id: open.id },
      data: { leftAt, durationMs: leftAt.getTime() - open.joinedAt.getTime() },
    });
  }
}

async function closeOpenStream(userId: string, guildId: string): Promise<void> {
  const open = await prisma.streamSession.findFirst({
    where: { userId, guildId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open) {
    const endedAt = new Date();
    await prisma.streamSession.update({
      where: { id: open.id },
      data: { endedAt, durationMs: endedAt.getTime() - open.startedAt.getTime() },
    });
  }
}
