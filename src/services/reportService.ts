import { Guild, TextChannel } from "discord.js";
import { prisma } from "../database/prisma";
import { processRewards } from "./rewardsService";
import { getPeriodLabel } from "./metricsService";
import { buildReportEmbed } from "../utils/embeds";
import { logger } from "../utils/logger";

export async function runReport(
  guild:  Guild,
  period: "weekly" | "monthly",
  range?: { start: Date; end: Date }   // range do período que deve ser analisado
): Promise<void> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  if (!config?.reportChannelId) {
    logger.warn(`Guild ${guild.id}: canal de relatório não configurado.`);
    return;
  }

  const channel = guild.channels.cache.get(config.reportChannelId) as TextChannel | undefined;
  if (!channel) {
    logger.warn(`Guild ${guild.id}: canal ${config.reportChannelId} não encontrado.`);
    return;
  }

  // Usa o range do período anterior se fornecido; senão usa o período corrente
  const result      = await processRewards(guild, period, range);
  const periodLabel = range
    ? getPeriodLabel(range.start, period)   // label baseado no início do período anterior
    : getPeriodLabel(new Date(), period);

  // Resolve apelidos atuais do servidor
  const resolvedTopUsers = result.topUsers.map((u) => ({
    ...u,
    username: guild.members.cache.get(u.userId ?? "")?.displayName ?? u.username,
  }));

  const embed = buildReportEmbed({
    period,
    periodLabel,
    topUsers:      resolvedTopUsers,
    assignedRoles: result.assigned,
    removedRoles:  result.removed,
    roleName:      result.roleName,
  });

  await channel.send({ embeds: [embed] });

  logger.info(`Relatório ${period} enviado para guild ${guild.id} (período: ${periodLabel})`);
}
