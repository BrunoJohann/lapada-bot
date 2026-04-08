import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/metricsService", () => ({
  getUserStats:         vi.fn(),
  getUserStatsForRange: vi.fn(),
  searchActiveUsers:    vi.fn(),
  toLocalNow:           vi.fn(() => new Date("2026-04-08T00:00:00Z")),
  getPeriodLabel:       vi.fn(() => "06/04 – 12/04"),
  resolveHistoricalRange: vi.fn(() => null),
}));

vi.mock("../../utils/guildConfig", () => ({
  getCachedGuildConfig: vi.fn(() => ({ timezone: "America/Sao_Paulo" })),
}));

import { execute } from "../../commands/stats";
import * as metricsService from "../../services/metricsService";

const mockMetrics = metricsService as unknown as {
  getUserStats:           ReturnType<typeof vi.fn>;
  getUserStatsForRange:   ReturnType<typeof vi.fn>;
  resolveHistoricalRange: ReturnType<typeof vi.fn>;
};

function makeInteraction(overrides: Record<string, unknown> = {}) {
  return {
    guildId: "guild-123",
    user:    { id: "user-abc", displayAvatarURL: () => "https://cdn.example.com/avatar.png" },
    guild:   {
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

describe("/lapada-stats", () => {
  it("responde com erro quando usado fora de servidor", async () => {
    const interaction = makeInteraction({ guildId: null });
    await execute(interaction as never);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("servidores") })
    );
  });

  it("exibe mensagem quando não há atividade", async () => {
    mockMetrics.getUserStats.mockResolvedValue(null);
    const interaction = makeInteraction();
    await execute(interaction as never);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Nenhuma atividade registrada")
    );
  });

  it("envia embed quando há atividade", async () => {
    mockMetrics.getUserStats.mockResolvedValue({
      userId: "user-abc",
      username: "Alpha",
      displayName: "Alpha D",
      messageCount: 10,
      voiceMinutes: 30,
      streamMinutes: 0,
      reactionsCount: 5,
      score: 75,
      rank: 2,
    });
    const interaction = makeInteraction();
    await execute(interaction as never);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) })
    );
  });

  it("usa getUserStatsForRange quando há dados históricos", async () => {
    mockMetrics.resolveHistoricalRange.mockReturnValue({
      start: new Date("2026-03-01"),
      end:   new Date("2026-04-01"),
      label: "março de 2026",
    });
    mockMetrics.getUserStatsForRange.mockResolvedValue({
      userId: "u1", username: "Alpha", displayName: null,
      messageCount: 5, voiceMinutes: 20, streamMinutes: 0, reactionsCount: 2,
      score: 49, rank: 1,
    });

    const interaction = makeInteraction({
      options: {
        getString:  vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(3), // mes=3
      },
    });
    await execute(interaction as never);

    expect(mockMetrics.getUserStatsForRange).toHaveBeenCalled();
    expect(mockMetrics.getUserStats).not.toHaveBeenCalled();
  });

  it("usa getUserStats para período corrente", async () => {
    mockMetrics.resolveHistoricalRange.mockReturnValue(null);
    mockMetrics.getUserStats.mockResolvedValue({
      userId: "u1", username: "Beta", displayName: null,
      messageCount: 3, voiceMinutes: 10, streamMinutes: 0, reactionsCount: 1,
      score: 20, rank: 5,
    });

    const interaction = makeInteraction();
    await execute(interaction as never);

    expect(mockMetrics.getUserStats).toHaveBeenCalled();
    expect(mockMetrics.getUserStatsForRange).not.toHaveBeenCalled();
  });
});
