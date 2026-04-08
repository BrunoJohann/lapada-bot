import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  AutocompleteInteraction,
} from "discord.js";
import {
  getAggregateStats,
  resolveHistoricalRange,
  searchActiveUsers,
  toLocalNow,
  getPeriodStart,
  getPeriodLabel,
  HistoricalRange,
} from "../services/metricsService";
import { buildComparisonCard } from "../services/chartService";
import { getCachedGuildConfig } from "../utils/guildConfig";
import { Command } from "../client";

const CURRENT_YEAR = new Date().getFullYear();

export const data = new SlashCommandBuilder()
  .setName("lapada-comparar")
  .setDescription("Compara a atividade do grupo entre dois períodos com um card visual")
  // ── Quick mode ─────────────────────────────────────────────────────────────
  .addStringOption((opt) =>
    opt
      .setName("modo")
      .setDescription("Comparação rápida (ignorado se p1_mes/p2_mes forem informados)")
      .addChoices(
        { name: "Semana atual vs anterior",      value: "semana"        },
        { name: "Semana passada vs retrasada",   value: "semana_passada"},
        { name: "Mês atual vs anterior",         value: "mes"           },
        { name: "Mês passado vs retrasado",      value: "mes_passado"   }
      )
  )
  // ── Period 1 ───────────────────────────────────────────────────────────────
  .addIntegerOption((opt) =>
    opt.setName("p1_mes").setDescription("Período 1 · Mês (1–12)").setMinValue(1).setMaxValue(12)
  )
  .addIntegerOption((opt) =>
    opt.setName("p1_semana").setDescription("Período 1 · Semana do mês (1–5, requer p1_mes)").setMinValue(1).setMaxValue(5)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("p1_ano")
      .setDescription(`Período 1 · Ano (padrão: ${CURRENT_YEAR})`)
      .setMinValue(2024)
      .setMaxValue(2030)
  )
  // ── Period 2 ───────────────────────────────────────────────────────────────
  .addIntegerOption((opt) =>
    opt.setName("p2_mes").setDescription("Período 2 · Mês (1–12)").setMinValue(1).setMaxValue(12)
  )
  .addIntegerOption((opt) =>
    opt.setName("p2_semana").setDescription("Período 2 · Semana do mês (1–5, requer p2_mes)").setMinValue(1).setMaxValue(5)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("p2_ano")
      .setDescription(`Período 2 · Ano (padrão: ${CURRENT_YEAR})`)
      .setMinValue(2024)
      .setMaxValue(2030)
  )
  // ── Optional user filter ───────────────────────────────────────────────────
  .addStringOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Filtrar por usuário específico (deixe vazio para o grupo todo)")
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "usuario") return;

  const results = await searchActiveUsers(interaction.guildId, focused.value, 25);
  await interaction.respond(results.map((r) => ({ name: r.label, value: r.id })));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/**
 * Returns the range for a weekly period offset from `currentStart`.
 * offset=0 → current week (start..now)
 * offset=1 → previous week
 * offset=2 → 2 weeks ago
 */
function weekRange(currentStart: Date, offset: number): HistoricalRange {
  const start = new Date(currentStart);
  start.setUTCDate(start.getUTCDate() - offset * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return {
    start,
    end,
    label: `${fmtDate(start)} – ${fmtDate(new Date(end.getTime() - 86_400_000))}`,
  };
}

/**
 * Returns the range for a monthly period offset from `currentMonthStart`.
 * offset=0 → current month (start..now)
 * offset=1 → previous month
 * offset=2 → 2 months ago
 */
function monthRange(currentMonthStart: Date, offset: number): HistoricalRange {
  const start = new Date(currentMonthStart);
  start.setUTCMonth(start.getUTCMonth() - offset);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    start,
    end,
    label: start.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Este comando só pode ser usado em servidores.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const guildId = interaction.guildId;
  const userId  = interaction.options.getString("usuario") ?? undefined;

  const config   = await getCachedGuildConfig(guildId);
  const timezone = config?.timezone ?? "America/Sao_Paulo";

  // ── Resolve period 1 ───────────────────────────────────────────────────────
  const p1_mes    = interaction.options.getInteger("p1_mes");
  const p1_semana = interaction.options.getInteger("p1_semana");
  const p1_ano    = interaction.options.getInteger("p1_ano");

  // ── Resolve period 2 ───────────────────────────────────────────────────────
  const p2_mes    = interaction.options.getInteger("p2_mes");
  const p2_semana = interaction.options.getInteger("p2_semana");
  const p2_ano    = interaction.options.getInteger("p2_ano");

  const hasManual = p1_mes !== null || p2_mes !== null;

  let range1: HistoricalRange;
  let range2: HistoricalRange;

  if (hasManual) {
    // ── Manual mode: both periods must be specified ──────────────────────────
    const r1 = resolveHistoricalRange(p1_semana, p1_mes, p1_ano);
    const r2 = resolveHistoricalRange(p2_semana, p2_mes, p2_ano);

    if (!r1) {
      await interaction.editReply("Informe o **p1_mes** para definir o Período 1.");
      return;
    }
    if (!r2) {
      await interaction.editReply("Informe o **p2_mes** para definir o Período 2.");
      return;
    }

    range1 = r1;
    range2 = r2;
  } else {
    // ── Quick mode ────────────────────────────────────────────────────────────
    const modo     = (interaction.options.getString("modo") ?? "semana") as
      "semana" | "semana_passada" | "mes" | "mes_passado";
    const localNow = toLocalNow(timezone);

    if (modo === "semana" || modo === "semana_passada") {
      const currentStart = getPeriodStart(localNow, "weekly");
      if (modo === "semana") {
        // atual (start→agora) vs semana anterior (completa)
        range2 = { start: currentStart, end: new Date(), label: getPeriodLabel(localNow, "weekly") };
        range1 = weekRange(currentStart, 1);
      } else {
        // semana passada (completa) vs retrasada (completa)
        range2 = weekRange(currentStart, 1);
        range1 = weekRange(currentStart, 2);
      }
    } else {
      const currentStart = getPeriodStart(localNow, "monthly");
      if (modo === "mes") {
        // atual (start→agora) vs mês anterior (completo)
        range2 = { start: currentStart, end: new Date(), label: getPeriodLabel(localNow, "monthly") };
        range1 = monthRange(currentStart, 1);
      } else {
        // mês passado (completo) vs retrasado (completo)
        range2 = monthRange(currentStart, 1);
        range1 = monthRange(currentStart, 2);
      }
    }
  }

  // ── Fetch stats for both periods ───────────────────────────────────────────
  const [stats1, stats2] = await Promise.all([
    getAggregateStats(guildId, range1.start, range1.end, userId),
    getAggregateStats(guildId, range2.start, range2.end, userId),
  ]);

  // ── Resolve subject name ───────────────────────────────────────────────────
  let subject = "Servidor";
  if (userId) {
    let member = interaction.guild?.members.cache.get(userId);
    if (!member && interaction.guild) {
      member = await interaction.guild.members.fetch(userId).catch(() => undefined);
    }
    subject = member?.displayName ?? member?.user.username ?? userId;
  }

  // ── Build and send comparison card ────────────────────────────────────────
  const imageBuffer = buildComparisonCard({
    subject,
    period1Label: range1.label,
    period2Label: range2.label,
    period1: stats1,
    period2: stats2,
  });

  const attachment = new AttachmentBuilder(imageBuffer, { name: "comparacao.png" });
  await interaction.editReply({ files: [attachment] });
}

export default { data, execute, autocomplete } satisfies Command;
