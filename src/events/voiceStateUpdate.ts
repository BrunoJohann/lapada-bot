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

  // Deaf: selfDeaf muda enquanto está em canal
  const wentDeaf  = !!oldState.channelId && !oldState.selfDeaf && !!newState.selfDeaf;
  const undeafed  = !!oldState.channelId &&  !!oldState.selfDeaf && !newState.selfDeaf;

  try {
    await prisma.user.upsert({
      where: { id: userId },
      update: { username: member.user.username, displayName: member.displayName },
      create: { id: userId, guildId, username: member.user.username, displayName: member.displayName },
    });

    // ── Entrou em canal ───────────────────────────────────────────────────
    if (joinedChannel) {
      const channel = newState.channel;
      const nonBots = channel?.members.filter((m) => !m.user.bot) ?? new Map();
      const memberCount = nonBots.size;

      if (memberCount >= 2) {
        // Abre sessão para quem acabou de entrar (somente se não estiver deaf)
        if (!newState.selfDeaf) {
          await prisma.voiceSession.create({
            data: { userId, guildId, channelId: newState.channelId!, joinedAt: new Date() },
          });
        }

        // Abre sessão para quem estava sozinho e agora tem companhia (se não estiver deaf)
        for (const [otherId, otherMember] of nonBots) {
          if (otherId === userId) continue;
          if (otherMember.voice.selfDeaf) continue; // deaf não pontua em voz
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

    // ── Saiu ou trocou de canal ───────────────────────────────────────────
    } else if (leftChannel || switchedChannel) {
      await closeOpenVoice(userId, guildId);

      if (leftChannel) {
        await closeOpenStream(userId, guildId);
      }

      // Verifica se quem ficou no canal antigo ficou sozinho
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

      // Trocou de canal: abre sessão no novo apenas se ≥2 pessoas e não estiver deaf
      if (switchedChannel && newState.channelId) {
        const nonBots = newState.channel?.members.filter((m) => !m.user.bot).size ?? 0;
        if (nonBots >= 2 && !newState.selfDeaf) {
          await prisma.voiceSession.create({
            data: { userId, guildId, channelId: newState.channelId, joinedAt: new Date() },
          });
        }
      }

    // ── Foi deafado: fecha voz, mantém stream ────────────────────────────
    } else if (wentDeaf) {
      await closeOpenVoice(userId, guildId);
      // StreamSession continua aberta — deaf + streaming ainda pontua stream

    // ── Removeu deaf: abre voz se ≥2 pessoas ────────────────────────────
    } else if (undeafed && newState.channelId) {
      const nonBots = newState.channel?.members.filter((m) => !m.user.bot).size ?? 0;
      if (nonBots >= 2) {
        const existing = await prisma.voiceSession.findFirst({
          where: { userId, guildId, leftAt: null },
        });
        if (!existing) {
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
  const now = new Date();
  const open = await prisma.voiceSession.findMany({
    where: { userId, guildId, leftAt: null },
    orderBy: { joinedAt: "desc" },
  });
  if (open.length > 1) {
    logger.warn(`[voiceStateUpdate] ${open.length} sessões de voz abertas para userId=${userId} — possível race condition. Fechando todas.`);
  }
  for (const session of open) {
    await prisma.voiceSession.update({
      where: { id: session.id },
      data: { leftAt: now, durationMs: Math.max(0, now.getTime() - session.joinedAt.getTime()) },
    });
  }
}

async function closeOpenStream(userId: string, guildId: string): Promise<void> {
  const now = new Date();
  const open = await prisma.streamSession.findMany({
    where: { userId, guildId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  for (const session of open) {
    await prisma.streamSession.update({
      where: { id: session.id },
      data: { endedAt: now, durationMs: Math.max(0, now.getTime() - session.startedAt.getTime()) },
    });
  }
}
