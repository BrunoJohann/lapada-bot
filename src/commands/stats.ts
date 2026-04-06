import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  GuildMember,
} from "discord.js";
import {
  getUserStats,
  getUserStatsForRange,
  getPeriodLabel,
  resolveHistoricalRange,
  searchActiveUsers,
  toLocalNow,
} from "../services/metricsService";
import { buildStatsEmbed } from "../utils/embeds";
import { getCachedGuildConfig } from "../utils/guildConfig";
import { Command } from "../client";

const CURRENT_YEAR = new Date().getFullYear();

export const data = new SlashCommandBuilder()
  .setName("lapada-stats")
  .setDescription("Veja as métricas de atividade de um usuário")
  .addStringOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Usuário para ver stats (padrão: você mesmo)")
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("periodo")
      .setDescription("Período de análise (ignorado quando mes/semana são informados)")
      .addChoices(
        { name: "Semana atual", value: "weekly" },
        { name: "Mês atual",   value: "monthly" }
      )
  )
  .addIntegerOption((opt) =>
    opt
      .setName("mes")
      .setDescription("Mês histórico (1–12)")
      .setMinValue(1)
      .setMaxValue(12)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("ano")
      .setDescription(`Ano histórico (padrão: ${CURRENT_YEAR})`)
      .setMinValue(2024)
      .setMaxValue(2030)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("semana")
      .setDescription("Semana do mês (1 = dias 1–7, 2 = dias 8–14, etc.) — requer 'mes'")
      .setMinValue(1)
      .setMaxValue(5)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const query  = interaction.options.getFocused();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  const results = await searchActiveUsers(guildId, query, 25);
  await interaction.respond(results.map((u) => ({ name: u.label, value: u.id })));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const userInput = interaction.options.getString("usuario");
  const targetId  = userInput ?? interaction.user.id;
  const guildId   = interaction.guildId;

  let member = interaction.guild?.members.cache.get(targetId) as GuildMember | undefined;
  if (!member && interaction.guild) {
    member = await interaction.guild.members.fetch(targetId).catch(() => undefined);
  }
  const fallbackName = member?.displayName ?? targetId;

  const mes    = interaction.options.getInteger("mes");
  const ano    = interaction.options.getInteger("ano");
  const semana = interaction.options.getInteger("semana");

  const historical = resolveHistoricalRange(semana, mes, ano);

  let stats;
  let periodLabel: string;

  if (historical) {
    // ── Consulta histórica ─────────────────────────────────────────────────
    stats       = await getUserStatsForRange(targetId, guildId, historical.start, historical.end);
    periodLabel = historical.label;
  } else {
    // ── Período corrente ───────────────────────────────────────────────────
    const period   = (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";
    const config   = await getCachedGuildConfig(guildId);
    const timezone = config?.timezone ?? "America/Sao_Paulo";
    stats          = await getUserStats(targetId, guildId, period, timezone);
    periodLabel    = getPeriodLabel(toLocalNow(timezone), period);
  }

  if (!stats) {
    await interaction.editReply(`Nenhuma atividade registrada para **${fallbackName}** neste período.`);
    return;
  }

  const resolvedUser = !userInput ? interaction.user : member?.user;
  const avatarUrl    = resolvedUser?.displayAvatarURL() ?? undefined;

  const period = historical
    ? (semana ? "weekly" : "monthly")
    : (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";

  const embed = buildStatsEmbed({
    username:      stats.displayName ?? stats.username,
    avatarUrl,
    period,
    messageCount:  stats.messageCount,
    voiceMinutes:  stats.voiceMinutes,
    streamMinutes: stats.streamMinutes,
    reactionsCount:stats.reactionsCount,
    score:         stats.score,
    rank:          stats.rank,
  });

  const historicalTag = historical ? " · 📅 Dados históricos" : "";
  embed.setFooter({ text: `Período: ${periodLabel}${historicalTag} · Discord Activity Bot` });

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute, autocomplete } satisfies Command;
