import {
  ChatInputCommandInteraction,
  TextChannel,
} from "discord.js";
import { prisma } from "../../database/prisma";
import { invalidateGuildConfig } from "../../utils/guildConfig";
import { resolveHistoricalRange } from "../../utils/dateUtils";
import { aggregateDaily } from "../../services/metricsService";
import { processRewards, processChallengeRewards } from "../../services/rewardsService";
import { logger } from "../../utils/logger";

const CURRENT_YEAR = new Date().getFullYear();

export async function executeConfigCommand(interaction: ChatInputCommandInteraction): Promise<void> {
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
  } else if (sub === "cargo-desafio") {
    const role = interaction.options.getRole("cargo", true);
    updateData = { challengeRoleId: role.id };
    confirmMsg = `Cargo de desafio definido para <@&${role.id}>`;
  } else if (sub === "pontos-minimos") {
    const pontos = interaction.options.getNumber("pontos", true);
    if (pontos === 0) {
      updateData = { challengeMinPoints: null };
      confirmMsg = "Cargo de desafio **desabilitado**";
    } else {
      updateData = { challengeMinPoints: pontos };
      confirmMsg = `Mínimo de pontos semanais definido para **${pontos} pts**`;
    }
  } else if (sub === "duracao-cargo-desafio") {
    const dias = interaction.options.getInteger("dias", true);
    updateData = { challengeRoleDurationDays: dias };
    confirmMsg = `Duração do cargo de desafio definida para **${dias}** dias`;
  } else if (sub === "atribuir-cargos") {
    const periodo = interaction.options.getString("periodo", true) as "weekly" | "monthly" | "both" | "challenge" | "all";
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

    if (!historical) {
      await aggregateDaily(guildId, new Date());
    }

    const standardPeriods: Array<"weekly" | "monthly"> =
      periodo === "all" || periodo === "both" ? ["weekly", "monthly"]
      : (periodo === "weekly" || periodo === "monthly") ? [periodo]
      : [];
    const runChallenge = periodo === "challenge" || periodo === "all";

    const lines: string[] = [];

    for (const p of standardPeriods) {
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

    if (runChallenge) {
      const cr = await processChallengeRewards(guild, historical ?? undefined);
      if (cr.roleName === "N/A") {
        lines.push(`⚠️ **Desafio**: cargo ou mínimo de pontos não configurado.\n> Use \`/lapada-config cargo-desafio\` e \`/lapada-config pontos-minimos\` primeiro.`);
      } else {
        const assignedList = cr.assigned.length > 0 ? cr.assigned.join(", ") : "nenhum";
        const removedList  = cr.removed.length  > 0 ? cr.removed.join(", ")  : "nenhum";
        const failedLines  = cr.failed.map((f) => `⚠️ ${f.username}: ${f.reason}`).join("\n");
        lines.push(
          `${cr.failed.length > 0 ? "⚠️" : "✅"} **Desafio** — cargo: \`${cr.roleName}\` · mín: **${cr.minPoints} pts**` +
          (historical ? ` · período: ${historical.label}` : "") + `\n` +
          `> 🏅 Qualificados: ${cr.qualifiedCount} usuário(s)\n` +
          `> ✅ Atribuídos: ${assignedList}\n` +
          `> ❌ Removidos: ${removedList}` +
          (failedLines ? `\n> 🚫 Falhas:\n${failedLines.split("\n").map((l) => `> ${l}`).join("\n")}` : "")
        );
      }
    }

    await interaction.editReply(lines.join("\n\n") || "✅ Nenhuma ação necessária.");
    return;
  } else if (sub === "adicionar-pontos" || sub === "remover-pontos") {
    const targetUser = interaction.options.getUser("usuario", true);
    const pontosRaw  = interaction.options.getString("pontos", true).trim().replace(",", ".");
    const pontos     = parseFloat(pontosRaw);
    if (isNaN(pontos) || pontos <= 0) {
      await interaction.editReply("❌ Valor inválido. Use um número positivo (ex: `50`, `509.5` ou `12,5`).");
      return;
    }
    const motivo     = interaction.options.getString("motivo") ?? "Ajuste manual por admin";
    const mes        = interaction.options.getInteger("mes");
    const ano        = interaction.options.getInteger("ano");
    const semana     = interaction.options.getInteger("semana");
    const delta      = sub === "adicionar-pontos" ? pontos : -pontos;

    let targetDate: Date;
    let periodoLabel: string;

    const historical = resolveHistoricalRange(semana, mes, ano);
    if (historical) {
      targetDate   = historical.start;
      periodoLabel = historical.label;
    } else {
      targetDate = new Date();
      targetDate.setUTCHours(0, 0, 0, 0);
      periodoLabel = "hoje";
    }

    await prisma.user.upsert({
      where: { id: targetUser.id },
      update: { username: targetUser.username },
      create: { id: targetUser.id, guildId, username: targetUser.username, displayName: targetUser.displayName },
    });

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
  } else if (sub === "fechar-sessao") {
    const targetUser = interaction.options.getUser("usuario", true);
    const minutosCreditar = interaction.options.getInteger("minutos") ?? 0;

    const openSessions = await prisma.voiceSession.findMany({
      where: { userId: targetUser.id, guildId, leftAt: null },
      orderBy: { joinedAt: "asc" },
    });

    if (openSessions.length === 0) {
      await interaction.editReply(`ℹ️ <@${targetUser.id}> não tem nenhuma sessão de voz aberta.`);
      return;
    }

    const now = new Date();
    const creditMs = minutosCreditar * 60_000;

    for (const session of openSessions) {
      const accumulatedMs = now.getTime() - session.joinedAt.getTime();
      const accumulatedMin = Math.floor(accumulatedMs / 60_000);
      await prisma.voiceSession.update({
        where: { id: session.id },
        data: { leftAt: now, durationMs: creditMs },
      });
      logger.info(
        `[fechar-sessao] Sessão ${session.id} de ${targetUser.username} fechada por admin ` +
        `(acumulado: ${accumulatedMin}min → creditado: ${minutosCreditar}min)`
      );
    }

    const totalAccumulatedMs = openSessions.reduce((sum, s) => sum + (now.getTime() - s.joinedAt.getTime()), 0);
    const totalAccumulatedMin = Math.floor(totalAccumulatedMs / 60_000);
    const hAcum = Math.floor(totalAccumulatedMin / 60);
    const mAcum = totalAccumulatedMin % 60;
    const acumLabel = hAcum > 0 ? `${hAcum}h ${mAcum}min` : `${mAcum}min`;

    await interaction.editReply(
      `🔒 **Sessão(ões) de voz fechada(s)** para <@${targetUser.id}>\n` +
      `> Sessões fechadas: **${openSessions.length}**\n` +
      `> Tempo acumulado (descartado): **${acumLabel}**\n` +
      `> Tempo creditado: **${minutosCreditar}min**\n` +
      (minutosCreditar === 0
        ? `> ⚠️ A sessão bugada foi fechada sem pontuar.`
        : `> ✅ Foram creditados ${minutosCreditar} minuto(s) de voz.`)
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

// suppress unused import warning for CURRENT_YEAR used in config.ts only
void CURRENT_YEAR;
