import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { ChartConfiguration } from "chart.js";
import { createCanvas, CanvasRenderingContext2D } from "canvas";
import { DailyPoint, PeriodStats } from "./metricsService";

const WIDTH  = 900;
const HEIGHT = 400;

const renderer = new ChartJSNodeCanvas({ width: WIDTH, height: HEIGHT, backgroundColour: "#2b2d31" });

const GRID_COLOR = "rgba(255,255,255,0.07)";
const TEXT_COLOR = "#b5bac1";
const LINE_COLOR = "#5865f2";
const FILL_COLOR = "rgba(88,101,242,0.15)";

function dayLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function minsToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
}

export type ChartMetric = "voz" | "pontos";

export async function buildActivityChart(
  points: DailyPoint[],
  metric: ChartMetric,
  title: string
): Promise<Buffer> {
  const labels = points.map((p) => dayLabel(p.date));
  const data   = metric === "voz"
    ? points.map((p) => p.voiceMinutes)
    : points.map((p) => Math.round(p.score * 10) / 10);

  const yLabel = metric === "voz" ? "Tempo em voz" : "Pontos";

  // Total e máximo do período
  const total  = data.reduce((sum, v) => sum + v, 0);
  const maxVal = Math.max(...data);
  const maxIdx = data.indexOf(maxVal);
  const maxDay = labels[maxIdx] ?? "";

  const fmt = (v: number) =>
    metric === "voz" ? minsToHours(Math.round(v)) : `${Math.round(v * 10) / 10} pts`;

  const subtitle = `Total: ${fmt(total)}   ·   Máximo: ${fmt(maxVal)} em ${maxDay}`;

  const config: ChartConfiguration = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: yLabel,
          data,
          borderColor: LINE_COLOR,
          backgroundColor: FILL_COLOR,
          pointBackgroundColor: LINE_COLOR,
          pointBorderColor: "#fff",
          pointRadius: points.length <= 14 ? 5 : 3,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: title,
          color: "#ffffff",
          font: { size: 16, weight: "bold" },
          padding: { bottom: 4 },
        },
        subtitle: {
          display: true,
          text: subtitle,
          color: TEXT_COLOR,
          font: { size: 12 },
          padding: { bottom: 12 },
        },
      },
      scales: {
        x: {
          ticks: { color: TEXT_COLOR, font: { size: 11 }, maxRotation: 45 },
          grid: { color: GRID_COLOR },
          border: { color: GRID_COLOR },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: TEXT_COLOR,
            font: { size: 11 },
            ...(metric === "voz" && {
              callback: (value) => minsToHours(Number(value)),
            }),
          },
          grid: { color: GRID_COLOR },
          border: { color: GRID_COLOR },
          title: {
            display: true,
            text: yLabel,
            color: TEXT_COLOR,
            font: { size: 12 },
          },
        },
      },
      layout: { padding: { left: 16, right: 24, top: 8, bottom: 8 } },
    },
  };

  return renderer.renderToBuffer(config) as Promise<Buffer>;
}

// ── Comparison Card ────────────────────────────────────────────────────────────

export interface ComparisonCardData {
  subject: string;
  period1Label: string;
  period2Label: string;
  period1: PeriodStats;
  period2: PeriodStats;
}

const W = 900;

// Colors
const C_BG       = "#1e1f22";
const C_CARD     = "#2b2d31";
const C_BLURPLE  = "#5865f2";
const C_GREEN    = "#57f287";
const C_RED      = "#ed4245";
const C_TEXT     = "#ffffff";
const C_MUTED    = "#b5bac1";
const C_SUBTLE   = "#72767d";
const C_BORDER   = "rgba(255,255,255,0.08)";
const C_ROW_ALT  = "rgba(255,255,255,0.025)";

// Metric accent colors
const METRIC_COLORS = ["#5865f2", "#57f287", "#fee75c", "#f47b67"];

// Layout constants
const PAD         = 40;
const BOX_W       = 258;  // width of left/right value boxes
const COL_L_X     = PAD;              // left box start x
const COL_R_X     = W - PAD - BOX_W; // right box start x  (602)
const CX          = W / 2;            // horizontal center  (450)
const COL_L_CX    = COL_L_X + BOX_W / 2;  // 169
const COL_R_CX    = COL_R_X + BOX_W / 2;  // 731

const Y_ACCENT    = 0;
const Y_HEADER    = 4;
const HEADER_H    = 116;
const Y_DIVIDER1  = Y_HEADER + HEADER_H;  // 120
const PH_H        = 44;
// Row layout: 178 start + 4×96 = 562 divider, 614 total (52px footer)
const Y_ROWS_START = 178;
const ROW_H_PX     = 96;
const Y_FOOTER_DIV = Y_ROWS_START + 4 * ROW_H_PX;  // 562
const CANVAS_H_CMP = Y_FOOTER_DIV + 52;             // 614

function fillRR(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  fill: string
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function strokeRR(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  stroke: string, lw = 1
): void {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

function fmtVoice(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function fmtVoiceDiff(diff: number): string {
  const sign = diff >= 0 ? "+" : "-";
  const abs  = Math.abs(diff);
  const h    = Math.floor(abs / 60);
  const m    = abs % 60;
  if (h === 0) return `${sign}${m}min`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}min`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

function fmtNumDiff(diff: number): string {
  return (diff >= 0 ? "+" : "") + Math.round(diff).toLocaleString("pt-BR");
}

function fmtScore(n: number): string {
  return `${(Math.round(n * 10) / 10).toLocaleString("pt-BR")} pts`;
}

function fmtScoreDiff(diff: number): string {
  const v = Math.round(diff * 10) / 10;
  return (v >= 0 ? "+" : "") + v.toLocaleString("pt-BR") + " pts";
}

function pctChange(a: number, b: number): number {
  if (a === 0) return b === 0 ? 0 : 100;
  return ((b - a) / a) * 100;
}

export function buildComparisonCard(data: ComparisonCardData): Buffer {
  const canvas = createCanvas(W, CANVAS_H_CMP);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, W, CANVAS_H_CMP);

  // ── Top accent bar (gradient) ───────────────────────────────────────────────
  const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
  accentGrad.addColorStop(0, C_BLURPLE);
  accentGrad.addColorStop(1, "#4752c4");
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, Y_ACCENT, W, 4);

  // ── Header gradient background ─────────────────────────────────────────────
  const hdrGrad = ctx.createLinearGradient(0, 0, W, HEADER_H);
  hdrGrad.addColorStop(0, "#191b3a");
  hdrGrad.addColorStop(1, C_BG);
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(0, Y_HEADER, W, HEADER_H);

  // Header blurple circle icon
  ctx.fillStyle = C_BLURPLE;
  ctx.beginPath();
  ctx.arc(PAD + 9, 46, 9, 0, Math.PI * 2);
  ctx.fill();

  // Title
  ctx.font        = "bold 22px sans-serif";
  ctx.fillStyle   = C_TEXT;
  ctx.textAlign   = "left";
  ctx.fillText("COMPARAÇÃO DE ATIVIDADE", PAD + 26, 52);

  // Subject name
  ctx.font      = "15px sans-serif";
  ctx.fillStyle = C_MUTED;
  ctx.fillText(data.subject, PAD + 26, 78);

  // Period comparison sub-line
  ctx.font      = "13px sans-serif";
  ctx.fillStyle = C_SUBTLE;
  const shortP1 = data.period1Label.length > 30 ? data.period1Label.slice(0, 28) + "…" : data.period1Label;
  const shortP2 = data.period2Label.length > 30 ? data.period2Label.slice(0, 28) + "…" : data.period2Label;
  ctx.fillText(`${shortP1}  →  ${shortP2}`, PAD + 26, 100);

  // ── Divider 1 ──────────────────────────────────────────────────────────────
  ctx.fillStyle = C_BORDER;
  ctx.fillRect(0, Y_DIVIDER1, W, 1);

  // ── Period header boxes ────────────────────────────────────────────────────
  const phY = Y_DIVIDER1 + 5;

  // Left box
  fillRR (ctx, COL_L_X, phY, BOX_W, PH_H, 7, "rgba(88,101,242,0.12)");
  strokeRR(ctx, COL_L_X, phY, BOX_W, PH_H, 7, "rgba(88,101,242,0.4)");

  ctx.font      = "bold 10px sans-serif";
  ctx.fillStyle = C_SUBTLE;
  ctx.textAlign = "center";
  ctx.fillText("PERÍODO 1", COL_L_CX, phY + 15);

  ctx.font      = "bold 13px sans-serif";
  ctx.fillStyle = C_TEXT;
  ctx.fillText(shortP1, COL_L_CX, phY + 32);

  // "VS" in center
  ctx.font      = "bold 14px sans-serif";
  ctx.fillStyle = C_SUBTLE;
  ctx.fillText("VS", CX, phY + 27);

  // Right box
  fillRR (ctx, COL_R_X, phY, BOX_W, PH_H, 7, "rgba(88,101,242,0.12)");
  strokeRR(ctx, COL_R_X, phY, BOX_W, PH_H, 7, "rgba(88,101,242,0.4)");

  ctx.font      = "bold 10px sans-serif";
  ctx.fillStyle = C_SUBTLE;
  ctx.fillText("PERÍODO 2", COL_R_CX, phY + 15);

  ctx.font      = "bold 13px sans-serif";
  ctx.fillStyle = C_TEXT;
  ctx.fillText(shortP2, COL_R_CX, phY + 32);

  ctx.textAlign = "left";

  // ── Metric rows ────────────────────────────────────────────────────────────
  interface MetricDef {
    name: string;
    v1: number;
    v2: number;
    valFmt:  (n: number) => string;
    diffFmt: (d: number) => string;
  }

  const metrics: MetricDef[] = [
    {
      name: "TEMPO EM VOZ",
      v1: data.period1.voiceMinutes,
      v2: data.period2.voiceMinutes,
      valFmt:  fmtVoice,
      diffFmt: fmtVoiceDiff,
    },
    {
      name: "MENSAGENS",
      v1: data.period1.messageCount,
      v2: data.period2.messageCount,
      valFmt:  fmtNum,
      diffFmt: fmtNumDiff,
    },
    {
      name: "REAÇÕES RECEBIDAS",
      v1: data.period1.reactionsCount,
      v2: data.period2.reactionsCount,
      valFmt:  fmtNum,
      diffFmt: fmtNumDiff,
    },
    {
      name: "PONTUAÇÃO TOTAL",
      v1: data.period1.score,
      v2: data.period2.score,
      valFmt:  fmtScore,
      diffFmt: fmtScoreDiff,
    },
  ];

  const BOX_H = 62;

  metrics.forEach((m, i) => {
    const ry = Y_ROWS_START + i * ROW_H_PX;

    // Alternating row tint
    if (i % 2 === 0) {
      ctx.fillStyle = C_ROW_ALT;
      ctx.fillRect(0, ry, W, ROW_H_PX);
    }

    // Metric colored dot
    ctx.fillStyle = METRIC_COLORS[i];
    ctx.beginPath();
    ctx.arc(PAD + 6, ry + 17, 5, 0, Math.PI * 2);
    ctx.fill();

    // Metric name
    ctx.font      = "bold 12px sans-serif";
    ctx.fillStyle = C_MUTED;
    ctx.textAlign = "left";
    ctx.fillText(m.name, PAD + 18, ry + 22);

    // Left value box
    fillRR(ctx, COL_L_X, ry + 28, BOX_W, BOX_H, 8, C_CARD);

    ctx.font      = "bold 24px sans-serif";
    ctx.fillStyle = C_TEXT;
    ctx.textAlign = "center";
    ctx.fillText(m.valFmt(m.v1), COL_L_CX, ry + 67);

    // Right value box
    fillRR(ctx, COL_R_X, ry + 28, BOX_W, BOX_H, 8, C_CARD);

    ctx.font      = "bold 24px sans-serif";
    ctx.fillStyle = C_TEXT;
    ctx.fillText(m.valFmt(m.v2), COL_R_CX, ry + 67);

    // Change indicator
    const diff  = m.v2 - m.v1;
    const pct   = pctChange(m.v1, m.v2);
    const color = diff > 0 ? C_GREEN : diff < 0 ? C_RED : C_MUTED;
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "●";

    ctx.font      = "bold 18px sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(`${arrow} ${Math.abs(pct).toFixed(1)}%`, CX, ry + 52);

    ctx.font      = "12px sans-serif";
    ctx.fillStyle = C_SUBTLE;
    ctx.fillText(m.diffFmt(diff), CX, ry + 71);

    // Row bottom hairline
    ctx.fillStyle = C_BORDER;
    ctx.fillRect(PAD, ry + ROW_H_PX - 2, W - PAD * 2, 1);
  });

  // ── Divider 2 ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, Y_FOOTER_DIV, W, 1);

  // ── Footer ─────────────────────────────────────────────────────────────────
  ctx.font      = "12px sans-serif";
  ctx.fillStyle = C_SUBTLE;
  ctx.textAlign = "left";
  ctx.fillText("Lapada Bot  ·  Comparação de Atividade", PAD, Y_FOOTER_DIV + 30);

  ctx.textAlign = "right";
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  ctx.fillText(today, W - PAD, Y_FOOTER_DIV + 30);

  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
