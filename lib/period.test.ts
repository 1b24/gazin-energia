/**
 * Testes de `lib/period.ts` — source of truth de meses/períodos pt-BR.
 *
 * Cobertura: mesIndex case-insensitive, normalizeMes Title Case,
 * periodKey "YYYY-MM", prevPeriod virada de ano, makePeriod clamping,
 * periodFromQuery fallback, last12MonthsEndingAt janela exata.
 */
import { describe, expect, it } from "vitest";

import {
  MESES_PT,
  getCurrentPeriod,
  last12MonthsEndingAt,
  makePeriod,
  mesIndex,
  normalizeMes,
  periodFromQuery,
  periodKey,
  periodoLabel,
  prevPeriod,
} from "./period";

describe("mesIndex", () => {
  it("case-insensitive: 'Janeiro', 'janeiro', 'JANEIRO' → 0", () => {
    expect(mesIndex("Janeiro")).toBe(0);
    expect(mesIndex("janeiro")).toBe(0);
    expect(mesIndex("JANEIRO")).toBe(0);
  });

  it("tolera espaços nas bordas", () => {
    expect(mesIndex(" Março ")).toBe(2);
    expect(mesIndex("  dezembro\n")).toBe(11);
  });

  it("mês acentuado: Março → 2", () => {
    expect(mesIndex("Março")).toBe(2);
    expect(mesIndex("março")).toBe(2);
  });

  it("retorna -1 para inválido / vazio / nulo", () => {
    expect(mesIndex("Jan")).toBe(-1);
    expect(mesIndex("Marco")).toBe(-1); // sem cedilha
    expect(mesIndex("")).toBe(-1);
    expect(mesIndex(null)).toBe(-1);
    expect(mesIndex(undefined)).toBe(-1);
  });
});

describe("normalizeMes", () => {
  it("retorna Title Case canônico", () => {
    expect(normalizeMes("janeiro")).toBe("Janeiro");
    expect(normalizeMes("MARÇO")).toBe("Março");
    expect(normalizeMes(" dezembro ")).toBe("Dezembro");
  });

  it("retorna null quando inválido", () => {
    expect(normalizeMes("xxx")).toBeNull();
    expect(normalizeMes("")).toBeNull();
    expect(normalizeMes(null)).toBeNull();
  });
});

describe("periodKey", () => {
  it("formato 'YYYY-MM'", () => {
    expect(periodKey({ ano: 2026, mes: "Janeiro" })).toBe("2026-01");
    expect(periodKey({ ano: 2026, mes: "Dezembro" })).toBe("2026-12");
    expect(periodKey({ ano: 2026, mes: "Março" })).toBe("2026-03");
  });

  it("tolera variações de case no mes", () => {
    expect(periodKey({ ano: 2026, mes: "janeiro" })).toBe("2026-01");
    expect(periodKey({ ano: 2026, mes: " MAIO " })).toBe("2026-05");
  });

  it("retorna '' quando faltam dados", () => {
    expect(periodKey({ ano: null, mes: "Janeiro" })).toBe("");
    expect(periodKey({ ano: 2026, mes: null })).toBe("");
    expect(periodKey({ ano: 2026, mes: "Inválido" })).toBe("");
    expect(periodKey({})).toBe("");
  });
});

describe("periodoLabel", () => {
  it("'Mês/Ano' quando ambos presentes", () => {
    expect(periodoLabel({ ano: 2026, mes: "Janeiro" })).toBe("Janeiro/2026");
    expect(periodoLabel({ ano: 2026, mes: "Março" })).toBe("Março/2026");
  });

  it("'Sem período' quando algum falta", () => {
    expect(periodoLabel({ ano: null, mes: "Janeiro" })).toBe("Sem período");
    expect(periodoLabel({ ano: 2026, mes: null })).toBe("Sem período");
    expect(periodoLabel({})).toBe("Sem período");
  });
});

describe("prevPeriod", () => {
  it("Junho/2026 → Maio/2026", () => {
    expect(prevPeriod({ ano: 2026, mes: "Junho" })).toEqual({
      ano: 2026,
      mes: "Maio",
    });
  });

  it("Janeiro/2026 → Dezembro/2025 (vira o ano)", () => {
    expect(prevPeriod({ ano: 2026, mes: "Janeiro" })).toEqual({
      ano: 2025,
      mes: "Dezembro",
    });
  });

  it("aceita mes em qualquer case", () => {
    expect(prevPeriod({ ano: 2026, mes: "MARÇO" })).toEqual({
      ano: 2026,
      mes: "Fevereiro",
    });
  });

  it("mês inválido → null", () => {
    expect(prevPeriod({ ano: 2026, mes: "Jan" })).toBeNull();
    expect(prevPeriod({ ano: 2026, mes: "" })).toBeNull();
  });
});

describe("makePeriod", () => {
  it("expande representações", () => {
    expect(makePeriod(2026, 0)).toEqual({
      ano: 2026,
      mesIdx: 0,
      mesPt: "Janeiro",
      mesNum: "01",
    });
    expect(makePeriod(2026, 11)).toEqual({
      ano: 2026,
      mesIdx: 11,
      mesPt: "Dezembro",
      mesNum: "12",
    });
  });

  it("clampa mesIdx fora de [0, 11]", () => {
    expect(makePeriod(2026, -3).mesIdx).toBe(0);
    expect(makePeriod(2026, 99).mesIdx).toBe(11);
  });
});

describe("periodFromQuery", () => {
  it("retorna o ano/mes informado", () => {
    expect(periodFromQuery({ ano: "2026", mes: "5" })).toEqual(
      makePeriod(2026, 4),
    );
  });

  it("fallback pro mês corrente quando inválido", () => {
    const now = getCurrentPeriod();
    expect(periodFromQuery({ ano: "abc", mes: "5" })).toEqual(now);
    expect(periodFromQuery({ ano: "2026", mes: "13" })).toEqual(now);
    expect(periodFromQuery({})).toEqual(now);
  });
});

describe("last12MonthsEndingAt", () => {
  it("12 meses terminando no informado, do mais antigo ao mais recente", () => {
    const window = last12MonthsEndingAt(makePeriod(2026, 4)); // mai/2026
    expect(window).toHaveLength(12);
    expect(window[0]).toEqual({ ano: 2025, mesIdx: 5 }); // jun/2025
    expect(window[11]).toEqual({ ano: 2026, mesIdx: 4 }); // mai/2026
  });
});

describe("MESES_PT constants", () => {
  it("tem 12 meses, todos Title Case", () => {
    expect(MESES_PT).toHaveLength(12);
    for (const m of MESES_PT) {
      expect(m[0]).toBe(m[0].toUpperCase());
    }
  });
});
