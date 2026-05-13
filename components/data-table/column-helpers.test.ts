/**
 * Testa `getOriginalColumnValue` — função que resolve o valor escalar de
 * uma coluna pra sort/filter do TanStack Table.
 *
 * Bug histórico recorrente: ordem dos ifs ficou trocada e o fallback
 * genérico capturava `record["filial"]` (objeto) antes do tratamento
 * especial. Resultado: clicar em "ordenar" na coluna filial não fazia
 * nada. Este teste blinda contra regressão.
 */
import { describe, expect, it } from "vitest";

import { getOriginalColumnValue } from "./column-helpers";

describe("getOriginalColumnValue — relações", () => {
  it("filial: extrai codigo do objeto relação (não retorna o objeto)", () => {
    const row = {
      id: "c1",
      filial: { id: "f1", codigo: "1917.1", mercadoLivre: "Filial A" },
    };
    const v = getOriginalColumnValue(row, "filial");
    expect(v).toBe("1917.1");
    expect(typeof v).toBe("string");
  });

  it("filial: fallback para mercadoLivre/nome quando codigo é null", () => {
    expect(
      getOriginalColumnValue(
        { filial: { codigo: null, nome: "Filial X" } },
        "filial",
      ),
    ).toBe("Filial X");
  });

  it("filial: usa filialCodigoRaw quando relação está null", () => {
    expect(
      getOriginalColumnValue(
        { filial: null, filialCodigoRaw: "Auto Posto 04900" },
        "filial",
      ),
    ).toBe("Auto Posto 04900");
  });

  it("filial: null se nada disponível", () => {
    expect(getOriginalColumnValue({ filial: null }, "filial")).toBeNull();
    expect(getOriginalColumnValue({}, "filial")).toBeNull();
  });

  it("fornecedor: extrai nome do objeto", () => {
    expect(
      getOriginalColumnValue(
        { fornecedor: { nome: "GR ENERGY", id: "abc" } },
        "fornecedor",
      ),
    ).toBe("GR ENERGY");
  });

  it("fornecedor: usa fornecedorRaw quando relação é null", () => {
    expect(
      getOriginalColumnValue(
        { fornecedor: null, fornecedorRaw: "Cotesa Energia" },
        "fornecedor",
      ),
    ).toBe("Cotesa Energia");
  });

  it("usina: extrai nome", () => {
    expect(
      getOriginalColumnValue(
        { usina: { nome: "Usina Solar 1", id: "u1" } },
        "usina",
      ),
    ).toBe("Usina Solar 1");
  });

  it("abrangenciaFilial: extrai codigo", () => {
    expect(
      getOriginalColumnValue(
        { abrangenciaFilial: { codigo: "002", nome: null } },
        "abrangenciaFilial",
      ),
    ).toBe("002");
  });
});

describe("getOriginalColumnValue — fallback genérico", () => {
  it("retorna valor escalar simples", () => {
    expect(getOriginalColumnValue({ uc: "12345" }, "uc")).toBe("12345");
    expect(getOriginalColumnValue({ ano: 2026 }, "ano")).toBe(2026);
  });

  it("preserva Date no fallback (Date é objeto válido pra sort)", () => {
    const d = new Date("2026-05-13");
    expect(getOriginalColumnValue({ criadoEm: d }, "criadoEm")).toBe(d);
  });

  it("retorna null para objeto não-Date (não devolve o objeto puro)", () => {
    // Caso de uma coluna custom com id que bate com chave-objeto não-listada.
    // Sem essa guarda, o sort tentaria comparar objetos e falharia silente.
    expect(
      getOriginalColumnValue(
        { qualquer: { nested: "x" } },
        "qualquer",
      ),
    ).toBeNull();
  });

  it("retorna null para chave inexistente", () => {
    expect(getOriginalColumnValue({}, "naoExiste")).toBeNull();
  });

  it("retorna null para row null/undefined/primitivo", () => {
    expect(getOriginalColumnValue(null, "filial")).toBeNull();
    expect(getOriginalColumnValue(undefined, "filial")).toBeNull();
    expect(getOriginalColumnValue("string-not-object" as unknown, "filial")).toBeNull();
  });
});

describe("getOriginalColumnValue — proteção contra regressão", () => {
  it("caso especial filial tem PRIORIDADE sobre fallback genérico", () => {
    // Este é o bug recorrente: se o fallback genérico vier antes,
    // record["filial"] (objeto) seria devolvido e o sort quebraria.
    // Garantir que a função SEMPRE extrai o escalar canônico.
    const row = {
      filial: { id: "f1", codigo: "001", mercadoLivre: "A", uf: "PR" },
    };
    const v = getOriginalColumnValue(row, "filial");
    expect(typeof v).not.toBe("object"); // ← se quebrar, sort não vai sortar
    expect(v).toBe("001");
  });
});
