import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

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

function calculateScore(
  messageCount: number,
  voiceMinutes: number,
  streamMinutes: number,
  reactionsCount: number,
  streakDays: number = 0,
  voiceMultiplier: number = 2.0,
  streamMultiplier: number = 0
): number {
  const base =
    messageCount * 1.0 +
    voiceMinutes * voiceMultiplier +
    streamMinutes * streamMultiplier +
    reactionsCount * 1.5;

  return base * (1 + streakDays * 0.05);
}

export async function aggregateDaily(guildId: string, date: Date): Promise<void> {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
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
        where: { userId: user.id, guildId, joinedAt: { gte: dayStart, lt: dayEnd } },
        select: { durationMs: true, leftAt: true, joinedAt: true },
      }),
      streamEnabled
        ? prisma.streamSession.findMany({
            where: { userId: user.id, guildId, startedAt: { gte: dayStart, lt: dayEnd } },
            select: { durationMs: true, endedAt: true, startedAt: true },
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
        if (s.durationMs !== null) return sum + s.durationMs;
        if (s.leftAt === null) return sum + (now - s.joinedAt.getTime());
        return sum;
      }, 0) / 60000
    );

    const streamMinutes = Math.floor(
      (streamSessions as Array<{ durationMs: number | null; endedAt: Date | null; startedAt: Date }>)
        .reduce((sum, s) => {
          if (s.durationMs !== null) return sum + s.durationMs;
          if (s.endedAt === null) return sum + (now - s.startedAt.getTime());
          return sum;
        }, 0) / 60000
    );

    const score = calculateScore(messageCount, voiceMinutes, streamMinutes, reactionsCount, 0, voiceMultiplier, streamEnabled ? streamMultiplier : 0);

    await prisma.dailyAggregate.upsert({
      where: { userId_guildId_date: { userId: user.id, guildId, date: dayStart } },
      update: { messageCount, voiceMinutes, streamMinutes, reactionsCount, score },
      create: { userId: user.id, guildId, date: dayStart, messageCount, voiceMinutes, streamMinutes, reactionsCount, score },
    });
  }

  logger.info(`Agregação diária concluída para guild ${guildId} em ${dayStart.toISOString().split("T")[0]}`);
}

export async function getLeaderboard(
  guildId: string,
  period: "weekly" | "monthly",
  limit: number = 10
): Promise<UserScore[]> {
  const now = new Date();
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
      userId: agg.userId,
      username: user?.username ?? "Usuário Desconhecido",
      displayName: user?.displayName ?? null,
      messageCount: agg._sum.messageCount ?? 0,
      voiceMinutes: agg._sum.voiceMinutes ?? 0,
      streamMinutes: agg._sum.streamMinutes ?? 0,
      reactionsCount: agg._sum.reactionsCount ?? 0,
      score: agg._sum.score ?? 0,
      rank: index + 1,
    };
  });
}

export async function getUserStats(
  userId: string,
  guildId: string,
  period: "weekly" | "monthly"
): Promise<UserScore | null> {
  const now = new Date();
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
    username: user?.username ?? "Desconhecido",
    displayName: user?.displayName ?? null,
    messageCount: agg._sum.messageCount ?? 0,
    voiceMinutes: agg._sum.voiceMinutes ?? 0,
    streamMinutes: agg._sum.streamMinutes ?? 0,
    reactionsCount: agg._sum.reactionsCount ?? 0,
    score: agg._sum.score ?? 0,
    rank: betterUsers.length + 1,
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

export function getPeriodStart(date: Date, period: "weekly" | "monthly"): Date {
  const start = new Date(date);
  if (period === "weekly") {
    const day = start.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + diff);
  } else {
    start.setUTCDate(1);
  }
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export function getPeriodLabel(date: Date, period: "weekly" | "monthly"): string {
  if (period === "weekly") {
    const start = getPeriodStart(date, "weekly");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  } else {
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
