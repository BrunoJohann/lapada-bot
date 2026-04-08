import { describe, it, expect } from "vitest";
import { EmbedBuilder } from "discord.js";
import { buildStatsEmbed, buildLeaderboardEmbed, buildReportEmbed } from "../../utils/embeds";

describe("buildStatsEmbed", () => {
  const base = {
    username: "TestUser",
    period: "weekly" as const,
    messageCount: 42,
    voiceMinutes: 90,
    reactionsCount: 5,
    score: 237.5,
  };

  it("retorna instância de EmbedBuilder", () => {
    expect(buildStatsEmbed(base)).toBeInstanceOf(EmbedBuilder);
  });

  it("título contém nome do usuário e 'Semana' para weekly", () => {
    const embed = buildStatsEmbed(base);
    expect(embed.data.title).toContain("TestUser");
    expect(embed.data.title).toContain("Semana");
  });

  it("título contém 'Mês' para monthly", () => {
    const embed = buildStatsEmbed({ ...base, period: "monthly" });
    expect(embed.data.title).toContain("Mês");
  });

  it("campo de stream não aparece quando streamMinutes é 0", () => {
    const embed = buildStatsEmbed({ ...base, streamMinutes: 0 });
    const fields = embed.data.fields ?? [];
    expect(fields.some((f) => f.name.toLowerCase().includes("stream"))).toBe(false);
  });

  it("campo de stream aparece quando streamMinutes > 0", () => {
    const embed = buildStatsEmbed({ ...base, streamMinutes: 30 });
    const fields = embed.data.fields ?? [];
    expect(fields.some((f) => f.name.toLowerCase().includes("stream"))).toBe(true);
  });

  it("campo de ranking usa medalha para rank 1", () => {
    const embed = buildStatsEmbed({ ...base, rank: 1 });
    const fields = embed.data.fields ?? [];
    const rankField = fields.find((f) => f.name.includes("Ranking"));
    expect(rankField?.value).toContain("🥇");
  });

  it("campo de ranking usa medalha para rank 2", () => {
    const embed = buildStatsEmbed({ ...base, rank: 2 });
    const fields = embed.data.fields ?? [];
    const rankField = fields.find((f) => f.name.includes("Ranking"));
    expect(rankField?.value).toContain("🥈");
  });

  it("campo de ranking usa #N para rank > 3", () => {
    const embed = buildStatsEmbed({ ...base, rank: 7 });
    const fields = embed.data.fields ?? [];
    const rankField = fields.find((f) => f.name.includes("Ranking"));
    expect(rankField?.value).toContain("#7");
  });

  it("campo de ranking não aparece quando rank não é fornecido", () => {
    const embed = buildStatsEmbed(base);
    const fields = embed.data.fields ?? [];
    expect(fields.some((f) => f.name.includes("Ranking"))).toBe(false);
  });
});

describe("buildLeaderboardEmbed", () => {
  const entries = [
    { rank: 1, username: "Alpha",  score: 500, messageCount: 30, voiceMinutes: 120 },
    { rank: 2, username: "Beta",   score: 300, messageCount: 20, voiceMinutes:  60 },
    { rank: 3, username: "Gamma",  score: 100, messageCount: 10, voiceMinutes:  30 },
  ];

  it("retorna instância de EmbedBuilder", () => {
    expect(buildLeaderboardEmbed({ period: "weekly", entries, periodLabel: "06/04 – 12/04" })).toBeInstanceOf(EmbedBuilder);
  });

  it("título contém 'Semanal' e o periodLabel", () => {
    const embed = buildLeaderboardEmbed({ period: "weekly", entries, periodLabel: "06/04 – 12/04" });
    expect(embed.data.title).toContain("Semanal");
    expect(embed.data.title).toContain("06/04 – 12/04");
  });

  it("título contém 'Mensal' para monthly", () => {
    const embed = buildLeaderboardEmbed({ period: "monthly", entries, periodLabel: "abril de 2026" });
    expect(embed.data.title).toContain("Mensal");
  });

  it("descrição contém os nomes dos usuários", () => {
    const embed = buildLeaderboardEmbed({ period: "weekly", entries, periodLabel: "" });
    expect(embed.data.description).toContain("Alpha");
    expect(embed.data.description).toContain("Beta");
    expect(embed.data.description).toContain("Gamma");
  });

  it("usa medalhas para top 3", () => {
    const embed = buildLeaderboardEmbed({ period: "weekly", entries, periodLabel: "" });
    expect(embed.data.description).toContain("🥇");
    expect(embed.data.description).toContain("🥈");
    expect(embed.data.description).toContain("🥉");
  });

  it("exibe mensagem vazia quando não há entradas", () => {
    const embed = buildLeaderboardEmbed({ period: "weekly", entries: [], periodLabel: "" });
    expect(embed.data.description).toContain("Nenhuma atividade");
  });
});

describe("buildReportEmbed", () => {
  const topUsers = [
    { userId: "1", rank: 1, username: "Alpha", score: 500, messageCount: 30, voiceMinutes: 120 },
  ];

  it("retorna instância de EmbedBuilder", () => {
    expect(
      buildReportEmbed({ period: "weekly", periodLabel: "semana", topUsers, assignedRoles: [], removedRoles: [], roleName: "Top" })
    ).toBeInstanceOf(EmbedBuilder);
  });

  it("adiciona campo de cargos atribuídos quando assignedRoles não é vazio", () => {
    const embed = buildReportEmbed({
      period: "weekly", periodLabel: "semana", topUsers,
      assignedRoles: ["Alpha"], removedRoles: [], roleName: "Top",
    });
    expect(embed.data.fields?.some((f) => f.name.includes("Atribuído"))).toBe(true);
  });

  it("não adiciona campo de cargos atribuídos quando a lista está vazia", () => {
    const embed = buildReportEmbed({
      period: "weekly", periodLabel: "semana", topUsers,
      assignedRoles: [], removedRoles: [], roleName: "Top",
    });
    expect(embed.data.fields?.some((f) => f.name.includes("Atribuído"))).toBe(false);
  });

  it("adiciona campo de cargos removidos quando removedRoles não é vazio", () => {
    const embed = buildReportEmbed({
      period: "weekly", periodLabel: "semana", topUsers,
      assignedRoles: [], removedRoles: ["Beta"], roleName: "Top",
    });
    expect(embed.data.fields?.some((f) => f.name.includes("Removido"))).toBe(true);
  });
});
