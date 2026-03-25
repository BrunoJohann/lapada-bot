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
      await prisma.voiceSession.create({
        data: { userId, guildId, channelId: newState.channelId!, joinedAt: new Date() },
      });

      // Alguém entrou: se há um streamer no canal que estava sozinho, abre sessão de stream agora
      if (config?.streamEnabled) {
        const channel = newState.channel;
        if (channel) {
          const nonBots = channel.members.filter((m) => !m.user.bot);
          if (nonBots.size >= 2) {
            for (const [streamerId, streamerMember] of nonBots) {
              if (streamerId === userId || !streamerMember.voice.streaming) continue;
              const existing = await prisma.streamSession.findFirst({
                where: { userId: streamerId, guildId, endedAt: null },
              });
              if (!existing) {
                await prisma.streamSession.create({
                  data: { userId: streamerId, guildId, channelId: channel.id, startedAt: new Date() },
                });
              }
            }
          }
        }
      }
    } else if (leftChannel || switchedChannel) {
      const openSession = await prisma.voiceSession.findFirst({
        where: { userId, guildId, leftAt: null },
        orderBy: { joinedAt: "desc" },
      });
      if (openSession) {
        const leftAt = new Date();
        await prisma.voiceSession.update({
          where: { id: openSession.id },
          data: { leftAt, durationMs: leftAt.getTime() - openSession.joinedAt.getTime() },
        });
      }

      if (switchedChannel && newState.channelId) {
        await prisma.voiceSession.create({
          data: { userId, guildId, channelId: newState.channelId, joinedAt: new Date() },
        });
      }

      // Alguém saiu: se streamer ficou sozinho, fecha sessão de stream dele
      if (config?.streamEnabled) {
        const channel = oldState.channel;
        if (channel) {
          const remaining = channel.members.filter((m) => !m.user.bot);
          if (remaining.size < 2) {
            for (const [streamerId, streamerMember] of remaining) {
              if (streamerMember.voice.streaming) {
                await closeOpenStream(streamerId, guildId);
              }
            }
          }
        }
      }

      // Se saiu do canal enquanto streamava, fecha a sessão de stream
      if (leftChannel) {
        await closeOpenStream(userId, guildId);
      }
    }

    // ── Stream ────────────────────────────────────────────────────────────
    if (config?.streamEnabled) {
      if (streamStarted && newState.channelId) {
        // Só abre sessão se há mais de uma pessoa no canal
        const channel = newState.channel;
        const nonBots = channel?.members.filter((m) => !m.user.bot).size ?? 0;
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

async function closeOpenStream(userId: string, guildId: string): Promise<void> {
  const openStream = await prisma.streamSession.findFirst({
    where: { userId, guildId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (openStream) {
    const endedAt = new Date();
    await prisma.streamSession.update({
      where: { id: openStream.id },
      data: { endedAt, durationMs: endedAt.getTime() - openStream.startedAt.getTime() },
    });
  }
}
