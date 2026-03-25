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
      .setName("top-n-semanal")
      .setDescription("Define quantos usuários recebem o cargo semanal")
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
      .setName("top-n-mensal")
      .setDescription("Define quantos usuários recebem o cargo mensal")
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
      .setName("duracao-cargo-semanal")
      .setDescription("Define por quantos dias o cargo semanal é mantido após ser atribuído")
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
    sub
      .setName("duracao-cargo-mensal")
      .setDescription("Define por quantos dias o cargo mensal é mantido após ser atribuído")
      .addIntegerOption((opt) =>
        opt
          .setName("dias")
          .setDescription("Dias que o cargo fica (1–90). Padrão: 30")
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("horario-report")
      .setDescription("Define os horários do ranking diário (suporta múltiplos)")
      .addStringOption((opt) =>
        opt
          .setName("horas")
          .setDescription("Hora(s) de 0–23 separadas por vírgula. Ex: 9 ou 9,21")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("horario-semanal")
      .setDescription("Define o dia e hora do relatório semanal automático")
      .addIntegerOption((opt) =>
        opt
          .setName("dia")
          .setDescription("Dia da semana")
          .setRequired(true)
          .addChoices(
            { name: "Domingo",       value: 0 },
            { name: "Segunda-feira", value: 1 },
            { name: "Terça-feira",   value: 2 },
            { name: "Quarta-feira",  value: 3 },
            { name: "Quinta-feira",  value: 4 },
            { name: "Sexta-feira",   value: 5 },
            { name: "Sábado",        value: 6 },
          )
      )
      .addIntegerOption((opt) =>
        opt
          .setName("hora")
          .setDescription("Hora do dia (0–23)")
          .setMinValue(0)
          .setMaxValue(23)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("horario-mensal")
      .setDescription("Define o dia e hora do relatório mensal automático")
      .addIntegerOption((opt) =>
        opt
          .setName("dia")
          .setDescription("Dia do mês (1–28)")
          .setMinValue(1)
          .setMaxValue(28)
          .setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("hora")
          .setDescription("Hora do dia (0–23)")
          .setMinValue(0)
          .setMaxValue(23)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("streamer")
      .setDescription("Configura o rastreamento de streams (tela compartilhada)")
      .addBooleanOption((opt) =>
        opt
          .setName("habilitado")
          .setDescription("Habilitar ou desabilitar rastreamento de streams")
          .setRequired(true)
      )
      .addNumberOption((opt) =>
        opt
          .setName("multiplicador")
          .setDescription("Pontos por minuto de stream (padrão: 1.5). Deve ser menor que voz (2.0)")
          .setMinValue(0.1)
          .setMaxValue(5.0)
          .setRequired(false)
      )
  )
;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

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
  } else if (sub === "top-n-semanal") {
    const topN = interaction.options.getInteger("quantidade", true);
    updateData = { weeklyTopN: topN };
    confirmMsg = `Top N semanal definido para **${topN}** usuários`;
  } else if (sub === "top-n-mensal") {
    const topN = interaction.options.getInteger("quantidade", true);
    updateData = { monthlyTopN: topN };
    confirmMsg = `Top N mensal definido para **${topN}** usuários`;
  } else if (sub === "inatividade") {
    const dias = interaction.options.getInteger("dias", true);
    updateData = { inactiveThresholdDays: dias };
    confirmMsg = `Inatividade definida para **${dias}** dias`;
  } else if (sub === "duracao-cargo-semanal") {
    const dias = interaction.options.getInteger("dias", true);
    updateData = { weeklyRoleDurationDays: dias };
    confirmMsg = `Duração do cargo semanal definida para **${dias}** dias`;
  } else if (sub === "duracao-cargo-mensal") {
    const dias = interaction.options.getInteger("dias", true);
    updateData = { monthlyRoleDurationDays: dias };
    confirmMsg = `Duração do cargo mensal definida para **${dias}** dias`;
  } else if (sub === "horario-report") {
    const horasStr = interaction.options.getString("horas", true);
    const horas = horasStr.split(",").map((h) => parseInt(h.trim(), 10)).filter((h) => !isNaN(h) && h >= 0 && h <= 23);
    if (horas.length === 0) {
      await interaction.editReply("❌ Formato inválido. Use números de 0–23 separados por vírgula. Ex: `9` ou `9,21`");
      return;
    }
    updateData = { dailyReportHours: horas };
    confirmMsg = `Ranking diário agendado para **${horas.map((h) => `${h}:00`).join(", ")}**`;
  } else if (sub === "horario-semanal") {
    const dia = interaction.options.getInteger("dia", true);
    const hora = interaction.options.getInteger("hora", true);
    const dias = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
    updateData = { weeklyReportDay: dia, weeklyReportHour: hora };
    confirmMsg = `Relatório semanal agendado para **${dias[dia]}** às **${hora}:00**`;
  } else if (sub === "horario-mensal") {
    const dia = interaction.options.getInteger("dia", true);
    const hora = interaction.options.getInteger("hora", true);
    updateData = { monthlyReportDay: dia, monthlyReportHour: hora };
    confirmMsg = `Relatório mensal agendado para todo **dia ${dia}** às **${hora}:00**`;
  } else if (sub === "streamer") {
    const habilitado = interaction.options.getBoolean("habilitado", true);
    const multiplicador = interaction.options.getNumber("multiplicador");
    updateData = { streamEnabled: habilitado, ...(multiplicador !== null && { streamMultiplier: multiplicador }) };
    const multMsg = multiplicador !== null ? ` · multiplicador: **${multiplicador}x**` : "";
    confirmMsg = `Rastreamento de stream **${habilitado ? "habilitado ✅" : "desabilitado ❌"}**${multMsg}`;
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
