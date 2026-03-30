import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { prisma } from "../../database/prisma";
import { invalidateGuildConfig } from "../../utils/guildConfig";
import { aggregateDaily, resolveHistoricalRange } from "../../services/metricsService";
import { processRewards } from "../../services/rewardsService";
import { Command } from "../../client";

const CURRENT_YEAR = new Date().getFullYear();

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
      .setName("voz")
      .setDescription("Define o multiplicador de pontos por minuto em canal de voz")
      .addNumberOption((opt) =>
        opt
          .setName("multiplicador")
          .setDescription("Pontos por minuto de voz (padrão: 2.0)")
          .setMinValue(0.1)
          .setMaxValue(10.0)
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
  .addSubcommand((sub) =>
    sub
      .setName("mensagem")
      .setDescription("Envia uma mensagem pública no canal como se fosse uma confirmação do bot")
      .addStringOption((opt) =>
        opt
          .setName("texto")
          .setDescription("Texto da mensagem")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("atribuir-cargos")
      .setDescription("Força a atribuição de cargos de recompensa, com opção de período histórico")
      .addStringOption((opt) =>
        opt
          .setName("periodo")
          .setDescription("Qual período processar")
          .setRequired(true)
          .addChoices(
            { name: "Semanal", value: "weekly" },
            { name: "Mensal",  value: "monthly" },
            { name: "Ambos",   value: "both" },
          )
      )
      .addIntegerOption((opt) =>
        opt.setName("mes").setDescription("Mês histórico (1–12)").setMinValue(1).setMaxValue(12)
      )
      .addIntegerOption((opt) =>
        opt.setName("ano").setDescription(`Ano histórico (padrão: ${CURRENT_YEAR})`).setMinValue(2024).setMaxValue(2030)
      )
      .addIntegerOption((opt) =>
        opt.setName("semana").setDescription("Semana do mês (1–5) — requer 'mes'").setMinValue(1).setMaxValue(5)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("adicionar-pontos")
      .setDescription("Adiciona pontos manualmente a um usuário (em um período específico ou hoje)")
      .addUserOption((opt) =>
        opt.setName("usuario").setDescription("Usuário que receberá os pontos").setRequired(true)
      )
      .addNumberOption((opt) =>
        opt.setName("pontos").setDescription("Quantidade de pontos a adicionar (ex: 50)").setMinValue(0.1).setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("motivo").setDescription("Motivo do ajuste (opcional)").setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt.setName("mes").setDescription("Mês do ajuste (1–12, padrão: mês atual)").setMinValue(1).setMaxValue(12)
      )
      .addIntegerOption((opt) =>
        opt.setName("ano").setDescription(`Ano do ajuste (padrão: ${CURRENT_YEAR})`).setMinValue(2024).setMaxValue(2030)
      )
      .addIntegerOption((opt) =>
        opt.setName("semana").setDescription("Semana do mês (1–5) — aplica no 1º dia da semana").setMinValue(1).setMaxValue(5)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remover-pontos")
      .setDescription("Remove pontos manualmente de um usuário (em um período específico ou hoje)")
      .addUserOption((opt) =>
        opt.setName("usuario").setDescription("Usuário que perderá os pontos").setRequired(true)
      )
      .addNumberOption((opt) =>
        opt.setName("pontos").setDescription("Quantidade de pontos a remover (ex: 50)").setMinValue(0.1).setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("motivo").setDescription("Motivo do ajuste (opcional)").setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt.setName("mes").setDescription("Mês do ajuste (1–12, padrão: mês atual)").setMinValue(1).setMaxValue(12)
      )
      .addIntegerOption((opt) =>
        opt.setName("ano").setDescription(`Ano do ajuste (padrão: ${CURRENT_YEAR})`).setMinValue(2024).setMaxValue(2030)
      )
      .addIntegerOption((opt) =>
        opt.setName("semana").setDescription("Semana do mês (1–5) — aplica no 1º dia da semana").setMinValue(1).setMaxValue(5)
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
  } else if (sub === "voz") {
    const mult = interaction.options.getNumber("multiplicador", true);
    updateData = { voiceMultiplier: mult };
    confirmMsg = `Multiplicador de voz definido para **${mult}x** pts/min`;
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
  } else if (sub === "mensagem") {
    const texto = interaction.options.getString("texto", true);
    await interaction.editReply({ content: "✅ Mensagem enviada." });
    await (interaction.channel as TextChannel)?.send(`✅ ${texto}`);
    return;
  } else if (sub === "atribuir-cargos") {
    const periodo = interaction.options.getString("periodo", true) as "weekly" | "monthly" | "both";
    const mes     = interaction.options.getInteger("mes");
    const ano     = interaction.options.getInteger("ano");
    const semana  = interaction.options.getInteger("semana");
    const guild   = interaction.guild!;

    const historical = resolveHistoricalRange(semana, mes, ano);

    await interaction.editReply(
      historical
        ? `⏳ Processando cargos com dados de **${historical.label}**...`
        : "⏳ Agregando dados frescos e processando cargos..."
    );

    // Só agrega se for período corrente (histórico já está no banco)
    if (!historical) {
      await aggregateDaily(guildId, new Date());
    }

    const periods: Array<"weekly" | "monthly"> = periodo === "both" ? ["weekly", "monthly"] : [periodo];
    const lines: string[] = [];

    for (const p of periods) {
      const result = await processRewards(guild, p, historical ?? undefined);
      const label  = p === "weekly" ? "Semanal" : "Mensal";

      if (result.roleName === "N/A") {
        lines.push(`⚠️ **${label}**: cargo não configurado. Use \`/lapada-config cargo-${p === "weekly" ? "semanal" : "mensal"}\` primeiro.`);
        continue;
      }

      const assignedList = result.assigned.length > 0 ? result.assigned.join(", ") : "nenhum";
      const removedList  = result.removed.length  > 0 ? result.removed.join(", ")  : "nenhum";
      const failedLines  = result.failed.map((f) => `⚠️ ${f.username}: ${f.reason}`).join("\n");

      lines.push(
        `${result.failed.length > 0 ? "⚠️" : "✅"} **${label}** — cargo: \`${result.roleName}\`` +
        (historical ? ` · período: ${historical.label}` : "") + `\n` +
        `> 🏆 Atribuídos: ${assignedList}\n` +
        `> ❌ Removidos: ${removedList}` +
        (failedLines ? `\n> 🚫 Falhas:\n${failedLines.split("\n").map((l) => `> ${l}`).join("\n")}` : "")
      );
    }

    await interaction.editReply(lines.join("\n\n"));
    return;
  } else if (sub === "adicionar-pontos" || sub === "remover-pontos") {
    const targetUser = interaction.options.getUser("usuario", true);
    const pontos     = interaction.options.getNumber("pontos", true);
    const motivo     = interaction.options.getString("motivo") ?? "Ajuste manual por admin";
    const mes        = interaction.options.getInteger("mes");
    const ano        = interaction.options.getInteger("ano");
    const semana     = interaction.options.getInteger("semana");
    const delta      = sub === "adicionar-pontos" ? pontos : -pontos;

    // Determina a data alvo: primeiro dia do período selecionado ou hoje
    let targetDate: Date;
    let periodoLabel: string;

    const historical = resolveHistoricalRange(semana, mes, ano);
    if (historical) {
      targetDate   = historical.start; // primeiro dia do período
      periodoLabel = historical.label;
    } else {
      targetDate = new Date();
      targetDate.setUTCHours(0, 0, 0, 0);
      periodoLabel = "hoje";
    }

    // Garante que o usuário existe no banco
    await prisma.user.upsert({
      where: { id: targetUser.id },
      update: { username: targetUser.username },
      create: { id: targetUser.id, guildId, username: targetUser.username, displayName: targetUser.displayName },
    });

    // Busca o registro do dia alvo (ou cria zerado) e incrementa manualPoints
    const existing = await prisma.dailyAggregate.findUnique({
      where: { userId_guildId_date: { userId: targetUser.id, guildId, date: targetDate } },
    });

    const newManual = (existing?.manualPoints ?? 0) + delta;
    const newScore  = (existing?.score ?? 0) + delta;

    await prisma.dailyAggregate.upsert({
      where: { userId_guildId_date: { userId: targetUser.id, guildId, date: targetDate } },
      update: { manualPoints: newManual, score: newScore },
      create: {
        userId: targetUser.id, guildId, date: targetDate,
        messageCount: 0, voiceMinutes: 0, streamMinutes: 0, reactionsCount: 0,
        score: delta, manualPoints: delta,
      },
    });

    const sinal = delta > 0 ? "+" : "";
    const emoji = delta > 0 ? "➕" : "➖";
    await interaction.editReply(
      `${emoji} **${sinal}${pontos} pontos** para <@${targetUser.id}>\n` +
      `> Período: ${periodoLabel}\n` +
      `> Motivo: ${motivo}\n` +
      `> Total manual no período: **${newManual >= 0 ? "+" : ""}${newManual.toFixed(1)} pts**`
    );
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
