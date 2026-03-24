import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../database/prisma";
import { Command } from "../client";

export const data = new SlashCommandBuilder()
  .setName("lapada-info")
  .setDescription("Veja as configurações atuais do bot neste servidor");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });

  const participantRoles = config?.participantRoleIds?.length
    ? config.participantRoleIds.map((id) => `<@&${id}>`).join(", ")
    : "todos os membros";

  const lines = [
    `**Canal de relatórios:** ${config?.reportChannelId ? `<#${config.reportChannelId}>` : "não configurado"}`,
    `**Cargo semanal:** ${config?.weeklyRoleId ? `<@&${config.weeklyRoleId}>` : "não configurado"}`,
    `**Cargo mensal:** ${config?.monthlyRoleId ? `<@&${config.monthlyRoleId}>` : "não configurado"}`,
    `**Top N semanal:** ${config?.weeklyTopN ?? 5} usuários · dura **${config?.weeklyRoleDurationDays ?? 7} dias**`,
    `**Top N mensal:** ${config?.monthlyTopN ?? 5} usuários · dura **${config?.monthlyRoleDurationDays ?? 30} dias**`,
    `**Inatividade:** ${config?.inactiveThresholdDays ?? 14} dias`,
    `**Participam das métricas:** ${participantRoles}`,
    `**Ranking diário às:** ${config?.dailyReportHour ?? 23}:00`,
  ];

  await interaction.editReply(lines.join("\n"));
}

export default { data, execute } satisfies Command;
