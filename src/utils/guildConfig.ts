import { GuildConfig } from "@prisma/client";
import { GuildMember } from "discord.js";
import { prisma } from "../database/prisma";
import { getCached, invalidateCache } from "./redis";

const CONFIG_TTL = 60; // segundos

export async function getCachedGuildConfig(guildId: string): Promise<GuildConfig | null> {
  return getCached(`guild-config:${guildId}`, CONFIG_TTL, () =>
    prisma.guildConfig.findUnique({ where: { guildId } })
  );
}

export async function invalidateGuildConfig(guildId: string): Promise<void> {
  await invalidateCache(`guild-config:${guildId}`);
}

/**
 * Verifica se um membro deve ter sua atividade rastreada.
 * Se nenhum cargo participante estiver configurado, todos participam.
 */
export function isParticipant(member: GuildMember, config: GuildConfig | null): boolean {
  if (!config || config.participantRoleIds.length === 0) return true;
  return config.participantRoleIds.some((roleId) => member.roles.cache.has(roleId));
}
