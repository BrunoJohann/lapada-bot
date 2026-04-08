import { Guild, GuildMember } from "discord.js";
import { prisma } from "../database/prisma";
import { getLeaderboard, getLeaderboardForRange, getPeriodStart } from "./metricsService";
import { logger } from "../utils/logger";

export interface RewardResult {
  assigned: string[];
  removed:  string[];
  failed:   Array<{ username: string; reason: string }>;
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

// ── Private helpers ───────────────────────────────────────────────────────────

type RoleAction = "add" | "remove";

interface RoleChangeResult {
  success:    boolean;
  displayName: string;
  failEntry?: { username: string; reason: string };
}

async function applyRoleChange(
  member:  GuildMember,
  roleId:  string,
  action:  RoleAction,
  reason:  string
): Promise<RoleChangeResult> {
  const displayName = member.displayName ?? member.user.username;
  try {
    if (action === "add") {
      await member.roles.add(roleId, reason);
    } else {
      await member.roles.remove(roleId, reason);
    }
    return { success: true, displayName };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Erro ao ${action === "add" ? "atribuir" : "remover"} cargo para ${displayName}:`, error);
    return {
      success: false,
      displayName,
      failEntry: {
        username: displayName,
        reason:   msg.includes("Missing Permissions")
          ? `403 — bot sem permissão${action === "remove" ? " ao remover" : ""} (verifique hierarquia de cargos)`
          : msg,
      },
    };
  }
}

// ── processRewards ────────────────────────────────────────────────────────────

export async function processRewards(
  guild:  Guild,
  period: "weekly" | "monthly",
  range?: { start: Date; end: Date }
): Promise<RewardResult> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  const roleId = period === "weekly" ? config?.weeklyRoleId : config?.monthlyRoleId;

  if (!roleId) {
    logger.warn(`Guild ${guild.id}: cargo de recompensa ${period} não configurado.`);
    return { assigned: [], removed: [], failed: [], topUsers: [], roleName: "N/A" };
  }

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId)) ?? undefined;
  if (!role) {
    logger.warn(`Guild ${guild.id}: cargo ${roleId} não encontrado (nem em cache, nem via API).`);
    return { assigned: [], removed: [], failed: [], topUsers: [], roleName: "N/A" };
  }

  const topN = period === "weekly" ? (config?.weeklyTopN ?? 5) : (config?.monthlyTopN ?? 5);
  const participantRoleIds = config?.participantRoleIds ?? [];

  await guild.members.fetch();

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

  const assigned: string[]                                   = [];
  const removed:  string[]                                   = [];
  const failed:   Array<{ username: string; reason: string }> = [];

  // ── Atribui cargo aos top N ──────────────────────────────────────────────
  for (const topUser of topUsers) {
    const member = guild.members.cache.get(topUser.userId);
    if (!member || member.roles.cache.has(roleId)) continue;

    const result = await applyRoleChange(
      member, roleId, "add",
      `Top ${topN} ${period} - score: ${topUser.score.toFixed(1)}`
    );
    if (result.success) {
      assigned.push(result.displayName);
      await prisma.roleAssignment.create({
        data: { userId: topUser.userId, guildId: guild.id, roleId, roleName: role.name, reason: `${period}_top` },
      });
    } else {
      failed.push(result.failEntry!);
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

    const result = await applyRoleChange(member, roleId, "remove", "Saiu do top ranking e prazo expirou");
    if (result.success) {
      removed.push(result.displayName);
      await prisma.roleAssignment.updateMany({
        where: { userId: member.id, guildId: guild.id, roleId, removedAt: null },
        data:  { removedAt: new Date(), reason: "rank_drop" },
      });
    } else {
      failed.push(result.failEntry!);
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
      const result = await applyRoleChange(member, roleId, "remove", `Inativo há mais de ${inactiveDays} dias`);
      if (result.success) {
        if (!removed.includes(result.displayName)) removed.push(result.displayName);
        await prisma.roleAssignment.updateMany({
          where: { userId: member.id, guildId: guild.id, roleId, removedAt: null },
          data:  { removedAt: new Date(), reason: "inactive_removal" },
        });
      } else {
        failed.push(result.failEntry!);
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

// ── Cargo de Desafio Individual ────────────────────────────────────────────

export interface ChallengeRewardResult {
  assigned:       string[];
  removed:        string[];
  failed:         Array<{ username: string; reason: string }>;
  roleName:       string;
  minPoints:      number;
  qualifiedCount: number;
}

export async function processChallengeRewards(
  guild:  Guild,
  range?: { start: Date; end: Date }
): Promise<ChallengeRewardResult> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  const roleId    = config?.challengeRoleId;
  const minPoints = config?.challengeMinPoints;

  if (!roleId || minPoints == null) {
    logger.warn(`Guild ${guild.id}: cargo de desafio não configurado.`);
    return { assigned: [], removed: [], failed: [], roleName: "N/A", minPoints: 0, qualifiedCount: 0 };
  }

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId)) ?? undefined;
  if (!role) {
    logger.warn(`Guild ${guild.id}: cargo de desafio ${roleId} não encontrado.`);
    return { assigned: [], removed: [], failed: [], roleName: "N/A", minPoints, qualifiedCount: 0 };
  }

  await guild.members.fetch();

  const now   = new Date();
  const start = range?.start ?? getPeriodStart(now, "weekly");
  const end   = range?.end   ?? now;

  const qualifiedAggregates = await prisma.dailyAggregate.groupBy({
    by:    ["userId"],
    where: { guildId: guild.id, date: { gte: start, lt: end } },
    _sum:  { score: true },
    having:{ score: { _sum: { gte: minPoints } } },
    orderBy: { _sum: { score: "desc" } },
  });

  const participantRoleIds = config?.participantRoleIds ?? [];
  const qualifiedIds = new Set(
    qualifiedAggregates
      .filter((a) => {
        if (participantRoleIds.length === 0) return true;
        const member = guild.members.cache.get(a.userId);
        return participantRoleIds.some((rid) => member?.roles.cache.has(rid));
      })
      .map((a) => a.userId)
  );

  const membersWithRole = guild.members.cache.filter((m) => m.roles.cache.has(roleId));
  const durationDays    = config?.challengeRoleDurationDays ?? 7;

  const assigned: string[]                                   = [];
  const removed:  string[]                                   = [];
  const failed:   Array<{ username: string; reason: string }> = [];

  // ── Atribui cargo a quem atingiu o mínimo ────────────────────────────────
  for (const userId of qualifiedIds) {
    const member = guild.members.cache.get(userId);
    if (!member || member.roles.cache.has(roleId)) continue;

    const result = await applyRoleChange(member, roleId, "add", `Desafio: atingiu ${minPoints} pts no período`);
    if (result.success) {
      assigned.push(result.displayName);
      await prisma.roleAssignment.create({
        data: { userId, guildId: guild.id, roleId, roleName: role.name, reason: "challenge_week" },
      });
    } else {
      failed.push(result.failEntry!);
    }
  }

  // ── Remove cargo de quem não atingiu o mínimo e prazo expirou ───────────
  for (const [, member] of membersWithRole) {
    if (qualifiedIds.has(member.id)) continue;

    const assignment = await prisma.roleAssignment.findFirst({
      where:   { userId: member.id, guildId: guild.id, roleId, removedAt: null },
      orderBy: { assignedAt: "desc" },
    });
    const daysSince = assignment
      ? (Date.now() - assignment.assignedAt.getTime()) / 86_400_000
      : Infinity;

    if (daysSince < durationDays) continue;

    const result = await applyRoleChange(
      member, roleId, "remove",
      "Não atingiu o mínimo de pontos e prazo expirou"
    );
    if (result.success) {
      removed.push(result.displayName);
      await prisma.roleAssignment.updateMany({
        where: { userId: member.id, guildId: guild.id, roleId, removedAt: null },
        data:  { removedAt: new Date(), reason: "challenge_drop" },
      });
    } else {
      failed.push(result.failEntry!);
    }
  }

  logger.info(
    `Guild ${guild.id}: challenge rewards — ${assigned.length} atribuídos, ${removed.length} removidos, ${failed.length} falhas (mín: ${minPoints} pts)`
  );

  return { assigned, removed, failed, roleName: role.name, minPoints, qualifiedCount: qualifiedIds.size };
}
