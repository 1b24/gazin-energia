/**
 * Testes de `serializePrisma` — borda RSC→Client. Já causou bug (Decimal
 * vazando do bulkExport em /injecao). Cobertura mínima:
 *  - Decimal → number (duck-type e instance).
 *  - Date preserved.
 *  - Arrays e objetos aninhados.
 *  - null/undefined pass-through.
 */
import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { serializePrisma } from "./serialize";

describe("serializePrisma", () => {
  it("converts Decimal to number", () => {
    expect(serializePrisma(new Decimal("3.14"))).toBe(3.14);
    expect(serializePrisma(new Decimal("0"))).toBe(0);
    expect(serializePrisma(new Decimal("-1.5"))).toBe(-1.5);
  });

  it("converts duck-typed Decimal-like (foreign instance)", () => {
    // Simula um Decimal vindo de outra cópia da lib (caso real Prisma 7).
    const foreign = {
      toNumber() {
        return 42.5;
      },
    };
    expect(serializePrisma(foreign)).toBe(42.5);
  });

  it("preserves Date instances (identity, não cópia)", () => {
    const d = new Date("2026-05-12T08:00:00Z");
    expect(serializePrisma(d)).toBe(d);
  });

  it("returns null/undefined unchanged", () => {
    expect(serializePrisma(null)).toBeNull();
    expect(serializePrisma(undefined)).toBeUndefined();
  });

  it("returns primitives unchanged", () => {
    expect(serializePrisma("text")).toBe("text");
    expect(serializePrisma(42)).toBe(42);
    expect(serializePrisma(true)).toBe(true);
    expect(serializePrisma(false)).toBe(false);
  });

  it("walks arrays recursively", () => {
    const input = [new Decimal("1"), null, new Decimal("2.5"), "ok"];
    expect(serializePrisma(input)).toEqual([1, null, 2.5, "ok"]);
  });

  it("walks objects recursively, preservando estrutura", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    const input = {
      id: "abc",
      valor: new Decimal("100.50"),
      criadoEm: d,
      filial: {
        id: "f1",
        consumo: new Decimal("50"),
      },
      nada: null,
    };
    const out = serializePrisma(input);
    expect(out).toEqual({
      id: "abc",
      valor: 100.5,
      criadoEm: d,
      filial: { id: "f1", consumo: 50 },
      nada: null,
    });
  });

  it("não confunde objeto sem toNumber com Decimal", () => {
    const input = { id: "x", nome: "y" };
    expect(serializePrisma(input)).toEqual({ id: "x", nome: "y" });
  });

  it("trata objeto com toNumber que retorna não-number como objeto comum", () => {
    // Defesa contra falso positivo: se toNumber() não retorna number,
    // não trata como Decimal.
    const fake = {
      toNumber() {
        return "not-a-number";
      },
      outroCampo: 1,
    };
    const result = serializePrisma(fake);
    // Resultado deve ser um objeto, não a string.
    expect(typeof result).toBe("object");
    expect(result).toMatchObject({ outroCampo: 1 });
  });
});
