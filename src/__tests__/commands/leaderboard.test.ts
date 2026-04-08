import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/metricsService", () => ({
  getLeaderboard:         vi.fn(),
  getLeaderboardForRange: vi.fn(),
  aggregateDaily:         vi.fn(),
  toLocalNow:             vi.fn(() => new Date("2026-04-08T00:00:00Z")),
  getPeriodLabel:         vi.fn(() => "06/04 – 12/04"),
  resolveHistoricalRange: vi.fn(() => null),
}));

vi.mock("../../utils/guildConfig", () => ({
  getCachedGuildConfig: vi.fn(() => ({
    timezone: "America/Sao_Paulo",
    participantRoleIds: [],
  })),
}));

vi.mock("../../utils/redis", () => ({
  getCached: vi.fn((_key: string, _ttl: number, fn: () => unknown) => fn()),
  getRedis:  vi.fn(() => ({ exists: vi.fn().mockResolvedValue(1) })), // cache hit por padrão
}));

import { execute } from "../../commands/leaderboard";
import * as metricsService from "../../services/metricsService";

const mockMetrics = metricsService as unknown as {
  getLeaderboard:         ReturnType<typeof vi.fn>;
  getLeaderboardForRange: ReturnType<typeof vi.fn>;
  aggregateDaily:         ReturnType<typeof vi.fn>;
  resolveHistoricalRange: ReturnType<typeof vi.fn>;
};

const sampleEntries = [
  { userId: "u1", username: "Alpha", displayName: "Alpha D", messageCount: 10, voiceMinutes: 30, streamMinutes: 0, reactionsCount: 5, score: 80, rank: 1 },
  { userId: "u2", username: "Beta",  displayName: null,      messageCount:  5, voiceMinutes: 15, streamMinutes: 0, reactionsCount: 2, score: 40, rank: 2 },
];

function makeInteraction(overrides: Record<string, unknown> = {}) {
  return {
    guildId: "guild-123",
    guild: {
      members: {
        cache: new Map(),
        fetch: vi.fn().mockResolvedValue(undefined),
      },
    },
    options: {
      getString:  vi.fn().mockReturnValue(null),
      getInteger: vi.fn().mockReturnValue(null),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply:  vi.fn().mockResolvedValue(undefined),
    reply:      vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("/lapada-leaderboard", () => {
  it("responde com erro quando usado fora de servidor", async () => {
    const interaction = makeInteraction({ guildId: null });
    await execute(interaction as never);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("servidores") })
    );
  });

  it("envia embed com entradas do leaderboard", async () => {
    mockMetrics.getLeaderboard.mockResolvedValue(sampleEntries);
    const interaction = makeInteraction();
    await execute(interaction as never);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) })
    );
  });

  it("usa getLeaderboardForRange para consultas históricas", async () => {
    mockMetrics.resolveHistoricalRange.mockReturnValue({
      start: new Date("2026-03-01"),
      end:   new Date("2026-04-01"),
      label: "março de 2026",
    });
    mockMetrics.getLeaderboardForRange.mockResolvedValue(sampleEntries);

    const interaction = makeInteraction({
      options: {
        getString:  vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(3),
      },
    });
    await execute(interaction as never);

    expect(mockMetrics.getLeaderboardForRange).toHaveBeenCalled();
    expect(mockMetrics.getLeaderboard).not.toHaveBeenCalled();
  });

  it("usa getLeaderboard para período corrente", async () => {
    mockMetrics.resolveHistoricalRange.mockReturnValue(null);
    mockMetrics.getLeaderboard.mockResolvedValue(sampleEntries);

    const interaction = makeInteraction();
    await execute(interaction as never);

    expect(mockMetrics.getLeaderboard).toHaveBeenCalled();
    expect(mockMetrics.getLeaderboardForRange).not.toHaveBeenCalled();
  });

  it("não chama aggregateDaily quando cache hit", async () => {
    mockMetrics.resolveHistoricalRange.mockReturnValue(null);
    mockMetrics.getLeaderboard.mockResolvedValue(sampleEntries);

    const interaction = makeInteraction();
    await execute(interaction as never);

    expect(mockMetrics.aggregateDaily).not.toHaveBeenCalled();
  });
});
