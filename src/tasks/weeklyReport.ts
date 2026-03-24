import cron from "node-cron";
import { Client } from "discord.js";
import { runReport } from "../services/reportService";
import { aggregateDaily } from "../services/metricsService";
import { logger } from "../utils/logger";

// Toda segunda-feira às 08:00 (America/Sao_Paulo)
const WEEKLY_CRON = "0 8 * * 1";

export function scheduleWeeklyReport(client: Client): void {
  cron.schedule(
    WEEKLY_CRON,
    async () => {
      logger.info("Iniciando relatório semanal...");

      for (const [, guild] of client.guilds.cache) {
        try {
          // Garante que a agregação do dia anterior está completa
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          await aggregateDaily(guild.id, yesterday);

          await runReport(guild, "weekly");
        } catch (error) {
          logger.error(`Erro no relatório semanal da guild ${guild.id}:`, error);
        }
      }
    },
    { timezone: process.env.TIMEZONE ?? "America/Sao_Paulo" }
  );

  logger.info("Relatório semanal agendado (segunda-feira 08:00)");
}
