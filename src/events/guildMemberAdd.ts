import { Events, GuildMember } from "discord.js";
import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

export const name = Events.GuildMemberAdd;
export const once = false;

export async function execute(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  try {
    await prisma.user.upsert({
      where: { id: member.id },
      update: { username: member.user.username, displayName: member.displayName },
      create: {
        id: member.id,
        guildId: member.guild.id,
        username: member.user.username,
        displayName: member.displayName,
        joinedAt: member.joinedAt ?? new Date(),
      },
    });
  } catch (error) {
    logger.error("Erro ao registrar novo membro:", error);
  }
}
