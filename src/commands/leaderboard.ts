import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import {
  getLeaderboard,
  getLeaderboardForRange,
  getPeriodLabel,
  resolveHistoricalRange,
  aggregateDaily,
} from "../services/metricsService";
import { buildLeaderboardEmbed } from "../utils/embeds";
import { getCached, getRedis } from "../utils/redis";
import { getCachedGuildConfig } from "../utils/guildConfig";
import { Command } from "../client";

const CURRENT_YEAR = new Date().getFullYear();

export const data = new SlashCommandBuilder()
  .setName("lapada-leaderboard")
  .setDescription("Veja o ranking de atividade do servidor")
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const guildId = interaction.guildId;
  const mes    = interaction.options.getInteger("mes");
  const ano    = interaction.options.getInteger("ano");
  const semana = interaction.options.getInteger("semana");

  const historical = resolveHistoricalRange(semana, mes, ano);

  const config         = await getCachedGuildConfig(guildId);
  const participantRoleIds = config?.participantRoleIds ?? [];

  let entries;
  let periodLabel: string;

  if (historical) {
    // ── Consulta histórica (sem cache, sem aggregate) ──────────────────────
    entries     = await getLeaderboardForRange(guildId, historical.start, historical.end, 10);
    periodLabel = historical.label;
  } else {
    // ── Período corrente (com cache + aggregate automático) ────────────────
    const period   = (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";
    const cacheKey = `leaderboard:${guildId}:${period}`;
    const redis    = getRedis();
    const isCached = redis ? await redis.exists(cacheKey) : false;

    if (!isCached) {
      await aggregateDaily(guildId, new Date());
    }

    entries     = await getCached(cacheKey, 1800, () => getLeaderboard(guildId, period, 10));
    periodLabel = getPeriodLabel(new Date(), period);
  }

  // Resolve apelidos e filtra por cargos participantes
  const resolvedEntries = entries
    .map((e) => ({
      ...e,
      username:
        interaction.guild?.members.cache.get(e.userId)?.displayName ??
        e.displayName ??
        e.username,
      _member: interaction.guild?.members.cache.get(e.userId),
    }))
    .filter((e) => {
      if (participantRoleIds.length === 0) return true;
      if (!e._member) return true;
      return participantRoleIds.some((roleId) => e._member!.roles.cache.has(roleId));
    })
    .map(({ _member, ...e }) => e);

  const period = historical
    ? (semana ? "weekly" : "monthly")
    : (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";

  const embed = buildLeaderboardEmbed({ period, entries: resolvedEntries, periodLabel });

  if (historical) {
    embed.setFooter({ text: `📅 Dados históricos · Discord Activity Bot` });
  }

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute } satisfies Command;
