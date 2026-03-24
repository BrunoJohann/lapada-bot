import cron from "node-cron";
import { Client } from "discord.js";
import { runReport } from "../services/reportService";
import { aggregateDaily } from "../services/metricsService";
import { logger } from "../utils/logger";

// Todo dia 1 do mês às 08:00 (America/Sao_Paulo)
const MONTHLY_CRON = "0 8 1 * *";

// Todo dia às 00:05 — agrega o dia anterior
const DAILY_AGGREGATE_CRON = "5 0 * * *";

// Todo hora — agrega o dia atual para manter leaderboard atualizado
const HOURLY_AGGREGATE_CRON = "0 * * * *";

export function scheduleMonthlyReport(client: Client): void {
  cron.schedule(
    MONTHLY_CRON,
    async () => {
      logger.info("Iniciando relatório mensal...");

      for (const [, guild] of client.guilds.cache) {
        try {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          await aggregateDaily(guild.id, yesterday);

          await runReport(guild, "monthly");
        } catch (error) {
          logger.error(`Erro no relatório mensal da guild ${guild.id}:`, error);
        }
      }
    },
    { timezone: process.env.TIMEZONE ?? "America/Sao_Paulo" }
  );

  logger.info("Relatório mensal agendado (dia 1 de cada mês às 08:00)");
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
