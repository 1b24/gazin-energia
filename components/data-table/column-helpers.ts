/**
 * Helpers puros do data-table — vivem fora do componente "use client" para
 * serem testáveis em Vitest (ambiente node). Mesma estratégia que
 * `lib/actions/export-helpers.ts`.
 */

/**
 * Resolve o valor escalar (string/number/Date/etc) de uma coluna a partir
 * da row, para sort, filter e busca global.
 *
 * IMPORTANTE: os casos especiais (`filial`, `fornecedor`, `abrangenciaFilial`,
 * `usina`) têm que vir ANTES do fallback genérico, porque essas colunas
 * usam `id` que bate com uma chave que armazena um OBJETO relação. Sem o
 * tratamento especial, `record["filial"]` seria `{ id, codigo, ... }` e o
 * sort tentaria comparar objetos — sintoma "clico em ordenar e nada
 * acontece". Regressão recorrente, blindada por teste em column-helpers.test.ts.
 */
export function getOriginalColumnValue<T>(
  row: T,
  columnId: string,
): unknown {
  if (!row || typeof row !== "object") return null;

  const record = row as Record<string, unknown>;

  // Casos especiais — relações que extraem valor escalar canônico.
  if (columnId === "filial") {
    const filial = record.filial as Record<string, unknown> | null | undefined;
    return filial?.codigo ?? filial?.nome ?? record.filialCodigoRaw ?? null;
  }
  if (columnId === "fornecedor") {
    const fornecedor = record.fornecedor as
      | Record<string, unknown>
      | null
      | undefined;
    return fornecedor?.nome ?? record.fornecedorRaw ?? null;
  }
  if (columnId === "abrangenciaFilial") {
    const filial = record.abrangenciaFilial as
      | Record<string, unknown>
      | null
      | undefined;
    return (
      filial?.codigo ?? filial?.nome ?? record.abrangenciaFilialRaw ?? null
    );
  }
  if (columnId === "usina") {
    const usina = record.usina as Record<string, unknown> | null | undefined;
    return usina?.nome ?? record.nomeUsinaRaw ?? null;
  }

  // Fallback genérico — só para colunas custom (id sem accessorKey) cuja
  // chave bate com um valor escalar simples. Casos especiais acima já
  // trataram relações. NÃO mover este return para antes dos ifs especiais.
  if (columnId in record) {
    const v = record[columnId];
    // Se for objeto não-Date, retorna null em vez do objeto puro —
    // comparar objetos no sort do TanStack não funciona.
    if (v && typeof v === "object" && !(v instanceof Date)) return null;
    return v ?? null;
  }
  return null;
}
