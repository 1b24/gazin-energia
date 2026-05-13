/**
 * Testes das máscaras de input. Bug histórico que esse teste blinda:
 * `maskCurrencyBR` era hardcoded em 2 decimais, impossibilitando digitar
 * tarifas de kWh como "0,5305" — a máscara virava "5,3052" e cada dígito
 * deslocava casa (comportamento "calculadora").
 */
import { describe, expect, it } from "vitest";

import { maskCNPJ, maskCurrencyBR, maskDateBR, unmaskCurrencyBR } from "./masks";

describe("maskCurrencyBR — default 2 decimais", () => {
  it("preserva comportamento original (não-breaking)", () => {
    expect(maskCurrencyBR("")).toBe("");
    expect(maskCurrencyBR("1234")).toBe("12,34");
    expect(maskCurrencyBR("12345")).toBe("123,45");
    expect(maskCurrencyBR("123456789")).toBe("1.234.567,89");
  });

  it("descarta não-dígitos", () => {
    expect(maskCurrencyBR("12abc34")).toBe("12,34");
  });

  it("pad com zeros para menos de 3 dígitos", () => {
    expect(maskCurrencyBR("5")).toBe("0,05");
    expect(maskCurrencyBR("50")).toBe("0,50");
    expect(maskCurrencyBR("500")).toBe("5,00");
  });
});

describe("maskCurrencyBR — 4 decimais (tarifas R$/kWh)", () => {
  it("digito a digito desloca casas como esperado", () => {
    expect(maskCurrencyBR("5", 4)).toBe("0,0005");
    expect(maskCurrencyBR("53", 4)).toBe("0,0053");
    expect(maskCurrencyBR("5305", 4)).toBe("0,5305");
    expect(maskCurrencyBR("53052", 4)).toBe("5,3052");
    expect(maskCurrencyBR("530520", 4)).toBe("53,0520");
  });

  it("vazio → vazio", () => {
    expect(maskCurrencyBR("", 4)).toBe("");
  });

  it("formata milhar com 4 decimais", () => {
    expect(maskCurrencyBR("12345678", 4)).toBe("1.234,5678");
  });
});

describe("unmaskCurrencyBR", () => {
  it("inversa de maskCurrencyBR", () => {
    expect(unmaskCurrencyBR("12,34")).toBe(12.34);
    expect(unmaskCurrencyBR("0,5305")).toBe(0.5305);
    expect(unmaskCurrencyBR("1.234,56")).toBe(1234.56);
    expect(unmaskCurrencyBR("1.234.567,89")).toBe(1234567.89);
  });

  it("retorna null para entrada inválida ou vazia", () => {
    expect(unmaskCurrencyBR("")).toBeNull();
    expect(unmaskCurrencyBR("abc")).toBeNull();
  });
});

describe("maskDateBR", () => {
  it("formata progressivamente", () => {
    expect(maskDateBR("")).toBe("");
    expect(maskDateBR("12")).toBe("12");
    expect(maskDateBR("1234")).toBe("12/34");
    expect(maskDateBR("12345678")).toBe("12/34/5678");
  });

  it("descarta dígitos além de 8", () => {
    expect(maskDateBR("12345678999")).toBe("12/34/5678");
  });
});

describe("maskCNPJ", () => {
  it("formata progressivamente", () => {
    expect(maskCNPJ("12")).toBe("12");
    expect(maskCNPJ("12345")).toBe("12.345");
    expect(maskCNPJ("12345678")).toBe("12.345.678");
    expect(maskCNPJ("123456789012")).toBe("12.345.678/9012");
    expect(maskCNPJ("12345678901234")).toBe("12.345.678/9012-34");
  });
});
