import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { getLeaderboard, getPeriodLabel } from "../services/metricsService";
import { buildLeaderboardEmbed } from "../utils/embeds";
import { getCached } from "../utils/redis";
import { Command } from "../client";

export const data = new SlashCommandBuilder()
  .setName("lapada-leaderboard")
  .setDescription("Veja o ranking de atividade do servidor")
  .addStringOption((opt) =>
    opt
      .setName("periodo")
      .setDescription("Período de análise")
      .addChoices(
        { name: "Semana atual", value: "weekly" },
        { name: "Mês atual", value: "monthly" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const period = (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";
  const guildId = interaction.guildId;

  const cacheKey = `leaderboard:${guildId}:${period}`;
  const entries = await getCached(cacheKey, 60, () => getLeaderboard(guildId, period, 10));

  // Resolve apelidos atuais do servidor (usa cache do Discord em memória)
  const resolvedEntries = entries.map((e) => ({
    ...e,
    username:
      interaction.guild?.members.cache.get(e.userId)?.displayName ??
      e.displayName ??
      e.username,
  }));

  const periodLabel = getPeriodLabel(new Date(), period);
  const embed = buildLeaderboardEmbed({ period, entries: resolvedEntries, periodLabel });

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute } satisfies Command;
