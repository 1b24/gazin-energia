/**
 * Testes dos helpers de escopo de `lib/dashboard/scope.ts` — `scopeWhere` é a
 * base do filtro filial/UF de TODAS as agregações do dashboard.
 *
 * `@/lib/auth` e `@/lib/db` são mockados: o módulo os importa para `getDb`
 * (não testado aqui — depende de sessão/banco). Os helpers puros de kWh
 * (`sumDias` etc.) vivem em `lib/kwh.ts` com testes próprios sem mock.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ scopedPrisma: vi.fn() }));

import { concessionariaNome, scopeWhere } from "./scope";

describe("scopeWhere", () => {
  it("self: filtros viram colunas diretas", () => {
    expect(scopeWhere("self", "f1", "MS")).toEqual({
      filialId: "f1",
      uf: "MS",
    });
  });

  it("usina: aninha em { usina: {...} } e omite quando vazio", () => {
    expect(scopeWhere("usina", "f1", "PR")).toEqual({
      usina: { filialId: "f1", uf: "PR" },
    });
    // Sem filtro nenhum, não pode emitir `usina: {}` — viraria join inútil.
    expect(scopeWhere("usina")).toEqual({});
  });

  it("filial: filialId direto, uf via relação", () => {
    expect(scopeWhere("filial", "f1", "MS")).toEqual({
      filialId: "f1",
      filial: { uf: "MS" },
    });
  });

  it("sem filtros → objeto vazio (não restringe a query)", () => {
    expect(scopeWhere("self")).toEqual({});
    expect(scopeWhere("filial")).toEqual({});
  });
});

describe("concessionariaNome", () => {
  it("prioriza fornecedor.nome sobre fornecedorRaw", () => {
    expect(
      concessionariaNome({
        fornecedor: { nome: "GR ENERGY" },
        fornecedorRaw: "gr energy ltda",
      }),
    ).toBe("GR ENERGY");
  });

  it("cai pro raw quando FK ausente; aplica trim", () => {
    expect(
      concessionariaNome({ fornecedor: null, fornecedorRaw: "  SERENA  " }),
    ).toBe("SERENA");
  });

  it("nome vazio/whitespace não mascara o raw", () => {
    expect(
      concessionariaNome({ fornecedor: { nome: "  " }, fornecedorRaw: "BOM FUTURO" }),
    ).toBe("BOM FUTURO");
  });

  it("tudo ausente → string vazia", () => {
    expect(concessionariaNome({})).toBe("");
  });
});
