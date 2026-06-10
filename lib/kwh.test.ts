/**
 * Testes dos helpers puros de kWh/período — base das agregações do dashboard
 * e candidatos a reuso em client components. Sem mocks: o módulo não importa
 * auth nem banco (essa é a razão de ele existir separado do scope.ts).
 */
import { describe, expect, it } from "vitest";

import {
  decimalToNumber,
  diasNoMes,
  metaMensalGeracao,
  sumDias,
} from "./kwh";

/** Decimal-like mínimo — mesma duck-type que o Prisma Decimal expõe. */
const dec = (n: number) => ({ toNumber: () => n });

describe("sumDias", () => {
  it("soma numbers, Decimal-like e ignora null", () => {
    expect(
      sumDias([{ kwh: 10 }, { kwh: dec(5.5) }, { kwh: null }, { kwh: 4.5 }]),
    ).toBe(20);
  });

  it("lista vazia → 0", () => {
    expect(sumDias([])).toBe(0);
  });
});

describe("decimalToNumber", () => {
  it("null/undefined → 0", () => {
    expect(decimalToNumber(null)).toBe(0);
    expect(decimalToNumber(undefined)).toBe(0);
  });

  it("number passa direto; Decimal-like converte", () => {
    expect(decimalToNumber(42.5)).toBe(42.5);
    expect(decimalToNumber(dec(0.53052))).toBe(0.53052);
  });
});

describe("diasNoMes", () => {
  it("Fevereiro 2026 (não-bissexto) → 28", () => {
    expect(diasNoMes(2026, "Fevereiro")).toBe(28);
  });

  it("Fevereiro 2024 (bissexto) → 29", () => {
    expect(diasNoMes(2024, "Fevereiro")).toBe(29);
  });

  it("Abril → 30; Janeiro → 31", () => {
    expect(diasNoMes(2026, "Abril")).toBe(30);
    expect(diasNoMes(2026, "Janeiro")).toBe(31);
  });

  it("mês desconhecido ou ano null → fallback 31", () => {
    expect(diasNoMes(2026, "Smarch")).toBe(31);
    expect(diasNoMes(null, "Abril")).toBe(31);
    expect(diasNoMes(2026, null)).toBe(31);
  });
});

describe("metaMensalGeracao", () => {
  it("meta diária × dias do mês (Janeiro 2026 = 31)", () => {
    expect(metaMensalGeracao(100, 2026, "Janeiro")).toBe(3100);
  });

  it("aceita Decimal-like (Fevereiro 2026 = 28)", () => {
    expect(metaMensalGeracao(dec(10.5), 2026, "Fevereiro")).toBe(294);
  });

  it("meta null → 0", () => {
    expect(metaMensalGeracao(null, 2026, "Janeiro")).toBe(0);
  });
});
