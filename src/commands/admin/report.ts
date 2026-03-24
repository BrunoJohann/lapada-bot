import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { aggregateDaily } from "../../services/metricsService";
import { runReport } from "../../services/reportService";
import { Command } from "../../client";
import { logger } from "../../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("lapada-report")
  .setDescription("Acione um relatório manualmente")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("semanal").setDescription("Gera o relatório semanal agora")
  )
  .addSubcommand((sub) =>
    sub.setName("mensal").setDescription("Gera o relatório mensal agora")
  )
  .addSubcommand((sub) =>
    sub
      .setName("agregar")
      .setDescription("Força a agregação diária de métricas para hoje")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "semanal") {
      await aggregateDaily(interaction.guild.id, new Date());
      await runReport(interaction.guild, "weekly");
      await interaction.editReply("✅ Relatório semanal gerado e enviado.");
    } else if (sub === "mensal") {
      await aggregateDaily(interaction.guild.id, new Date());
      await runReport(interaction.guild, "monthly");
      await interaction.editReply("✅ Relatório mensal gerado e enviado.");
    } else if (sub === "agregar") {
      await aggregateDaily(interaction.guild.id, new Date());
      await interaction.editReply("✅ Agregação diária concluída.");
    }
  } catch (error) {
    logger.error("Erro ao executar /report:", error);
    await interaction.editReply("❌ Erro ao gerar o relatório. Verifique os logs.");
  }
}

export default { data, execute } satisfies Command;
