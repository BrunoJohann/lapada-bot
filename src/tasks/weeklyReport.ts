import cron from "node-cron";
import { Client } from "discord.js";
import { runReport } from "../services/reportService";
import { aggregateDaily, getPeriodStart } from "../services/metricsService";
import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

const DAY_NAMES = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

// Roda toda hora e verifica quais guilds devem receber o relatório semanal agora
export function scheduleWeeklyReport(client: Client): void {
  cron.schedule(
    "0 * * * *",
    async () => {
      for (const [, guild] of client.guilds.cache) {
        try {
          const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
          const timezone = config?.timezone ?? process.env.TIMEZONE ?? "America/Sao_Paulo";

          const now = new Date();
          const hour     = parseInt(now.toLocaleString("en-US", { timeZone: timezone, hour: "numeric", hour12: false }), 10);
          const dayShort = now.toLocaleString("en-US", { timeZone: timezone, weekday: "short" });
          const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const dayOfWeek = dayMap[dayShort] ?? 1;

          const scheduledDay  = config?.weeklyReportDay  ?? 1;
          const scheduledHour = config?.weeklyReportHour ?? 8;

          if (dayOfWeek !== scheduledDay || hour !== scheduledHour) continue;

          logger.info(`Iniciando relatório semanal para guild ${guild.id} (${DAY_NAMES[scheduledDay]} ${scheduledHour}:00)`);

          // Agrega o último dia da semana anterior (ontem) antes de gerar o relatório
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          await aggregateDaily(guild.id, yesterday);

          // Calcula o range da semana ANTERIOR (não a semana atual que acabou de começar)
          // Ex: relatório dispara segunda-feira → usa dados de segunda a domingo passados
          const currentWeekStart = getPeriodStart(now, "weekly"); // esta segunda 00:00 UTC
          const prevWeekStart = new Date(currentWeekStart);
          prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7); // segunda passada 00:00 UTC
          const prevWeekEnd = currentWeekStart;                      // esta segunda 00:00 UTC (exclusive)

          await runReport(guild, "weekly", { start: prevWeekStart, end: prevWeekEnd });
        } catch (error) {
          logger.error(`Erro no relatório semanal da guild ${guild.id}:`, error);
        }
      }
    },
    { timezone: "UTC" }
  );

  logger.info("Relatório semanal agendado (verificação horária por guild)");
}
