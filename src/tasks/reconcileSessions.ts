import { Client } from "discord.js";
import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

/**
 * Fecha sessões de voz/stream abertas (leftAt/endedAt = null) de usuários
 * que não estão mais em nenhum canal de voz.
 *
 * Deve ser chamado no ClientReady para recuperar sessões que ficaram abertas
 * quando o bot ficou offline (ex: restart, crash, deploy).
 */
export async function reconcileOpenSessions(client: Client): Promise<void> {
  logger.info("Reconciliando sessões abertas...");

  let closedVoice  = 0;
  let closedStream = 0;

  for (const [, guild] of client.guilds.cache) {
    try {
      // Busca membros em voz agora
      const membersInVoice = new Set<string>();
      const membersStreaming = new Set<string>();

      for (const [, channel] of guild.channels.cache) {
        if (!channel.isVoiceBased()) continue;
        for (const [memberId, member] of channel.members) {
          if (member.user.bot) continue;
          membersInVoice.add(memberId);
          if (member.voice.streaming) membersStreaming.add(memberId);
        }
      }

      // Sessões de voz abertas para esta guild
      const openVoice = await prisma.voiceSession.findMany({
        where: { guildId: guild.id, leftAt: null },
        select: { id: true, userId: true, joinedAt: true },
      });

      for (const session of openVoice) {
        if (membersInVoice.has(session.userId)) continue; // ainda está em voz, OK

        const leftAt = new Date();
        await prisma.voiceSession.update({
          where: { id: session.id },
          data:  { leftAt, durationMs: leftAt.getTime() - session.joinedAt.getTime() },
        });
        closedVoice++;
        logger.debug(`Voz fechada: userId=${session.userId} guild=${guild.id} (bot estava offline)`);
      }

      // Sessões de stream abertas para esta guild
      const openStream = await prisma.streamSession.findMany({
        where: { guildId: guild.id, endedAt: null },
        select: { id: true, userId: true, startedAt: true },
      });

      for (const session of openStream) {
        if (membersStreaming.has(session.userId)) continue; // ainda está streamando, OK

        const endedAt = new Date();
        await prisma.streamSession.update({
          where: { id: session.id },
          data:  { endedAt, durationMs: endedAt.getTime() - session.startedAt.getTime() },
        });
        closedStream++;
        logger.debug(`Stream fechado: userId=${session.userId} guild=${guild.id} (bot estava offline)`);
      }
    } catch (error) {
      logger.error(`Erro ao reconciliar sessões da guild ${guild.id}:`, error);
    }
  }

  logger.info(`Reconciliação concluída: ${closedVoice} sessões de voz e ${closedStream} de stream fechadas.`);
}
