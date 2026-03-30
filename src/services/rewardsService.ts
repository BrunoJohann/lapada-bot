import { Guild } from "discord.js";
import { prisma } from "../database/prisma";
import { getLeaderboard, getPeriodStart } from "./metricsService";
import { logger } from "../utils/logger";

export interface RewardResult {
  assigned: string[];
  removed: string[];
  topUsers: Array<{
    userId: string;
    rank: number;
    username: string;
    score: number;
    messageCount: number;
    voiceMinutes: number;
  }>;
  roleName: string;
}

export async function processRewards(
  guild: Guild,
  period: "weekly" | "monthly"
): Promise<RewardResult> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  const roleId = period === "weekly" ? config?.weeklyRoleId : config?.monthlyRoleId;

  if (!roleId) {
    logger.warn(`Guild ${guild.id}: cargo de recompensa ${period} não configurado.`);
    return { assigned: [], removed: [], topUsers: [], roleName: "N/A" };
  }

  // Tenta cache primeiro; se não estiver, busca via API (evita falha por cache não populado)
  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId)) ?? undefined;
  if (!role) {
    logger.warn(`Guild ${guild.id}: cargo ${roleId} não encontrado (nem em cache, nem via API).`);
    return { assigned: [], removed: [], topUsers: [], roleName: "N/A" };
  }

  const topN = period === "weekly" ? (config?.weeklyTopN ?? 5) : (config?.monthlyTopN ?? 5);
  const participantRoleIds = config?.participantRoleIds ?? [];

  // Garante cache completo de membros antes de qualquer filtro por cargo
  await guild.members.fetch();

  const allUsers = await getLeaderboard(guild.id, period, topN * 3); // busca mais para compensar filtro
  const topUsers = allUsers
    .filter((u) => {
      if (participantRoleIds.length === 0) return true;
      const member = guild.members.cache.get(u.userId);
      return participantRoleIds.some((roleId) => member?.roles.cache.has(roleId));
    })
    .slice(0, topN);

  const topUserIds = new Set(topUsers.map((u) => u.userId));
  const membersWithRole = guild.members.cache.filter((m) => m.roles.cache.has(roleId));

  const assigned: string[] = [];
  const removed: string[] = [];

  // Atribui cargo aos top N
  for (const topUser of topUsers) {
    const member = guild.members.cache.get(topUser.userId);
    if (!member) continue;

    if (!member.roles.cache.has(roleId)) {
      try {
        await member.roles.add(roleId, `Top ${topN} ${period} - score: ${topUser.score.toFixed(1)}`);
        assigned.push(topUser.username);

        await prisma.roleAssignment.create({
          data: {
            userId: topUser.userId,
            guildId: guild.id,
            roleId,
            roleName: role.name,
            reason: `${period}_top`,
          },
        });
      } catch (error) {
        logger.error(`Erro ao atribuir cargo para ${topUser.username}:`, error);
      }
    }
  }

  // Remove cargo de quem não está mais no top N, respeitando roleDurationDays
  const roleDurationDays = period === "weekly"
    ? (config?.weeklyRoleDurationDays ?? 7)
    : (config?.monthlyRoleDurationDays ?? 30);
  for (const [, member] of membersWithRole) {
    if (topUserIds.has(member.id)) continue;

    // Verifica se ainda está dentro do período mínimo de duração
    const assignment = await prisma.roleAssignment.findFirst({
      where: { userId: member.id, guildId: guild.id, roleId, removedAt: null },
      orderBy: { assignedAt: "desc" },
    });
    const daysSinceAssigned = assignment
      ? (Date.now() - assignment.assignedAt.getTime()) / 86_400_000
      : Infinity;

    if (daysSinceAssigned < roleDurationDays) continue;

    try {
      await member.roles.remove(roleId, "Saiu do top ranking e prazo expirou");
      removed.push(member.user.username);

      await prisma.roleAssignment.updateMany({
        where: { userId: member.id, guildId: guild.id, roleId, removedAt: null },
        data: { removedAt: new Date(), reason: "rank_drop" },
      });
    } catch (error) {
      logger.error(`Erro ao remover cargo de ${member.user.username}:`, error);
    }
  }

  // Remove cargo por inatividade
  const inactiveDays = config?.inactiveThresholdDays ?? 14;
  const inactiveThreshold = new Date();
  inactiveThreshold.setDate(inactiveThreshold.getDate() - inactiveDays);

  const stillHasRole = guild.members.cache.filter((m) => m.roles.cache.has(roleId));
  for (const [, member] of stillHasRole) {
    const lastActivity = await prisma.dailyAggregate.findFirst({
      where: { userId: member.id, guildId: guild.id },
      orderBy: { date: "desc" },
      select: { date: true },
    });

    if (!lastActivity || lastActivity.date < inactiveThreshold) {
      try {
        await member.roles.remove(roleId, `Inativo há mais de ${inactiveDays} dias`);
        if (!removed.includes(member.user.username)) {
          removed.push(member.user.username);
        }

        await prisma.roleAssignment.updateMany({
          where: { userId: member.id, guildId: guild.id, roleId, removedAt: null },
          data: { removedAt: new Date(), reason: "inactive_removal" },
        });
      } catch (error) {
        logger.error(`Erro ao remover cargo por inatividade de ${member.user.username}:`, error);
      }
    }
  }

  logger.info(
    `Guild ${guild.id}: ${period} rewards — ${assigned.length} atribuídos, ${removed.length} removidos`
  );

  return {
    assigned,
    removed,
    topUsers: topUsers.map((u) => ({
      userId: u.userId,
      rank: u.rank,
      username: u.displayName ?? u.username,
      score: u.score,
      messageCount: u.messageCount,
      voiceMinutes: u.voiceMinutes,
    })),
    roleName: role.name,
  };
}
