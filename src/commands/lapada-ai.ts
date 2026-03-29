import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { processAiQuery, isAiAvailable } from "../services/aiService";
import { Command } from "../client";

export const data = new SlashCommandBuilder()
  .setName("lapada-ai")
  .setDescription("Consulte informações do servidor usando linguagem natural")
  .addStringOption((opt) =>
    opt
      .setName("pergunta")
      .setDescription("O que você quer saber? Ex: quem está no top essa semana?")
      .setRequired(true)
      .setMaxLength(500)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  if (!isAiAvailable()) {
    await interaction.reply({ content: "O comando `/lapada-ai` não está disponível neste servidor (chave de IA não configurada).", ephemeral: true });
    return;
  }

  const question = interaction.options.getString("pergunta", true);

  await interaction.deferReply();

  const response = await processAiQuery(question, interaction.guildId, interaction.guild);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: "Lapada AI", iconURL: interaction.client.user.displayAvatarURL() })
    .setDescription(response)
    .setFooter({ text: `Perguntado por ${interaction.user.displayName} · powered by Groq` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute } satisfies Command;
