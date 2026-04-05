import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { ChartConfiguration } from "chart.js";
import { DailyPoint } from "./metricsService";

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
