import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  GuildMember,
} from "discord.js";
import { getUserStats, getPeriodLabel, searchActiveUsers } from "../services/metricsService";
import { buildStatsEmbed } from "../utils/embeds";
import { Command } from "../client";

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
      .setDescription("Período de análise")
      .addChoices(
        { name: "Semana atual", value: "weekly" },
        { name: "Mês atual", value: "monthly" }
      )
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const query = interaction.options.getFocused();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  // Se não digitou nada ainda, sugere os top 10 do leaderboard semanal como atalho
  const results = await searchActiveUsers(guildId, query, 25);

  await interaction.respond(
    results.map((u) => ({ name: u.label, value: u.id }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  // Resolve o usuário: string do autocomplete (ID) ou fallback para quem chamou
  const userInput = interaction.options.getString("usuario");
  const targetId = userInput ?? interaction.user.id;

  // Tenta buscar o membro no cache; se não estiver, busca na API do Discord
  let member = interaction.guild?.members.cache.get(targetId) as GuildMember | undefined;
  if (!member && interaction.guild) {
    member = await interaction.guild.members.fetch(targetId).catch(() => undefined);
  }
  const fallbackName = member?.displayName ?? targetId;

  const period = (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";

  const stats = await getUserStats(targetId, interaction.guildId, period);

  if (!stats) {
    await interaction.editReply(
      `Nenhuma atividade registrada para **${fallbackName}** neste período.`
    );
    return;
  }

  const periodLabel = getPeriodLabel(new Date(), period);
  const avatarUrl = member?.user.displayAvatarURL() ?? undefined;

  const embed = buildStatsEmbed({
    username: stats.displayName ?? stats.username,
    avatarUrl,
    period,
    messageCount: stats.messageCount,
    voiceMinutes: stats.voiceMinutes,
    reactionsCount: stats.reactionsCount,
    score: stats.score,
    rank: stats.rank,
  });

  embed.setFooter({ text: `Período: ${periodLabel} · Discord Activity Bot` });

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute, autocomplete } satisfies Command;
