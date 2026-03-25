import {
  EmbedBuilder,
  ColorResolvable,
  APIEmbedField,
} from "discord.js";

export const COLORS = {
  primary: 0x5865f2 as ColorResolvable, // blurple
  success: 0x57f287 as ColorResolvable,
  warning: 0xfee75c as ColorResolvable,
  error: 0xed4245 as ColorResolvable,
  gold: 0xf1c40f as ColorResolvable,
};

export const MEDALS = ["🥇", "🥈", "🥉"];

export function buildStatsEmbed(data: {
  username: string;
  avatarUrl?: string;
  period: "weekly" | "monthly";
  messageCount: number;
  voiceMinutes: number;
  reactionsCount: number;
  score: number;
  rank?: number;
}): EmbedBuilder {
  const periodLabel = data.period === "weekly" ? "Semana" : "Mês";

  const fields: APIEmbedField[] = [
    {
      name: "💬 Mensagens",
      value: data.messageCount.toLocaleString("pt-BR"),
      inline: true,
    },
    {
      name: "🎙️ Tempo de Voz",
      value: formatVoiceTime(data.voiceMinutes),
      inline: true,
    },
    {
      name: "⭐ Reações Recebidas",
      value: data.reactionsCount.toLocaleString("pt-BR"),
      inline: true,
    },
    {
      name: "🏆 Score Total",
      value: `**${data.score.toFixed(1)}** pts`,
      inline: true,
    },
  ];

  if (data.rank !== undefined) {
    fields.push({
      name: "📊 Ranking",
      value: data.rank <= 3 ? `${MEDALS[data.rank - 1]} #${data.rank}` : `#${data.rank}`,
      inline: true,
    });
  }

  return new EmbedBuilder()
    .setTitle(`📈 Stats de ${data.username} — ${periodLabel} Atual`)
    .setColor(COLORS.primary)
    .setThumbnail(data.avatarUrl ?? null)
    .addFields(fields)
    .setTimestamp()
    .setFooter({ text: "Discord Activity Bot" });
}

export function buildLeaderboardEmbed(data: {
  period: "weekly" | "monthly";
  entries: Array<{
    rank: number;
    username: string;
    score: number;
    messageCount: number;
    voiceMinutes: number;
  }>;
  periodLabel: string;
}): EmbedBuilder {
  const periodLabel = data.period === "weekly" ? "Semanal" : "Mensal";

  const description = data.entries
    .map((e) => {
      const medal = MEDALS[e.rank - 1] ?? `**#${e.rank}**`;
      const voice = formatVoiceTime(e.voiceMinutes);
      return `${medal} **${e.username}** — ${e.score.toFixed(1)} pts  *(${e.messageCount} msgs · ${voice} voz)*`;
    })
    .join("\n");

  return new EmbedBuilder()
    .setTitle(`🏆 Leaderboard ${periodLabel} — ${data.periodLabel}`)
    .setDescription(description || "Nenhuma atividade registrada neste período.")
    .setColor(COLORS.gold)
    .setTimestamp()
    .setFooter({ text: "Atualizado automaticamente · cache de 30min · use /lapada-report agregar para forçar" });
}

export function buildReportEmbed(data: {
  period: "weekly" | "monthly";
  periodLabel: string;
  topUsers: Array<{
    userId?: string;
    rank: number;
    username: string;
    score: number;
    messageCount: number;
    voiceMinutes: number;
  }>;
  assignedRoles: string[];
  removedRoles: string[];
  roleName: string;
}): EmbedBuilder {
  const periodLabel = data.period === "weekly" ? "Semanal" : "Mensal";

  const topList = data.topUsers
    .map((e) => {
      const medal = MEDALS[e.rank - 1] ?? `**#${e.rank}**`;
      return `${medal} **${e.username}** — ${e.score.toFixed(1)} pts`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle(`📊 Relatório ${periodLabel} — ${data.periodLabel}`)
    .setColor(COLORS.success)
    .setTimestamp()
    .setFooter({ text: "Discord Activity Bot" });

  embed.addFields({
    name: `🏅 Top ${data.topUsers.length} — Cargo "${data.roleName}"`,
    value: topList || "Nenhum dado.",
    inline: false,
  });

  if (data.assignedRoles.length > 0) {
    embed.addFields({
      name: "✅ Cargo Atribuído",
      value: data.assignedRoles.map((u) => `• ${u}`).join("\n"),
      inline: true,
    });
  }

  if (data.removedRoles.length > 0) {
    embed.addFields({
      name: "🔴 Cargo Removido",
      value: data.removedRoles.map((u) => `• ${u}`).join("\n"),
      inline: true,
    });
  }

  return embed;
}

function formatVoiceTime(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}
