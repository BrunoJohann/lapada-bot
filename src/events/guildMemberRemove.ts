import { Events, GuildMember, PartialGuildMember } from "discord.js";
import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member: GuildMember | PartialGuildMember): Promise<void> {
  if (member.user?.bot) return;

  const userId = member.id;
  const guildId = member.guild.id;
  const now = new Date();

  try {
    const openVoice = await prisma.voiceSession.findMany({
      where: { userId, guildId, leftAt: null },
    });

    for (const session of openVoice) {
      await prisma.voiceSession.update({
        where: { id: session.id },
        data: { leftAt: now, durationMs: Math.max(0, now.getTime() - session.joinedAt.getTime()) },
      });
    }

    const openStream = await prisma.streamSession.findMany({
      where: { userId, guildId, endedAt: null },
    });

    for (const session of openStream) {
      await prisma.streamSession.update({
        where: { id: session.id },
        data: { endedAt: now, durationMs: Math.max(0, now.getTime() - session.startedAt.getTime()) },
      });
    }

    if (openVoice.length > 0 || openStream.length > 0) {
      logger.info(
        `[guildMemberRemove] userId=${userId} saiu do servidor — fechadas ${openVoice.length} sessão(ões) de voz e ${openStream.length} de stream.`
      );
    }
  } catch (error) {
    logger.error(`Erro ao fechar sessões de membro removido userId=${userId}:`, error);
  }
}
