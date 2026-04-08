import { describe, it, expect } from "vitest";
import { calculateScore } from "../../utils/scoring";

describe("calculateScore", () => {
  it("retorna 0 para todos os inputs zero", () => {
    expect(calculateScore(0, 0, 0, 0)).toBe(0);
  });

  it("calcula apenas mensagens (peso 1.0)", () => {
    expect(calculateScore(10, 0, 0, 0)).toBe(10);
  });

  it("calcula apenas voz com multiplicador padrão 2.0", () => {
    expect(calculateScore(0, 30, 0, 0)).toBe(60);
  });

  it("calcula apenas reações com peso 1.5", () => {
    expect(calculateScore(0, 0, 0, 10)).toBe(15);
  });

  it("ignora stream quando streamMultiplier é 0 (padrão)", () => {
    expect(calculateScore(0, 0, 60, 0, 0, 2.0, 0)).toBe(0);
  });

  it("calcula stream quando streamMultiplier é fornecido", () => {
    expect(calculateScore(0, 0, 60, 0, 0, 2.0, 1.5)).toBe(90);
  });

  it("aplica bônus de streak de 10 dias (x1.5)", () => {
    const base = calculateScore(10, 0, 0, 0, 0);
    const withStreak = calculateScore(10, 0, 0, 0, 10);
    expect(withStreak).toBe(base * 1.5);
  });

  it("aplica bônus de streak de 20 dias (x2.0)", () => {
    const base = calculateScore(10, 0, 0, 0, 0);
    const withStreak = calculateScore(10, 0, 0, 0, 20);
    expect(withStreak).toBe(base * 2.0);
  });

  it("sem streak retorna score base sem multiplicador", () => {
    expect(calculateScore(10, 10, 0, 5, 0)).toBe(10 * 1.0 + 10 * 2.0 + 5 * 1.5);
  });

  it("calcula fórmula completa com todos os valores", () => {
    // msgs=5, voz=20, stream=10, reações=8, streak=4, vMult=2.0, sMult=1.5
    // base = 5*1 + 20*2 + 10*1.5 + 8*1.5 = 5 + 40 + 15 + 12 = 72
    // final = 72 * (1 + 4*0.05) = 72 * 1.2 = 86.4
    expect(calculateScore(5, 20, 10, 8, 4, 2.0, 1.5)).toBeCloseTo(86.4);
  });

  it("respeita multiplicador de voz customizado", () => {
    expect(calculateScore(0, 10, 0, 0, 0, 3.0)).toBe(30);
  });
});
