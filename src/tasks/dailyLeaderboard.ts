import cron from "node-cron";
import { Client, TextChannel } from "discord.js";
import { aggregateDaily, getLeaderboard, getPeriodLabel } from "../services/metricsService";
import { buildLeaderboardEmbed } from "../utils/embeds";
import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

// Roda todo hora e verifica quais guilds devem receber o ranking agora
const HOURLY_CHECK_CRON = "0 * * * *";

export function scheduleDailyLeaderboard(client: Client): void {
  cron.schedule(
    HOURLY_CHECK_CRON,
    async () => {
      const timezone = process.env.TIMEZONE ?? "America/Sao_Paulo";
      const currentHour = new Date().toLocaleString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      });
      const hour = parseInt(currentHour, 10);

      for (const [, guild] of client.guilds.cache) {
        try {
          const config = await prisma.guildConfig.findUnique({
            where: { guildId: guild.id },
          });

          // Só envia se a hora atual bate com o horário configurado (padrão: 23)
          const scheduledHour = config?.dailyReportHour ?? 23;
          if (hour !== scheduledHour) continue;

          if (!config?.reportChannelId) {
            logger.warn(`Guild ${guild.id}: canal de relatório não configurado, pulando ranking diário.`);
            continue;
          }

          const channel = guild.channels.cache.get(config.reportChannelId) as TextChannel | undefined;
          if (!channel) {
            logger.warn(`Guild ${guild.id}: canal ${config.reportChannelId} não encontrado.`);
            continue;
          }

          const today = new Date();
          await aggregateDaily(guild.id, today);

          const entries = await getLeaderboard(guild.id, "weekly", config.weeklyTopN ?? 10);

          const resolvedEntries = entries.map((e) => ({
            ...e,
            username:
              guild.members.cache.get(e.userId)?.displayName ??
              e.displayName ??
              e.username,
          }));

          const periodLabel = getPeriodLabel(today, "weekly");

          const embed = buildLeaderboardEmbed({
            period: "weekly",
            periodLabel,
            entries: resolvedEntries,
          });

          embed.setTitle("📅 Ranking do Dia — Semana Atual");
          embed.setFooter({ text: `Ranking automático das ${scheduledHour}:00 · Discord Activity Bot` });

          await channel.send({ embeds: [embed] });

          logger.info(`Ranking diário enviado para guild ${guild.id} (${scheduledHour}:00)`);
        } catch (error) {
          logger.error(`Erro no ranking diário da guild ${guild.id}:`, error);
        }
      }
    },
    { timezone: "UTC" } // cron roda em UTC, a comparação de hora é feita no fuso correto
  );

  logger.info("Ranking diário agendado (verificação horária)");
}
