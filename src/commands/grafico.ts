import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  AutocompleteInteraction,
} from "discord.js";
import {
  getDailyBreakdown,
  getPeriodStart,
  getPeriodLabel,
  resolveHistoricalRange,
  searchActiveUsers,
  toLocalNow,
} from "../services/metricsService";
import { buildActivityChart, ChartMetric } from "../services/chartService";
import { getCachedGuildConfig } from "../utils/guildConfig";
import { Command } from "../client";

const CURRENT_YEAR = new Date().getFullYear();

export const data = new SlashCommandBuilder()
  .setName("lapada-grafico")
  .setDescription("Gráfico de atividade diária do servidor ou de um usuário")
  .addStringOption((opt) =>
    opt
      .setName("periodo")
      .setDescription("Período base (padrão: semanal)")
      .addChoices(
        { name: "Semanal", value: "weekly" },
        { name: "Mensal",  value: "monthly" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("metrica")
      .setDescription("O que exibir no gráfico (padrão: voz)")
      .addChoices(
        { name: "Tempo em voz", value: "voz"    },
        { name: "Pontos",       value: "pontos" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Filtrar por usuário específico (deixe vazio para o grupo todo)")
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt.setName("mes").setDescription("Mês histórico (1–12)").setMinValue(1).setMaxValue(12)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("ano")
      .setDescription(`Ano histórico (padrão: ${CURRENT_YEAR})`)
      .setMinValue(2024)
      .setMaxValue(2030)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("semana")
      .setDescription("Semana do mês (1–5, requer 'mes')")
      .setMinValue(1)
      .setMaxValue(5)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "usuario") return;

  const results = await searchActiveUsers(interaction.guildId, focused.value, 25);
  await interaction.respond(results.map((r) => ({ name: r.label, value: r.id })));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const guildId = interaction.guildId;
  const metric  = (interaction.options.getString("metrica") ?? "voz") as ChartMetric;
  const userId  = interaction.options.getString("usuario") ?? undefined;
  const mes     = interaction.options.getInteger("mes");
  const ano     = interaction.options.getInteger("ano");
  const semana  = interaction.options.getInteger("semana");

  const historical = resolveHistoricalRange(semana, mes, ano);

  let start: Date;
  let end: Date;
  let periodLabel: string;

  if (historical) {
    start       = historical.start;
    end         = historical.end;
    periodLabel = historical.label;
  } else {
    const period   = (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";
    const config   = await getCachedGuildConfig(guildId);
    const timezone = config?.timezone ?? "America/Sao_Paulo";
    const localNow = toLocalNow(timezone);
    start          = getPeriodStart(localNow, period);
    end            = new Date(); // até agora (UTC real para dados)
    periodLabel    = getPeriodLabel(localNow, period);
  }

  const points = await getDailyBreakdown(guildId, start, end, userId);

  // Resolve nome para o título
  let subjectName = "Servidor";
  if (userId) {
    const member = interaction.guild?.members.cache.get(userId);
    subjectName  = member?.displayName ?? interaction.guild?.members.cache.get(userId)?.user.username ?? userId;
  }

  const metricLabel = metric === "voz" ? "Tempo em Voz" : "Pontos";
  const title       = `${subjectName} · ${metricLabel} · ${periodLabel}`;

  const imageBuffer  = await buildActivityChart(points, metric, title);
  const attachment   = new AttachmentBuilder(imageBuffer, { name: "grafico.png" });

  await interaction.editReply({ files: [attachment] });
}

export default { data, execute, autocomplete } satisfies Command;
