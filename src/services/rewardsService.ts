import { Guild } from "discord.js";
import { prisma } from "../database/prisma";
import { getLeaderboard, getLeaderboardForRange } from "./metricsService";
import { logger } from "../utils/logger";

export interface RewardResult {
  assigned: string[];
  removed:  string[];
  failed:   Array<{ username: string; reason: string }>; // falhas individuais (ex: 403)
  topUsers: Array<{
    userId:       string;
    rank:         number;
    username:     string;
    score:        number;
    messageCount: number;
    voiceMinutes: number;
  }>;
  roleName: string;
}

export async function processRewards(
  guild:  Guild,
  period: "weekly" | "monthly",
  range?: { start: Date; end: Date }  // se fornecido, usa intervalo histórico
): Promise<RewardResult> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  const roleId = period === "weekly" ? config?.weeklyRoleId : config?.monthlyRoleId;

  if (!roleId) {
    logger.warn(`Guild ${guild.id}: cargo de recompensa ${period} não configurado.`);
    return { assigned: [], removed: [], failed: [], topUsers: [], roleName: "N/A" };
  }

  // Tenta cache primeiro; se não estiver, busca via API (evita falha por cache não populado)
  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId)) ?? undefined;
  if (!role) {
    logger.warn(`Guild ${guild.id}: cargo ${roleId} não encontrado (nem em cache, nem via API).`);
    return { assigned: [], removed: [], failed: [], topUsers: [], roleName: "N/A" };
  }

  const topN = period === "weekly" ? (config?.weeklyTopN ?? 5) : (config?.monthlyTopN ?? 5);
  const participantRoleIds = config?.participantRoleIds ?? [];

  // Garante cache completo de membros antes de qualquer filtro por cargo
  await guild.members.fetch();

  // Usa range histórico se fornecido, senão período corrente
  const allUsers = range
    ? await getLeaderboardForRange(guild.id, range.start, range.end, topN * 3)
    : await getLeaderboard(guild.id, period, topN * 3);

  const topUsers = allUsers
    .filter((u) => {
      if (participantRoleIds.length === 0) return true;
      const member = guild.members.cache.get(u.userId);
      return participantRoleIds.some((roleId) => member?.roles.cache.has(roleId));
    })
    .slice(0, topN);

  const topUserIds      = new Set(topUsers.map((u) => u.userId));
  const membersWithRole = guild.members.cache.filter((m) => m.roles.cache.has(roleId));

  const assigned: string[]                              = [];
  const removed:  string[]                              = [];
  const failed:   Array<{ username: string; reason: string }> = [];

  // ── Atribui cargo aos top N ──────────────────────────────────────────────
  for (const topUser of topUsers) {
    const member = guild.members.cache.get(topUser.userId);
    if (!member) continue;

    if (!member.roles.cache.has(roleId)) {
      try {
        await member.roles.add(roleId, `Top ${topN} ${period} - score: ${topUser.score.toFixed(1)}`);
        assigned.push(topUser.username);

        await prisma.roleAssignment.create({
          data: {
            userId:   topUser.userId,
            guildId:  guild.id,
            roleId,
            roleName: role.name,
            reason:   `${period}_top`,
          },
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Erro ao atribuir cargo para ${topUser.username}:`, error);
        failed.push({
          username: topUser.username,
          reason:   msg.includes("Missing Permissions")
            ? "403 — bot sem permissão (verifique hierarquia de cargos)"
            : msg,
        });
      }
    }
  }

  // ── Remove cargo de quem saiu do top, respeitando roleDurationDays ───────
  const roleDurationDays = period === "weekly"
    ? (config?.weeklyRoleDurationDays  ?? 7)
    : (config?.monthlyRoleDurationDays ?? 30);

  for (const [, member] of membersWithRole) {
    if (topUserIds.has(member.id)) continue;

    const assignment = await prisma.roleAssignment.findFirst({
      where:   { userId: member.id, guildId: guild.id, roleId, removedAt: null },
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
        data:  { removedAt: new Date(), reason: "rank_drop" },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Erro ao remover cargo de ${member.user.username}:`, error);
      failed.push({
        username: member.user.username,
        reason:   msg.includes("Missing Permissions")
          ? "403 — bot sem permissão ao remover (verifique hierarquia)"
          : msg,
      });
    }
  }

  // ── Remove cargo por inatividade ─────────────────────────────────────────
  const inactiveDays      = config?.inactiveThresholdDays ?? 14;
  const inactiveThreshold = new Date();
  inactiveThreshold.setDate(inactiveThreshold.getDate() - inactiveDays);

  const stillHasRole = guild.members.cache.filter((m) => m.roles.cache.has(roleId));
  for (const [, member] of stillHasRole) {
    const lastActivity = await prisma.dailyAggregate.findFirst({
      where:   { userId: member.id, guildId: guild.id },
      orderBy: { date: "desc" },
      select:  { date: true },
    });

    if (!lastActivity || lastActivity.date < inactiveThreshold) {
      try {
        await member.roles.remove(roleId, `Inativo há mais de ${inactiveDays} dias`);
        if (!removed.includes(member.user.username)) removed.push(member.user.username);

        await prisma.roleAssignment.updateMany({
          where: { userId: member.id, guildId: guild.id, roleId, removedAt: null },
          data:  { removedAt: new Date(), reason: "inactive_removal" },
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Erro ao remover cargo por inatividade de ${member.user.username}:`, error);
        failed.push({
          username: member.user.username,
          reason:   msg.includes("Missing Permissions")
            ? "403 — bot sem permissão ao remover (verifique hierarquia)"
            : msg,
        });
      }
    }
  }

  logger.info(
    `Guild ${guild.id}: ${period} rewards — ${assigned.length} atribuídos, ${removed.length} removidos, ${failed.length} falhas`
  );

  return {
    assigned,
    removed,
    failed,
    topUsers: topUsers.map((u) => ({
      userId:       u.userId,
      rank:         u.rank,
      username:     u.displayName ?? u.username,
      score:        u.score,
      messageCount: u.messageCount,
      voiceMinutes: u.voiceMinutes,
    })),
    roleName: role.name,
  };
}
