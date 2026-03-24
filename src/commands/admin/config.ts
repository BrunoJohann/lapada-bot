import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "../../database/prisma";
import { invalidateGuildConfig } from "../../utils/guildConfig";
import { Command } from "../../client";

export const data = new SlashCommandBuilder()
  .setName("lapada-config")
  .setDescription("Configurações do bot de atividade")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("cargo-semanal")
      .setDescription("Define o cargo para o top semanal")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a ser atribuído").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-mensal")
      .setDescription("Define o cargo para o top mensal")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a ser atribuído").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("canal")
      .setDescription("Define o canal para envio dos relatórios automáticos")
      .addChannelOption((opt) =>
        opt.setName("canal").setDescription("Canal de texto para relatórios").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("top-n")
      .setDescription("Define quantos usuários recebem o cargo de recompensa")
      .addIntegerOption((opt) =>
        opt
          .setName("quantidade")
          .setDescription("Número de usuários (1–20)")
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("inatividade")
      .setDescription("Define dias sem atividade para remover o cargo")
      .addIntegerOption((opt) =>
        opt
          .setName("dias")
          .setDescription("Dias sem atividade (1–90)")
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-participante-adicionar")
      .setDescription("Adiciona um cargo à lista de participantes das métricas")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo que vai participar das métricas").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cargo-participante-remover")
      .setDescription("Remove um cargo da lista de participantes das métricas")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a remover da lista").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("duracao-cargo")
      .setDescription("Define por quantos dias o cargo é mantido após ser atribuído")
      .addIntegerOption((opt) =>
        opt
          .setName("dias")
          .setDescription("Dias que o cargo fica (1–90). Padrão: 7")
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("ver").setDescription("Veja as configurações atuais do bot")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === "ver") {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    const participantRoles = config?.participantRoleIds?.length
      ? config.participantRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "todos os membros";

    const lines = [
      `**Canal de relatórios:** ${config?.reportChannelId ? `<#${config.reportChannelId}>` : "não configurado"}`,
      `**Cargo semanal:** ${config?.weeklyRoleId ? `<@&${config.weeklyRoleId}>` : "não configurado"}`,
      `**Cargo mensal:** ${config?.monthlyRoleId ? `<@&${config.monthlyRoleId}>` : "não configurado"}`,
      `**Top N:** ${config?.topN ?? 5} usuários`,
      `**Duração do cargo:** ${config?.roleDurationDays ?? 7} dias`,
      `**Inatividade:** ${config?.inactiveThresholdDays ?? 14} dias`,
      `**Participam das métricas:** ${participantRoles}`,
    ];
    await interaction.editReply(lines.join("\n"));
    return;
  }

  let updateData: Record<string, unknown> = {};
  let confirmMsg = "";

  if (sub === "cargo-semanal") {
    const role = interaction.options.getRole("cargo", true);
    updateData = { weeklyRoleId: role.id };
    confirmMsg = `Cargo semanal definido para <@&${role.id}>`;
  } else if (sub === "cargo-mensal") {
    const role = interaction.options.getRole("cargo", true);
    updateData = { monthlyRoleId: role.id };
    confirmMsg = `Cargo mensal definido para <@&${role.id}>`;
  } else if (sub === "canal") {
    const channel = interaction.options.getChannel("canal", true);
    updateData = { reportChannelId: channel.id };
    confirmMsg = `Canal de relatórios definido para <#${channel.id}>`;
  } else if (sub === "top-n") {
    const topN = interaction.options.getInteger("quantidade", true);
    updateData = { topN };
    confirmMsg = `Top N definido para **${topN}** usuários`;
  } else if (sub === "inatividade") {
    const dias = interaction.options.getInteger("dias", true);
    updateData = { inactiveThresholdDays: dias };
    confirmMsg = `Inatividade definida para **${dias}** dias`;
  } else if (sub === "duracao-cargo") {
    const dias = interaction.options.getInteger("dias", true);
    updateData = { roleDurationDays: dias };
    confirmMsg = `Duração do cargo definida para **${dias}** dias`;
  } else if (sub === "cargo-participante-adicionar") {
    const role = interaction.options.getRole("cargo", true);
    // Adiciona à array sem duplicatas
    const current = await prisma.guildConfig.findUnique({ where: { guildId } });
    const ids = current?.participantRoleIds ?? [];
    if (ids.includes(role.id)) {
      await interaction.editReply(`⚠️ <@&${role.id}> já está na lista de participantes.`);
      return;
    }
    await prisma.guildConfig.upsert({
      where: { guildId },
      update: { participantRoleIds: { push: role.id } },
      create: { guildId, participantRoleIds: [role.id] },
    });
    await invalidateGuildConfig(guildId);
    await interaction.editReply(`✅ <@&${role.id}> adicionado às métricas.\n> Agora apenas membros com este cargo (e outros na lista) terão atividade rastreada.`);
    return;
  } else if (sub === "cargo-participante-remover") {
    const role = interaction.options.getRole("cargo", true);
    const current = await prisma.guildConfig.findUnique({ where: { guildId } });
    const newIds = (current?.participantRoleIds ?? []).filter((id) => id !== role.id);
    await prisma.guildConfig.upsert({
      where: { guildId },
      update: { participantRoleIds: newIds },
      create: { guildId },
    });
    await invalidateGuildConfig(guildId);
    const msg = newIds.length === 0
      ? `✅ <@&${role.id}> removido. Lista vazia — **todos os membros** voltam a participar.`
      : `✅ <@&${role.id}> removido da lista de participantes.`;
    await interaction.editReply(msg);
    return;
  }

  await prisma.guildConfig.upsert({
    where: { guildId },
    update: updateData,
    create: { guildId, ...updateData },
  });

  await invalidateGuildConfig(guildId);
  await interaction.editReply(`✅ ${confirmMsg}`);
}

export default { data, execute } satisfies Command;
