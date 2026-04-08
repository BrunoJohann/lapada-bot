import { describe, it, expect } from "vitest";
import {
  getPeriodStart,
  getPeriodLabel,
  resolveHistoricalRange,
  toLocalNow,
} from "../../utils/dateUtils";

describe("getPeriodStart", () => {
  it("retorna a segunda-feira da semana para periodo weekly", () => {
    // 2026-04-08 é quarta-feira
    const date = new Date("2026-04-08T12:00:00Z");
    const start = getPeriodStart(date, "weekly");
    expect(start.getUTCDay()).toBe(1); // 1 = segunda-feira
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-06");
  });

  it("retorna a própria segunda-feira quando a data já é segunda", () => {
    const date = new Date("2026-04-06T12:00:00Z"); // segunda
    const start = getPeriodStart(date, "weekly");
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-06");
  });

  it("ajusta corretamente quando a data é domingo", () => {
    const date = new Date("2026-04-05T12:00:00Z"); // domingo
    const start = getPeriodStart(date, "weekly");
    expect(start.toISOString().slice(0, 10)).toBe("2026-03-30");
  });

  it("retorna o dia 1 do mês para periodo monthly", () => {
    const date = new Date("2026-04-15T12:00:00Z");
    const start = getPeriodStart(date, "monthly");
    expect(start.getUTCDate()).toBe(1);
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("zera os horários do resultado", () => {
    const date = new Date("2026-04-08T23:59:59Z");
    const start = getPeriodStart(date, "weekly");
    expect(start.getUTCHours()).toBe(0);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
  });
});

describe("getPeriodLabel", () => {
  it("retorna range de datas para periodo weekly no formato DD/MM – DD/MM", () => {
    const date = new Date("2026-04-08T00:00:00Z"); // quarta
    const label = getPeriodLabel(date, "weekly");
    // semana começa em 06/04 (segunda) e vai até 12/04 (domingo)
    expect(label).toMatch(/\d{2}\/\d{2} – \d{2}\/\d{2}/);
    expect(label).toContain("06/04");
    expect(label).toContain("12/04");
  });

  it("retorna nome do mês em português para periodo monthly", () => {
    const date = new Date("2026-04-01T00:00:00Z");
    const label = getPeriodLabel(date, "monthly");
    expect(label.toLowerCase()).toContain("abril");
    expect(label).toContain("2026");
  });
});

describe("resolveHistoricalRange", () => {
  it("retorna null quando nenhum parâmetro é fornecido", () => {
    expect(resolveHistoricalRange(null, null, null)).toBeNull();
  });

  it("resolve range mensal corretamente", () => {
    const range = resolveHistoricalRange(null, 3, 2026);
    expect(range).not.toBeNull();
    expect(range!.start.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(range!.end.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("label mensal está em português", () => {
    const range = resolveHistoricalRange(null, 3, 2026);
    expect(range!.label.toLowerCase()).toContain("março");
    expect(range!.label).toContain("2026");
  });

  it("resolve primeira semana do mês", () => {
    // Março 2026: dia 1 é domingo, então primeira segunda = dia 2
    const range = resolveHistoricalRange(1, 3, 2026);
    expect(range).not.toBeNull();
    expect(range!.start.toISOString().slice(0, 10)).toBe("2026-03-02");
    expect(range!.end.toISOString().slice(0, 10)).toBe("2026-03-09");
  });

  it("resolve segunda semana do mês (offset +7)", () => {
    const range = resolveHistoricalRange(2, 3, 2026);
    expect(range).not.toBeNull();
    expect(range!.start.toISOString().slice(0, 10)).toBe("2026-03-09");
    expect(range!.end.toISOString().slice(0, 10)).toBe("2026-03-16");
  });

  it("label de semana contém número da semana e datas", () => {
    const range = resolveHistoricalRange(1, 3, 2026);
    expect(range!.label).toContain("Semana 1");
    expect(range!.label).toMatch(/\d{2}\/\d{2}/);
  });

  it("usa o ano atual quando ano não é fornecido", () => {
    const range = resolveHistoricalRange(null, 1, null);
    expect(range).not.toBeNull();
    expect(range!.start.getUTCFullYear()).toBe(new Date().getUTCFullYear());
  });
});

describe("toLocalNow", () => {
  it("retorna um Date cujos campos UTC representam a hora local BRT", () => {
    const localNow = toLocalNow("America/Sao_Paulo");
    // Deve ser uma data válida
    expect(localNow).toBeInstanceOf(Date);
    expect(isNaN(localNow.getTime())).toBe(false);
  });

  it("retorna um Date cujos campos UTC representam a hora local UTC", () => {
    const localNow = toLocalNow("UTC");
    const now = new Date();
    // Com timezone UTC, os campos devem ser virtualmente iguais (diferença < 1s)
    expect(Math.abs(localNow.getTime() - now.getTime())).toBeLessThan(1000);
  });
});
