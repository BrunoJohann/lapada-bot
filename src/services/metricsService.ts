import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";
import { calculateScore } from "../utils/scoring";
import { getLocalDayBoundaries, toLocalNow, getPeriodStart } from "../utils/dateUtils";

export interface UserScore {
  userId: string;
  username: string;
  displayName: string | null;
  messageCount: number;
  voiceMinutes: number;
  streamMinutes: number;
  reactionsCount: number;
  score: number;
  rank: number;
}

export async function aggregateDaily(guildId: string, date: Date): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  const timezone = config?.timezone ?? "America/Sao_Paulo";

  const { dayStart, dayEnd, localDate } = getLocalDayBoundaries(date, timezone);

  const voiceMultiplier  = config?.voiceMultiplier  ?? 2.0;
  const streamEnabled    = config?.streamEnabled    ?? false;
  const streamMultiplier = config?.streamMultiplier ?? 1.5;

  const users = await prisma.user.findMany({ where: { guildId } });

  for (const user of users) {
    const [messageCount, voiceSessions, streamSessions, reactionsCount] = await Promise.all([
      prisma.messageActivity.count({
        where: { userId: user.id, guildId, createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.voiceSession.findMany({
        where: {
          userId: user.id,
          guildId,
          OR: [
            { joinedAt: { gte: dayStart, lt: dayEnd } },
            { joinedAt: { lt: dayStart }, leftAt: { gte: dayStart } },
            { joinedAt: { lt: dayStart }, leftAt: null },
          ],
        },
        select: { leftAt: true, joinedAt: true },
      }),
      streamEnabled
        ? prisma.streamSession.findMany({
            where: {
              userId: user.id,
              guildId,
              OR: [
                { startedAt: { gte: dayStart, lt: dayEnd } },
                { startedAt: { lt: dayStart }, endedAt: { gte: dayStart } },
                { startedAt: { lt: dayStart }, endedAt: null },
              ],
            },
            select: { endedAt: true, startedAt: true },
          })
        : Promise.resolve([]),
      prisma.reactionActivity.count({
        where: { targetUserId: user.id, guildId, createdAt: { gte: dayStart, lt: dayEnd } },
      }),
    ]);

    if (messageCount === 0 && voiceSessions.length === 0 && reactionsCount === 0 && streamSessions.length === 0) continue;

    const now = Date.now();

    const voiceMinutes = Math.floor(
      voiceSessions.reduce((sum, s) => {
        const start = Math.max(s.joinedAt.getTime(), dayStart.getTime());
        const end   = s.leftAt
          ? Math.min(s.leftAt.getTime(), dayEnd.getTime())
          : Math.min(now, dayEnd.getTime());
        return sum + Math.max(0, end - start);
      }, 0) / 60000
    );

    const streamMinutes = Math.floor(
      (streamSessions as Array<{ endedAt: Date | null; startedAt: Date }>)
        .reduce((sum, s) => {
          const start = Math.max(s.startedAt.getTime(), dayStart.getTime());
          const end   = s.endedAt
            ? Math.min(s.endedAt.getTime(), dayEnd.getTime())
            : Math.min(now, dayEnd.getTime());
          return sum + Math.max(0, end - start);
        }, 0) / 60000
    );

    const existing = await prisma.dailyAggregate.findUnique({
      where: { userId_guildId_date: { userId: user.id, guildId, date: localDate } },
      select: { manualPoints: true },
    });
    const manualPoints = existing?.manualPoints ?? 0;

    const baseScore = calculateScore(messageCount, voiceMinutes, streamMinutes, reactionsCount, 0, voiceMultiplier, streamEnabled ? streamMultiplier : 0);
    const score = baseScore + manualPoints;

    await prisma.dailyAggregate.upsert({
      where: { userId_guildId_date: { userId: user.id, guildId, date: localDate } },
      update: { messageCount, voiceMinutes, streamMinutes, reactionsCount, score },
      create: { userId: user.id, guildId, date: localDate, messageCount, voiceMinutes, streamMinutes, reactionsCount, score, manualPoints: 0 },
    });
  }

  logger.info(`Agregação diária concluída para guild ${guildId} em ${localDate.toISOString().split("T")[0]} (${timezone})`);
}

export async function getLeaderboard(
  guildId: string,
  period: "weekly" | "monthly",
  limit: number = 10,
  timezone: string = "UTC"
): Promise<UserScore[]> {
  const now = toLocalNow(timezone);
  const periodStart = getPeriodStart(now, period);

  const aggregates = await prisma.dailyAggregate.groupBy({
    by: ["userId"],
    where: { guildId, date: { gte: periodStart } },
    _sum: { messageCount: true, voiceMinutes: true, streamMinutes: true, reactionsCount: true, score: true },
    orderBy: { _sum: { score: "desc" } },
    take: limit,
  });

  const userIds = aggregates.map((a) => a.userId);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return aggregates.map((agg, index) => {
    const user = userMap.get(agg.userId);
    return {
      userId:        agg.userId,
      username:      user?.username      ?? "Usuário Desconhecido",
      displayName:   user?.displayName   ?? null,
      messageCount:  agg._sum.messageCount  ?? 0,
      voiceMinutes:  agg._sum.voiceMinutes  ?? 0,
      streamMinutes: agg._sum.streamMinutes ?? 0,
      reactionsCount:agg._sum.reactionsCount ?? 0,
      score:         agg._sum.score         ?? 0,
      rank:          index + 1,
    };
  });
}

export async function getUserStats(
  userId: string,
  guildId: string,
  period: "weekly" | "monthly",
  timezone: string = "UTC"
): Promise<UserScore | null> {
  const now = toLocalNow(timezone);
  const periodStart = getPeriodStart(now, period);

  const agg = await prisma.dailyAggregate.aggregate({
    where: { userId, guildId, date: { gte: periodStart } },
    _sum: { messageCount: true, voiceMinutes: true, streamMinutes: true, reactionsCount: true, score: true },
  });

  if (!agg._sum.score) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });

  const betterUsers = await prisma.dailyAggregate.groupBy({
    by: ["userId"],
    where: { guildId, date: { gte: periodStart } },
    _sum: { score: true },
    having: { score: { _sum: { gt: agg._sum.score ?? 0 } } },
  });

  return {
    userId,
    username:      user?.username    ?? "Desconhecido",
    displayName:   user?.displayName ?? null,
    messageCount:  agg._sum.messageCount  ?? 0,
    voiceMinutes:  agg._sum.voiceMinutes  ?? 0,
    streamMinutes: agg._sum.streamMinutes ?? 0,
    reactionsCount:agg._sum.reactionsCount ?? 0,
    score:         agg._sum.score         ?? 0,
    rank:          betterUsers.length + 1,
  };
}

export async function searchActiveUsers(
  guildId: string,
  query: string,
  limit = 25
): Promise<{ id: string; label: string }[]> {
  const users = await prisma.user.findMany({
    where: {
      guildId,
      OR: [
        { username: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { username: "asc" },
  });

  return users.map((u) => ({ id: u.id, label: u.displayName ?? u.username }));
}

export async function getLeaderboardForRange(
  guildId: string,
  start: Date,
  end: Date,
  limit: number = 10
): Promise<UserScore[]> {
  const aggregates = await prisma.dailyAggregate.groupBy({
    by: ["userId"],
    where: { guildId, date: { gte: start, lt: end } },
    _sum: { messageCount: true, voiceMinutes: true, streamMinutes: true, reactionsCount: true, score: true },
    orderBy: { _sum: { score: "desc" } },
    take: limit,
  });

  const userIds = aggregates.map((a) => a.userId);
  const users   = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return aggregates.map((agg, index) => {
    const user = userMap.get(agg.userId);
    return {
      userId:        agg.userId,
      username:      user?.username      ?? "Usuário Desconhecido",
      displayName:   user?.displayName   ?? null,
      messageCount:  agg._sum.messageCount  ?? 0,
      voiceMinutes:  agg._sum.voiceMinutes  ?? 0,
      streamMinutes: agg._sum.streamMinutes ?? 0,
      reactionsCount:agg._sum.reactionsCount ?? 0,
      score:         agg._sum.score         ?? 0,
      rank:          index + 1,
    };
  });
}

export interface DailyPoint {
  date: Date;
  voiceMinutes: number;
  score: number;
  messageCount: number;
}

export async function getDailyBreakdown(
  guildId: string,
  start: Date,
  end: Date,
  userId?: string
): Promise<DailyPoint[]> {
  const where = userId
    ? { guildId, userId, date: { gte: start, lt: end } }
    : { guildId, date: { gte: start, lt: end } };

  const rows = await prisma.dailyAggregate.groupBy({
    by: ["date"],
    where,
    _sum: { voiceMinutes: true, score: true, messageCount: true },
    orderBy: { date: "asc" },
  });

  const points: DailyPoint[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const row = rows.find((r) => r.date.getTime() === cursor.getTime());
    points.push({
      date:         new Date(cursor),
      voiceMinutes: row?._sum.voiceMinutes ?? 0,
      score:        row?._sum.score        ?? 0,
      messageCount: row?._sum.messageCount ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

export interface PeriodStats {
  voiceMinutes: number;
  messageCount: number;
  reactionsCount: number;
  streamMinutes: number;
  score: number;
}

// ── Quick comparison range helpers ─────────────────────────────────────────

export type QuickCompareMode = "semana" | "semana_passada" | "mes" | "mes_passado";

function fmtDateLocal(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/** Semana relativa ao início da semana atual (offset=0 → atual, 1 → passada, 2 → retrasada). */
export function weekRangeOffset(currentStart: Date, offset: number): HistoricalRange {
  const start = new Date(currentStart);
  start.setUTCDate(start.getUTCDate() - offset * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return {
    start,
    end,
    label: `${fmtDateLocal(start)} – ${fmtDateLocal(new Date(end.getTime() - 86_400_000))}`,
  };
}

/** Mês relativo ao início do mês atual (offset=0 → atual, 1 → passado, 2 → retrasado). */
export function monthRangeOffset(currentMonthStart: Date, offset: number): HistoricalRange {
  const start = new Date(currentMonthStart);
  start.setUTCMonth(start.getUTCMonth() - offset);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    start,
    end,
    label: start.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

/** Resolve os dois ranges de um modo de comparação rápida. */
export function resolveQuickCompareRanges(
  mode: QuickCompareMode,
  timezone: string
): { range1: HistoricalRange; range2: HistoricalRange } {
  const localNow = toLocalNow(timezone);

  if (mode === "semana" || mode === "semana_passada") {
    const currentStart = getPeriodStart(localNow, "weekly");
    if (mode === "semana") {
      return {
        range1: weekRangeOffset(currentStart, 1),
        range2: { start: currentStart, end: new Date(), label: getPeriodLabel(localNow, "weekly") },
      };
    } else {
      return {
        range1: weekRangeOffset(currentStart, 2),
        range2: weekRangeOffset(currentStart, 1),
      };
    }
  } else {
    const currentStart = getPeriodStart(localNow, "monthly");
    if (mode === "mes") {
      return {
        range1: monthRangeOffset(currentStart, 1),
        range2: { start: currentStart, end: new Date(), label: getPeriodLabel(localNow, "monthly") },
      };
    } else {
      return {
        range1: monthRangeOffset(currentStart, 2),
        range2: monthRangeOffset(currentStart, 1),
      };
    }
  }
}

export async function getAggregateStats(
  guildId: string,
  start: Date,
  end: Date,
  userId?: string
): Promise<PeriodStats> {
  const where = userId
    ? { guildId, userId, date: { gte: start, lt: end } }
    : { guildId, date: { gte: start, lt: end } };

  const agg = await prisma.dailyAggregate.aggregate({
    where,
    _sum: {
      voiceMinutes: true,
      messageCount: true,
      reactionsCount: true,
      streamMinutes: true,
      score: true,
    },
  });

  return {
    voiceMinutes:   agg._sum.voiceMinutes   ?? 0,
    messageCount:   agg._sum.messageCount   ?? 0,
    reactionsCount: agg._sum.reactionsCount ?? 0,
    streamMinutes:  agg._sum.streamMinutes  ?? 0,
    score:          agg._sum.score          ?? 0,
  };
}

export async function getUserStatsForRange(
  userId: string,
  guildId: string,
  start: Date,
  end: Date
): Promise<UserScore | null> {
  const agg = await prisma.dailyAggregate.aggregate({
    where: { userId, guildId, date: { gte: start, lt: end } },
    _sum: { messageCount: true, voiceMinutes: true, streamMinutes: true, reactionsCount: true, score: true },
  });

  if (!agg._sum.score) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });

  const betterUsers = await prisma.dailyAggregate.groupBy({
    by: ["userId"],
    where: { guildId, date: { gte: start, lt: end } },
    _sum: { score: true },
    having: { score: { _sum: { gt: agg._sum.score ?? 0 } } },
  });

  return {
    userId,
    username:      user?.username    ?? "Desconhecido",
    displayName:   user?.displayName ?? null,
    messageCount:  agg._sum.messageCount  ?? 0,
    voiceMinutes:  agg._sum.voiceMinutes  ?? 0,
    streamMinutes: agg._sum.streamMinutes ?? 0,
    reactionsCount:agg._sum.reactionsCount ?? 0,
    score:         agg._sum.score         ?? 0,
    rank:          betterUsers.length + 1,
  };
}

// ── Re-exports (bridge para importadores que ainda usam metricsService) ───────
export {
  toLocalNow,
  getPeriodStart,
  getPeriodLabel,
  resolveHistoricalRange,
} from "../utils/dateUtils";
export type { HistoricalRange } from "../utils/dateUtils";
