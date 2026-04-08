import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../database/prisma", () => ({
  prisma: {
    guildConfig: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    dailyAggregate: {
      groupBy:     vi.fn(),
      aggregate:   vi.fn(),
      findUnique:  vi.fn(),
      upsert:      vi.fn(),
    },
    messageActivity: { count:     vi.fn() },
    voiceSession:    { findMany:  vi.fn() },
    streamSession:   { findMany:  vi.fn() },
    reactionActivity:{ count:     vi.fn() },
  },
}));

import { prisma } from "../../database/prisma";
import {
  getLeaderboard,
  getUserStats,
  getLeaderboardForRange,
  aggregateDaily,
} from "../../services/metricsService";

const mockPrisma = prisma as unknown as {
  guildConfig:     { findUnique: ReturnType<typeof vi.fn> };
  user:            { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  dailyAggregate:  { groupBy: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  messageActivity: { count: ReturnType<typeof vi.fn> };
  voiceSession:    { findMany: ReturnType<typeof vi.fn> };
  streamSession:   { findMany: ReturnType<typeof vi.fn> };
  reactionActivity:{ count: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

// ── getLeaderboard ────────────────────────────────────────────────────────────

describe("getLeaderboard", () => {
  it("retorna lista com ranks corretos", async () => {
    mockPrisma.dailyAggregate.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { messageCount: 10, voiceMinutes: 20, streamMinutes: 0, reactionsCount: 5, score: 60 } },
      { userId: "u2", _sum: { messageCount:  5, voiceMinutes: 10, streamMinutes: 0, reactionsCount: 2, score: 30 } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", username: "Alpha", displayName: "Alpha Display", guildId: "g1" },
      { id: "u2", username: "Beta",  displayName: null,            guildId: "g1" },
    ]);

    const result = await getLeaderboard("g1", "weekly", 10, "UTC");

    expect(result).toHaveLength(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[0].userId).toBe("u1");
    expect(result[0].score).toBe(60);
  });

  it("retorna array vazio quando não há dados", async () => {
    mockPrisma.dailyAggregate.groupBy.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await getLeaderboard("g1", "weekly", 10, "UTC");
    expect(result).toHaveLength(0);
  });

  it("usa username de fallback quando usuário não é encontrado no banco", async () => {
    mockPrisma.dailyAggregate.groupBy.mockResolvedValue([
      { userId: "u99", _sum: { messageCount: 1, voiceMinutes: 0, streamMinutes: 0, reactionsCount: 0, score: 1 } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await getLeaderboard("g1", "weekly", 10, "UTC");
    expect(result[0].username).toBe("Usuário Desconhecido");
  });
});

// ── getUserStats ──────────────────────────────────────────────────────────────

describe("getUserStats", () => {
  it("retorna null quando não há score no período", async () => {
    mockPrisma.dailyAggregate.aggregate.mockResolvedValue({
      _sum: { messageCount: 0, voiceMinutes: 0, streamMinutes: 0, reactionsCount: 0, score: 0 },
    });

    const result = await getUserStats("u1", "g1", "weekly", "UTC");
    expect(result).toBeNull();
  });

  it("retorna UserScore com rank calculado", async () => {
    mockPrisma.dailyAggregate.aggregate.mockResolvedValue({
      _sum: { messageCount: 10, voiceMinutes: 20, streamMinutes: 0, reactionsCount: 5, score: 55 },
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", username: "Alpha", displayName: "Alpha D" });
    // 2 usuários com score maior
    mockPrisma.dailyAggregate.groupBy.mockResolvedValue([{ userId: "u2" }, { userId: "u3" }]);

    const result = await getUserStats("u1", "g1", "weekly", "UTC");

    expect(result).not.toBeNull();
    expect(result!.rank).toBe(3); // 2 melhores + 1
    expect(result!.score).toBe(55);
    expect(result!.username).toBe("Alpha");
  });
});

// ── getLeaderboardForRange ────────────────────────────────────────────────────

describe("getLeaderboardForRange", () => {
  it("retorna leaderboard para intervalo customizado", async () => {
    mockPrisma.dailyAggregate.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { messageCount: 5, voiceMinutes: 10, streamMinutes: 0, reactionsCount: 2, score: 30 } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", username: "Alpha", displayName: null, guildId: "g1" },
    ]);

    const start = new Date("2026-03-01T00:00:00Z");
    const end   = new Date("2026-04-01T00:00:00Z");
    const result = await getLeaderboardForRange("g1", start, end, 10);

    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);

    const call = mockPrisma.dailyAggregate.groupBy.mock.calls[0][0];
    expect(call.where.date.gte).toEqual(start);
    expect(call.where.date.lt).toEqual(end);
  });
});

// ── aggregateDaily ────────────────────────────────────────────────────────────

describe("aggregateDaily", () => {
  it("calcula score e chama upsert para usuário com atividade", async () => {
    mockPrisma.guildConfig.findUnique.mockResolvedValue({
      timezone: "UTC",
      voiceMultiplier: 2.0,
      streamEnabled: false,
      streamMultiplier: 1.5,
    });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", guildId: "g1", username: "Alpha" },
    ]);
    mockPrisma.messageActivity.count.mockResolvedValue(5);
    mockPrisma.voiceSession.findMany.mockResolvedValue([
      {
        joinedAt: new Date("2026-04-08T10:00:00Z"),
        leftAt:   new Date("2026-04-08T11:00:00Z"),
      },
    ]);
    mockPrisma.streamSession.findMany.mockResolvedValue([]);
    mockPrisma.reactionActivity.count.mockResolvedValue(3);
    mockPrisma.dailyAggregate.findUnique.mockResolvedValue(null);
    mockPrisma.dailyAggregate.upsert.mockResolvedValue({});

    await aggregateDaily("g1", new Date("2026-04-08T12:00:00Z"));

    expect(mockPrisma.dailyAggregate.upsert).toHaveBeenCalledOnce();
    const upsertArg = mockPrisma.dailyAggregate.upsert.mock.calls[0][0];
    // msgs=5, voz=60min, reações=3, streamEnabled=false
    // base = 5*1 + 60*2 + 0 + 3*1.5 = 5 + 120 + 4.5 = 129.5
    expect(upsertArg.update.score).toBeCloseTo(129.5);
    expect(upsertArg.update.voiceMinutes).toBe(60);
    expect(upsertArg.update.messageCount).toBe(5);
  });

  it("pula usuários sem atividade no dia", async () => {
    mockPrisma.guildConfig.findUnique.mockResolvedValue({
      timezone: "UTC",
      voiceMultiplier: 2.0,
      streamEnabled: false,
      streamMultiplier: 1.5,
    });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", guildId: "g1", username: "Inactive" },
    ]);
    mockPrisma.messageActivity.count.mockResolvedValue(0);
    mockPrisma.voiceSession.findMany.mockResolvedValue([]);
    mockPrisma.streamSession.findMany.mockResolvedValue([]);
    mockPrisma.reactionActivity.count.mockResolvedValue(0);

    await aggregateDaily("g1", new Date("2026-04-08T12:00:00Z"));

    expect(mockPrisma.dailyAggregate.upsert).not.toHaveBeenCalled();
  });
});
