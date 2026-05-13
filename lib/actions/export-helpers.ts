/**
 * Helpers puros usados por `bulkExport` em `lib/actions/crud.ts`. Vivem
 * separados para que sejam testáveis em ambiente Node — `crud.ts` usa
 * `"use server"` e importa `next/cache`, o que quebra `import` direto em
 * Vitest. Aqui não há dependência de runtime Next nem Prisma.
 */

/**
 * Campos NUNCA exportados nem expostos via API — defesa em profundidade.
 *
 * Borda esquerda aceita: início do campo, underscore, OU letra (a flag `i`
 * faz `[A-Z]` matchar `[A-Za-z]`, cobrindo transição camelCase `xSenha`).
 * Variantes snake_case dos compostos (`access_key`, `api_key`) tratadas via
 * `_?` opcional no meio.
 *
 * Alinhado com `lib/audit.ts` — qualquer extensão aqui deve refletir lá.
 */
export const SENSITIVE_FIELD_PATTERN =
  /(?:^|_|[A-Z])(senha|password|hash|token|secret|access_?key|secret_?key|api_?key)(?=$|_|[A-Z])/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(key);
}

/**
 * Achata relações nesteadas em colunas planas (`filial_codigo`, ...) — XLSX
 * `json_to_sheet` não sabe lidar com objetos aninhados, escreveria
 * "[object Object]" na célula. Aplicado APÓS `serializePrisma`, então não
 * encontra Decimal/BigInt aqui.
 *
 * Regras:
 *  - campo sensível (qualquer nível) é descartado;
 *  - aninhamento limitado a 1 nível (relação direta); sub-relação é pulada;
 *  - array vira `<key>_count` (contagem), evitando célula opaca no XLSX;
 *  - Date é preservada (XLSX e CSV lidam OK).
 */
export function flattenRelations(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (isSensitiveKey(k)) continue;
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        !(v instanceof Date)
      ) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          if (isSensitiveKey(k2)) continue;
          if (
            v2 &&
            typeof v2 === "object" &&
            !Array.isArray(v2) &&
            !(v2 instanceof Date)
          ) {
            continue;
          }
          if (Array.isArray(v2)) continue;
          out[`${k}_${k2}`] = v2;
        }
      } else if (Array.isArray(v)) {
        out[`${k}_count`] = v.length;
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}
