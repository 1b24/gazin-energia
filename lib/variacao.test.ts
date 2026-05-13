/**
 * Testes de `prevPeriod` e `variacao` — fundação da coluna Δ em Consumo.
 * Bug histórico: variação por uc divergente quando comparação cruzava ano.
 */
import { describe, expect, it } from "vitest";

import { prevPeriod, variacao } from "./variacao";

describe("prevPeriod", () => {
  it("Junho/2026 → Maio/2026", () => {
    expect(prevPeriod({ ano: 2026, mes: "Junho" })).toEqual({
      ano: 2026,
      mes: "Maio",
    });
  });

  it("Fevereiro/2026 → Janeiro/2026", () => {
    expect(prevPeriod({ ano: 2026, mes: "Fevereiro" })).toEqual({
      ano: 2026,
      mes: "Janeiro",
    });
  });

  it("Janeiro/2026 → Dezembro/2025 (vira o ano)", () => {
    expect(prevPeriod({ ano: 2026, mes: "Janeiro" })).toEqual({
      ano: 2025,
      mes: "Dezembro",
    });
  });

  it("Dezembro/2026 → Novembro/2026", () => {
    expect(prevPeriod({ ano: 2026, mes: "Dezembro" })).toEqual({
      ano: 2026,
      mes: "Novembro",
    });
  });

  it("aceita variações de case e espaços (delega a mesIndex)", () => {
    // Após Step 4 do refactor 2026-05-foundations, prevPeriod usa o
    // mesIndex canônico de lib/period.ts (case-insensitive + trim).
    expect(prevPeriod({ ano: 2026, mes: "Janeiro " })).toEqual({
      ano: 2025,
      mes: "Dezembro",
    });
    expect(prevPeriod({ ano: 2026, mes: "janeiro" })).toEqual({
      ano: 2025,
      mes: "Dezembro",
    });
  });

  it("mês inválido retorna null", () => {
    expect(prevPeriod({ ano: 2026, mes: "" })).toBeNull();
    expect(prevPeriod({ ano: 2026, mes: "Jan" })).toBeNull();
  });
});

describe("variacao", () => {
  it("aumento: atual > anterior → abs positivo, pct positivo", () => {
    const v = variacao(150, 100);
    expect(v.abs).toBe(50);
    expect(v.pct).toBe(50);
  });

  it("queda: atual < anterior → abs negativo, pct negativo", () => {
    const v = variacao(80, 100);
    expect(v.abs).toBe(-20);
    expect(v.pct).toBe(-20);
  });

  it("igualdade: abs=0, pct=0", () => {
    const v = variacao(100, 100);
    expect(v.abs).toBe(0);
    expect(v.pct).toBe(0);
  });

  it("anterior=0 → pct=null (evita divisão por zero), abs preservado", () => {
    const v = variacao(50, 0);
    expect(v.abs).toBe(50);
    expect(v.pct).toBeNull();
  });

  it("atual=null → {abs:null, pct:null}", () => {
    expect(variacao(null, 100)).toEqual({ abs: null, pct: null });
  });

  it("anterior=null → {abs:null, pct:null}", () => {
    expect(variacao(100, null)).toEqual({ abs: null, pct: null });
  });

  it("ambos null → {abs:null, pct:null}", () => {
    expect(variacao(null, null)).toEqual({ abs: null, pct: null });
    expect(variacao(undefined, undefined)).toEqual({ abs: null, pct: null });
  });

  it("anterior negativo: pct usa Math.abs(anterior)", () => {
    // Caso de borda: anterior=-100, atual=-50 → variou +50 sobre |−100|=100 → +50%
    const v = variacao(-50, -100);
    expect(v.abs).toBe(50);
    expect(v.pct).toBe(50);
  });
});
