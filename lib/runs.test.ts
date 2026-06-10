/**
 * Testes de `groupRuns`/`formatRuns` — base do resumo do calendário de dias
 * e das faixas de destaque (ReferenceArea) do gráfico de geração diária.
 */
import { describe, expect, it } from "vitest";

import { formatRuns, groupRuns } from "./runs";

describe("groupRuns", () => {
  it("agrupa contíguos e separa gaps", () => {
    expect(groupRuns([1, 2, 3, 8, 9])).toEqual([
      { from: 1, to: 3 },
      { from: 8, to: 9 },
    ]);
  });

  it("aceita input fora de ordem e Set", () => {
    expect(groupRuns(new Set([9, 8, 3, 1, 2]))).toEqual([
      { from: 1, to: 3 },
      { from: 8, to: 9 },
    ]);
  });

  it("singletons viram runs de 1", () => {
    expect(groupRuns([5, 7, 9])).toEqual([
      { from: 5, to: 5 },
      { from: 7, to: 7 },
      { from: 9, to: 9 },
    ]);
  });

  it("ignora duplicatas", () => {
    expect(groupRuns([1, 1, 2, 2, 3])).toEqual([{ from: 1, to: 3 }]);
  });

  it("vazio → []", () => {
    expect(groupRuns([])).toEqual([]);
  });
});

describe("formatRuns", () => {
  it("colapsa runs com en-dash e separa por vírgula", () => {
    expect(formatRuns(new Set([1, 2, 3, 8, 9]))).toBe("1–3, 8–9");
    expect(formatRuns([8, 9, 10, 11])).toBe("8–11");
    expect(formatRuns([5, 7, 9])).toBe("5, 7, 9");
    expect(formatRuns([])).toBe("");
  });
});
