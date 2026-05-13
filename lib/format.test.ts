/**
 * Testes dos formatters de UI (null-safe). Cobertura mínima:
 *  - fallback "—" para null/undefined/NaN/Infinity.
 *  - semântica de fmtPct (espera 0-100, NÃO 0-1) — bug histórico onde Consumo
 *    passava fração e Geração/Injeção passavam percentual.
 *  - encoding correto (sem "â€”" mojibake).
 */
import { describe, expect, it } from "vitest";

import {
  fmtBRL,
  fmtCompact,
  fmtInt,
  fmtKwh,
  fmtPct,
  fmtRate,
} from "./format";

describe("fmtKwh", () => {
  it("2 casas decimais com separadores pt-BR", () => {
    expect(fmtKwh(1234.5)).toBe("1.234,50");
    expect(fmtKwh(0)).toBe("0,00");
    expect(fmtKwh(0.5)).toBe("0,50");
  });

  it("retorna '—' para null/undefined/NaN/Infinity", () => {
    expect(fmtKwh(null)).toBe("—");
    expect(fmtKwh(undefined)).toBe("—");
    expect(fmtKwh(NaN)).toBe("—");
    expect(fmtKwh(Infinity)).toBe("—");
  });
});

describe("fmtBRL", () => {
  it("moeda BRL com símbolo", () => {
    expect(fmtBRL(1234.5)).toMatch(/R\$\s*1\.234,50/);
    expect(fmtBRL(0)).toMatch(/R\$\s*0,00/);
  });

  it("retorna '—' para null", () => {
    expect(fmtBRL(null)).toBe("—");
    expect(fmtBRL(undefined)).toBe("—");
  });
});

describe("fmtInt / fmtCompact", () => {
  it("0 casas decimais", () => {
    expect(fmtInt(1234.7)).toBe("1.235"); // arredonda
    expect(fmtCompact(1234.7)).toBe("1.235");
    expect(fmtInt(0)).toBe("0");
  });

  it("null → '—'", () => {
    expect(fmtInt(null)).toBe("—");
    expect(fmtCompact(undefined)).toBe("—");
  });
});

describe("fmtPct", () => {
  it("espera percentual (0-100), não fração (0-1)", () => {
    // Convenção pós Step 5 do refactor 2026-05-foundations.
    expect(fmtPct(50)).toBe("50,0%");
    expect(fmtPct(100)).toBe("100,0%");
    expect(fmtPct(0)).toBe("0,0%");
    expect(fmtPct(33.33)).toBe("33,3%");
  });

  it("aceita negativo e maior que 100", () => {
    expect(fmtPct(-10)).toBe("-10,0%");
    expect(fmtPct(150)).toBe("150,0%");
  });

  it("'—' para null/Infinity", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(Infinity)).toBe("—");
    expect(fmtPct(NaN)).toBe("—");
  });
});

describe("fmtRate", () => {
  it("formata como R$ X,XX/kWh", () => {
    expect(fmtRate(1.2)).toMatch(/R\$\s*1,20\/kWh/);
    expect(fmtRate(0.45)).toMatch(/R\$\s*0,45\/kWh/);
  });

  it("usa em-dash '—' (não mojibake 'â€”')", () => {
    expect(fmtRate(null)).toBe("—");
    expect(fmtRate(undefined)).toBe("—");
    expect(fmtRate(NaN)).toBe("—");
    expect(fmtRate(null)).not.toContain("â");
  });
});
