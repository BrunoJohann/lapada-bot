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
  resolveQuickCompareRanges,
  searchActiveUsers,
  toLocalNow,
  QuickCompareMode,
} from "../services/metricsService";
import { buildActivityChart, buildComparisonChart, ChartMetric } from "../services/chartService";
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
  )
  // ── Comparison options ─────────────────────────────────────────────────────
  .addStringOption((opt) =>
    opt
      .setName("comparar")
      .setDescription("Comparar com outro período (sobrepõe duas linhas no gráfico)")
      .addChoices(
        { name: "Semana atual vs anterior",    value: "semana"        },
        { name: "Semana passada vs retrasada", value: "semana_passada"},
        { name: "Mês atual vs anterior",       value: "mes"           },
        { name: "Mês passado vs retrasado",    value: "mes_passado"   }
      )
  )
  .addIntegerOption((opt) =>
    opt.setName("p2_mes").setDescription("Comparar com: Mês do 2º período (1–12)").setMinValue(1).setMaxValue(12)
  )
  .addIntegerOption((opt) =>
    opt.setName("p2_semana").setDescription("Comparar com: Semana do 2º período (1–5)").setMinValue(1).setMaxValue(5)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("p2_ano")
      .setDescription(`Comparar com: Ano do 2º período (padrão: ${CURRENT_YEAR})`)
      .setMinValue(2024)
      .setMaxValue(2030)
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

  const guildId  = interaction.guildId;
  const metric   = (interaction.options.getString("metrica") ?? "voz") as ChartMetric;
  const userId   = interaction.options.getString("usuario") ?? undefined;
  const mes      = interaction.options.getInteger("mes");
  const ano      = interaction.options.getInteger("ano");
  const semana   = interaction.options.getInteger("semana");
  const comparar = interaction.options.getString("comparar");
  const p2_mes   = interaction.options.getInteger("p2_mes");
  const p2_semana= interaction.options.getInteger("p2_semana");
  const p2_ano   = interaction.options.getInteger("p2_ano");

  const config   = await getCachedGuildConfig(guildId);
  const timezone = config?.timezone ?? "America/Sao_Paulo";

  const historical = resolveHistoricalRange(semana, mes, ano);

  // ── Resolve nome para o título ────────────────────────────────────────────
  let subjectName = "Servidor";
  if (userId) {
    const member = interaction.guild?.members.cache.get(userId);
    subjectName  = member?.displayName ?? member?.user.username ?? userId;
  }
  const metricLabel = metric === "voz" ? "Tempo em Voz" : "Pontos";

  // ── Modo comparação (duas linhas) ─────────────────────────────────────────
  const isCompare = comparar !== null || p2_mes !== null;

  if (isCompare) {
    let range1, range2;

    if (comparar && !p2_mes) {
      // quick mode
      ({ range1, range2 } = resolveQuickCompareRanges(comparar as QuickCompareMode, timezone));
    } else {
      // period 1 from existing options
      const localNow = toLocalNow(timezone);
      if (historical) {
        range1 = historical;
      } else {
        const period = (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";
        range1 = {
          start: getPeriodStart(localNow, period),
          end:   new Date(),
          label: getPeriodLabel(localNow, period),
        };
      }
      // period 2 from p2_* options
      const r2 = resolveHistoricalRange(p2_semana, p2_mes, ano ?? null);
      if (!r2) {
        await interaction.editReply("Informe **p2_mes** para definir o 2º período da comparação.");
        return;
      }
      range2 = r2;
    }

    const periodType: "weekly" | "monthly" =
      (range2.end.getTime() - range2.start.getTime()) <= 8 * 86_400_000 ? "weekly" : "monthly";

    const [pts1, pts2] = await Promise.all([
      getDailyBreakdown(guildId, range1.start, range1.end, userId),
      getDailyBreakdown(guildId, range2.start, range2.end, userId),
    ]);

    const title = `${subjectName} · ${metricLabel} · Comparação`;
    const imageBuffer = await buildComparisonChart(pts1, pts2, metric, range1.label, range2.label, title, periodType);
    await interaction.editReply({ files: [new AttachmentBuilder(imageBuffer, { name: "grafico-comparacao.png" })] });
    return;
  }

  // ── Modo normal (uma linha) ───────────────────────────────────────────────
  let start: Date;
  let end: Date;
  let periodLabel: string;

  if (historical) {
    start       = historical.start;
    end         = historical.end;
    periodLabel = historical.label;
  } else {
    const period   = (interaction.options.getString("periodo") ?? "weekly") as "weekly" | "monthly";
    const localNow = toLocalNow(timezone);
    start          = getPeriodStart(localNow, period);
    end            = new Date();
    periodLabel    = getPeriodLabel(localNow, period);
  }

  const points      = await getDailyBreakdown(guildId, start, end, userId);
  const title       = `${subjectName} · ${metricLabel} · ${periodLabel}`;
  const imageBuffer = await buildActivityChart(points, metric, title);
  await interaction.editReply({ files: [new AttachmentBuilder(imageBuffer, { name: "grafico.png" })] });
}

export default { data, execute, autocomplete } satisfies Command;
