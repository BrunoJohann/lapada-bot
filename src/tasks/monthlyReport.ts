import cron from "node-cron";
import { Client } from "discord.js";
import { runReport } from "../services/reportService";
import { aggregateDaily, getPeriodStart, toLocalNow } from "../services/metricsService";
import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

// Todo dia às 00:05 — agrega o dia anterior
const DAILY_AGGREGATE_CRON = "5 0 * * *";

// Todo hora — agrega o dia atual para manter leaderboard atualizado
const HOURLY_AGGREGATE_CRON = "0 * * * *";

// Roda todo hora e verifica quais guilds devem receber o relatório mensal agora
export function scheduleMonthlyReport(client: Client): void {
  cron.schedule(
    "0 * * * *",
    async () => {
      for (const [, guild] of client.guilds.cache) {
        try {
          const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
          const timezone = config?.timezone ?? process.env.TIMEZONE ?? "America/Sao_Paulo";

          const now = new Date();
          const hour       = parseInt(now.toLocaleString("en-US", { timeZone: timezone, hour: "numeric", hour12: false }), 10);
          const dayOfMonth = parseInt(now.toLocaleString("en-US", { timeZone: timezone, day: "numeric" }), 10);

          const scheduledDay  = config?.monthlyReportDay  ?? 1;
          const scheduledHour = config?.monthlyReportHour ?? 8;

          if (dayOfMonth !== scheduledDay || hour !== scheduledHour) continue;

          logger.info(`Iniciando relatório mensal para guild ${guild.id} (dia ${scheduledDay} às ${scheduledHour}:00)`);

          // Agrega o último dia do mês anterior antes de gerar o relatório
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          await aggregateDaily(guild.id, yesterday);

          // Calcula o range do mês ANTERIOR (não o mês atual que acabou de começar)
          // Ex: relatório dispara dia 1 → usa dados do mês passado completo
          const currentMonthStart = getPeriodStart(toLocalNow(timezone), "monthly"); // dia 1 deste mês 00:00 UTC (horário local)
          const prevMonthStart = new Date(Date.UTC(
            currentMonthStart.getUTCFullYear(),
            currentMonthStart.getUTCMonth() - 1,
            1
          ));
          const prevMonthEnd = currentMonthStart; // dia 1 deste mês (exclusive)

          await runReport(guild, "monthly", { start: prevMonthStart, end: prevMonthEnd });
        } catch (error) {
          logger.error(`Erro no relatório mensal da guild ${guild.id}:`, error);
        }
      }
    },
    { timezone: "UTC" }
  );

  logger.info("Relatório mensal agendado (verificação horária por guild)");
}

export function scheduleDailyAggregate(client: Client): void {
  // Agrega o dia anterior à meia-noite
  cron.schedule(
    DAILY_AGGREGATE_CRON,
    async () => {
      logger.info("Iniciando agregação diária...");

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      for (const [, guild] of client.guilds.cache) {
        try {
          await aggregateDaily(guild.id, yesterday);
        } catch (error) {
          logger.error(`Erro na agregação diária da guild ${guild.id}:`, error);
        }
      }
    },
    { timezone: "UTC" }
  );

  // Agrega o dia atual de hora em hora para manter o leaderboard atualizado
  cron.schedule(
    HOURLY_AGGREGATE_CRON,
    async () => {
      const today = new Date();
      for (const [, guild] of client.guilds.cache) {
        try {
          await aggregateDaily(guild.id, today);
        } catch (error) {
          logger.error(`Erro na agregação horária da guild ${guild.id}:`, error);
        }
      }
      logger.info("Agregação horária concluída.");
    },
    { timezone: "UTC" }
  );

  logger.info("Agregação agendada (diária 00:05 UTC + horária)");
}
