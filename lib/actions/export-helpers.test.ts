/**
 * Testes dos helpers de export — `isSensitiveKey` e `flattenRelations`.
 * Não cobre as server actions (create/update/etc) — esses exigem mock de
 * Prisma e auth, ficam fora deste escopo (C2 mínimo).
 */
import { describe, expect, it } from "vitest";

// Importa direto de `export-helpers` (puro, sem Next/Prisma). O `crud.ts`
// re-exporta os mesmos símbolos, mas importar dele em ambiente Node quebra
// por causa de `"use server"` + `next/cache`.
import { flattenRelations, isSensitiveKey } from "./export-helpers";

describe("isSensitiveKey", () => {
  it("matches campo senha em qualquer caso", () => {
    expect(isSensitiveKey("senha")).toBe(true);
    expect(isSensitiveKey("Senha")).toBe(true);
    expect(isSensitiveKey("SENHA")).toBe(true);
  });

  it("matches password / token / secret / hash", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("token")).toBe(true);
    expect(isSensitiveKey("secret")).toBe(true);
    expect(isSensitiveKey("hash")).toBe(true);
  });

  it("matches camelCase com prefixo", () => {
    expect(isSensitiveKey("userSenha")).toBe(true);
    expect(isSensitiveKey("passwordHash")).toBe(true);
    expect(isSensitiveKey("apiKey")).toBe(true);
  });

  it("matches snake_case", () => {
    expect(isSensitiveKey("user_senha")).toBe(true);
    expect(isSensitiveKey("api_key")).toBe(true);
    expect(isSensitiveKey("access_key")).toBe(true);
  });

  it("não confunde com campos legítimos", () => {
    expect(isSensitiveKey("usuario")).toBe(false);
    expect(isSensitiveKey("valor")).toBe(false);
    expect(isSensitiveKey("valorTotal")).toBe(false);
    expect(isSensitiveKey("nome")).toBe(false);
    expect(isSensitiveKey("cnpj")).toBe(false);
    // "code" não está na lista; "ascending" e similares também não.
    expect(isSensitiveKey("codigo")).toBe(false);
  });

  it("string vazia não é sensível", () => {
    expect(isSensitiveKey("")).toBe(false);
  });
});

describe("flattenRelations", () => {
  it("achata objeto-relação em colunas `<key>_<sub>`", () => {
    const input = [
      {
        id: "c1",
        valor: 100,
        filial: { id: "f1", codigo: "001", mercadoLivre: "ABC" },
      },
    ];
    const out = flattenRelations(input);
    expect(out).toEqual([
      {
        id: "c1",
        valor: 100,
        filial_id: "f1",
        filial_codigo: "001",
        filial_mercadoLivre: "ABC",
      },
    ]);
  });

  it("preserva Date no objeto raiz e em relações", () => {
    const d = new Date("2026-05-01");
    const input = [
      {
        id: "x",
        criadoEm: d,
        filial: { id: "f", dataCriacao: d },
      },
    ];
    const out = flattenRelations(input);
    expect(out[0].criadoEm).toBe(d);
    expect(out[0].filial_dataCriacao).toBe(d);
  });

  it("filtra campos sensíveis no nível raiz", () => {
    const input = [
      { id: "f1", codigo: "001", senha: "secreta", usuario: "admin" },
    ];
    const out = flattenRelations(input);
    expect(out[0]).not.toHaveProperty("senha");
    expect(out[0]).toEqual({ id: "f1", codigo: "001", usuario: "admin" });
  });

  it("filtra campos sensíveis dentro de relações", () => {
    const input = [
      {
        id: "c1",
        filial: { id: "f1", codigo: "001", senha: "leak", usuario: "ok" },
      },
    ];
    const out = flattenRelations(input);
    expect(out[0]).not.toHaveProperty("filial_senha");
    expect(out[0]).toEqual({
      id: "c1",
      filial_id: "f1",
      filial_codigo: "001",
      filial_usuario: "ok",
    });
  });

  it("ignora aninhamento profundo (mais de 1 nível) — sem cascata", () => {
    const input = [
      {
        id: "c1",
        filial: {
          id: "f1",
          // sub-relação dentro de relação: NÃO deve descer
          empresa: { id: "e1", nome: "Gazin" },
        },
      },
    ];
    const out = flattenRelations(input);
    // filial_id ok; filial_empresa não desce, foi pulado
    expect(out[0]).toEqual({ id: "c1", filial_id: "f1" });
  });

  it("arrays viram contagem `<key>_count`", () => {
    const input = [
      {
        id: "u1",
        nome: "Usina A",
        geracoes: [1, 2, 3, 4, 5],
      },
    ];
    const out = flattenRelations(input);
    expect(out[0]).toEqual({ id: "u1", nome: "Usina A", geracoes_count: 5 });
  });

  it("null em relação não quebra (vira no-op)", () => {
    const input = [{ id: "c1", filial: null, valor: 50 }];
    const out = flattenRelations(input);
    // `filial: null` é tratado como valor primitivo null (não desce).
    expect(out[0]).toEqual({ id: "c1", filial: null, valor: 50 });
  });

  it("processa múltiplas rows independentemente", () => {
    const input = [
      { id: "a", filial: { id: "f1", codigo: "001" } },
      { id: "b", filial: { id: "f2", codigo: "002" } },
    ];
    const out = flattenRelations(input);
    expect(out).toHaveLength(2);
    expect(out[0].filial_id).toBe("f1");
    expect(out[1].filial_id).toBe("f2");
  });
});
