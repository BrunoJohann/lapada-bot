import { Client } from "discord.js";
import cron from "node-cron";
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
        orderBy: { joinedAt: "desc" },
      });

      // Agrupa por userId para detectar duplicatas
      const voiceByUser = new Map<string, typeof openVoice>();
      for (const session of openVoice) {
        const list = voiceByUser.get(session.userId) ?? [];
        list.push(session);
        voiceByUser.set(session.userId, list);
      }

      const now = new Date();
      for (const [userId, sessions] of voiceByUser) {
        if (membersInVoice.has(userId)) {
          // Usuário ainda em voz: fechar duplicatas (manter só a mais recente)
          const duplicates = sessions.slice(1); // já ordenado desc, primeira é a mais recente
          for (const dup of duplicates) {
            await prisma.voiceSession.update({
              where: { id: dup.id },
              data:  { leftAt: now, durationMs: Math.max(0, now.getTime() - dup.joinedAt.getTime()) },
            });
            closedVoice++;
            logger.warn(`Sessão duplicada fechada: userId=${userId} guild=${guild.id} sessionId=${dup.id}`);
          }
          continue;
        }
        // Usuário fora do canal: fechar todas
        for (const session of sessions) {
          await prisma.voiceSession.update({
            where: { id: session.id },
            data:  { leftAt: now, durationMs: Math.max(0, now.getTime() - session.joinedAt.getTime()) },
          });
          closedVoice++;
          logger.debug(`Voz fechada: userId=${userId} guild=${guild.id}`);
        }
      }

      // Sessões de stream abertas para esta guild
      const openStream = await prisma.streamSession.findMany({
        where: { guildId: guild.id, endedAt: null },
        select: { id: true, userId: true, startedAt: true },
      });

      for (const session of openStream) {
        if (membersStreaming.has(session.userId)) continue; // ainda está streamando, OK

        await prisma.streamSession.update({
          where: { id: session.id },
          data:  { endedAt: now, durationMs: Math.max(0, now.getTime() - session.startedAt.getTime()) },
        });
        closedStream++;
        logger.debug(`Stream fechado: userId=${session.userId} guild=${guild.id}`);
      }
    } catch (error) {
      logger.error(`Erro ao reconciliar sessões da guild ${guild.id}:`, error);
    }
  }

  logger.info(`Reconciliação concluída: ${closedVoice} sessões de voz e ${closedStream} de stream fechadas.`);
}

// Roda a cada 30 minutos para pegar sessões que ficaram abertas durante o uptime do bot
export function scheduleSessionReconciliation(client: Client): void {
  cron.schedule("*/30 * * * *", () => {
    reconcileOpenSessions(client).catch((err) =>
      logger.error("Erro na reconciliação periódica de sessões:", err)
    );
  });
  logger.info("Reconciliação periódica agendada (a cada 30min).");
}
