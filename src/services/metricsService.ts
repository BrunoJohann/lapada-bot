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

/**
 * Computes the UTC timestamps for the start and end of the local day that contains `utcDate`.
 * The `localDate` key is UTC midnight of that local date (used as the DailyAggregate primary key).
 *
 * Example for BRT (UTC-3): "April 5 local" → dayStart = 03:00 UTC Apr 5, dayEnd = 03:00 UTC Apr 6.
 */
function getLocalDayBoundaries(
  utcDate: Date,
  timezone: string
): { dayStart: Date; dayEnd: Date; localDate: Date } {
  // Get the local date string (YYYY-MM-DD) for this UTC instant
  const localDateStr = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(utcDate);

  // Find what local time shows when UTC is at midnight of this local date
  const utcMidnight = new Date(localDateStr + "T00:00:00Z");
  const localTimeAtUtcMidnight = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(utcMidnight);

  const [hStr, mStr] = localTimeAtUtcMidnight.split(":");
  const h = parseInt(hStr) === 24 ? 0 : parseInt(hStr);
  const m = parseInt(mStr);
  const localMinsAtUtcMidnight = h * 60 + m;

  // Compute UTC timestamp for local midnight:
  // If local shows 21:00 at UTC midnight (UTC-3), local midnight = UTC midnight + 3h
  // If local shows 05:30 at UTC midnight (UTC+5:30), local midnight = UTC midnight - 5.5h
  const dayStartMs =
    localMinsAtUtcMidnight > 720
      ? utcMidnight.getTime() + (1440 - localMinsAtUtcMidnight) * 60_000
      : utcMidnight.getTime() - localMinsAtUtcMidnight * 60_000;

  return {
    dayStart:  new Date(dayStartMs),
    dayEnd:    new Date(dayStartMs + 86_400_000),
    localDate: utcMidnight, // UTC midnight = unique key for this local date
  };
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
      // Inclui sessões que cruzam a fronteira do dia local:
      // (1) começou e terminou dentro do dia
      // (2) começou antes, terminou dentro do dia
      // (3) começou antes e ainda está aberta (pode estar cruzando a meia-noite local)
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

    // Calcula duração apenas dentro dos limites do dia local (clamp)
    // Sessões que cruzam a meia-noite local são divididas entre os dois dias
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

    // Preserva pontos manuais adicionados por admin (não são sobrescritos pelo aggregate)
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

/**
 * Returns a Date whose UTC fields represent the current local time in the given timezone.
 * Allows getPeriodStart (which uses getUTC* methods) to operate on local time instead of UTC.
 * Example: at 21:23 BRT (UTC-3) = 00:23 UTC, this returns a date where getUTCHours() === 21.
 */
export function toLocalNow(timezone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0");
  const h = get("hour");
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), h === 24 ? 0 : h, get("minute"), get("second")));
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

// ── Histórico ──────────────────────────────────────────────────────────────

export interface HistoricalRange {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Resolve um intervalo histórico a partir de semana/mês/ano.
 *
 * Para semanas: usa o mesmo sistema ISO do bot (segunda→domingo).
 *   A âncora é a primeira segunda-feira do mês.
 *   Semana 1 = primeira segunda-feira até o domingo seguinte.
 *   Semana 2 = segunda segunda-feira até o domingo seguinte. Etc.
 *   Dias anteriores à primeira segunda-feira pertencem à última semana
 *   do mês anterior (ex: dia 1 domingo → consulte o mês anterior).
 *
 * Para meses: primeiro ao último dia do mês.
 *
 * Retorna null quando nenhum parâmetro histórico foi fornecido.
 */
export function resolveHistoricalRange(
  semana: number | null,
  mes: number | null,
  ano: number | null
): HistoricalRange | null {
  if (!mes && !semana) return null;

  const now = new Date();
  const year  = ano  ?? now.getUTCFullYear();
  const month = (mes ?? (now.getUTCMonth() + 1)) - 1; // 0-indexed para Date.UTC

  if (semana !== null) {
    // Encontra a primeira segunda-feira do mês (alinha com getPeriodStart "weekly")
    const firstOfMonth   = new Date(Date.UTC(year, month, 1));
    const firstDayOfWeek = firstOfMonth.getUTCDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
    // Dias até a próxima segunda: 0 se já for segunda, 1 se for domingo, etc.
    const daysToFirstMonday = firstDayOfWeek === 1 ? 0 : firstDayOfWeek === 0 ? 1 : 8 - firstDayOfWeek;
    const firstMondayDay    = 1 + daysToFirstMonday;

    // Semana N começa em firstMonday + (N-1) * 7 dias
    const weekStartDay = firstMondayDay + (semana - 1) * 7;
    const start = new Date(Date.UTC(year, month, weekStartDay));       // pode transbordar para mês seguinte
    const end   = new Date(Date.UTC(year, month, weekStartDay + 7));   // exclusive

    const displayEnd = new Date(end.getTime() - 86_400_000);
    const label = `Semana ${semana} — ${fmtDate(start)} a ${fmtDate(displayEnd)}`;
    return { start, end, label };
  } else {
    const start = new Date(Date.UTC(year, month, 1));
    const end   = new Date(Date.UTC(year, month + 1, 1));
    const label = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { start, end, label };
  }
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

/**
 * Retorna uma série temporal por dia para um gráfico de atividade.
 * Se userId for omitido, agrega todos os usuários do servidor.
 */
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

  // Preenche dias sem dados com zero para a linha não ter lacunas
  const points: DailyPoint[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const row = rows.find((r) => r.date.getTime() === cursor.getTime());
    points.push({
      date: new Date(cursor),
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
