/**
 * Mapper Excel ↔ Injecao.
 *
 * Espelha `lib/excel/consumo-mapper.ts` com 2 diferenças principais:
 *
 *  - **2 FKs** (não 1): `filialId` (resolvido por código) E `fornecedorId`
 *    (resolvido por nome). Fornecedor é opcional no schema, então linhas
 *    podem ficar sem fornecedor. IDs ocultos suportam round-trip de update.
 *  - **6 colunas numéricas** (não 11): kWh + R$.
 *
 * Resto do contrato é idêntico: headers oficiais fixos, parse decimal
 * flexível, all-or-nothing na camada da action.
 */
import type { Serialized } from "@/lib/serialize";
import type { Filial, Fornecedor, Injecao } from "@prisma/client";
import { MESES_PT } from "@/lib/period";

import { formatDecimal, parseDecimalFlexible } from "./common";

/** Nome oficial das colunas — contrato export ↔ import. NÃO renomear. */
export const INJECAO_EXCEL_COLUMNS = [
  "ID",
  "Filial ID",
  "Filial Código",
  "Filial Mercado Livre",
  "Fornecedor ID",
  "Fornecedor Nome",
  "Ano",
  "Mês",
  "UC",
  "Município",
  "Consumo P (kWh)",
  "Consumo P1 (kWh)",
  "Consumo total (kWh)",
  "Valor (R$)",
  "Valor 1 (R$)",
  "Valor 2 (R$)",
] as const;

export type InjecaoExcelColumn = (typeof INJECAO_EXCEL_COLUMNS)[number];

const COLUMN_SET = new Set<string>(INJECAO_EXCEL_COLUMNS);

/** Colunas que saem ocultas no XLSX (round-trip, sem poluir UX). */
export const INJECAO_HIDDEN_COLUMNS = new Set<InjecaoExcelColumn>([
  "ID",
  "Filial ID",
  "Fornecedor ID",
]);

/** Set pra match O(1) do nome do mês — normalizado lowercase. */
const MESES_LOWERCASE = new Set(MESES_PT.map((m) => m.toLowerCase()));
const MES_CANONICAL: Record<string, string> = Object.fromEntries(
  MESES_PT.map((m) => [m.toLowerCase(), m]),
);

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------

export type InjecaoExportRow = Pick<
  Serialized<Injecao>,
  | "id"
  | "filialId"
  | "fornecedorId"
  | "ano"
  | "mes"
  | "uc"
  | "municipio"
  | "consumoKwhP"
  | "consumoKwhP1"
  | "consumoTotalKwh"
  | "valor"
  | "valor1"
  | "valor2"
> & {
  filial: Pick<Filial, "codigo" | "mercadoLivre"> | null;
  fornecedor: Pick<Fornecedor, "nome"> | null;
};

export function injecaoToExcelRow(
  i: InjecaoExportRow,
): Record<InjecaoExcelColumn, string | number | null> {
  return {
    ID: i.id,
    "Filial ID": i.filialId ?? null,
    "Filial Código": i.filial?.codigo ?? null,
    "Filial Mercado Livre": i.filial?.mercadoLivre ?? null,
    "Fornecedor ID": i.fornecedorId ?? null,
    "Fornecedor Nome": i.fornecedor?.nome ?? null,
    Ano: i.ano ?? null,
    "Mês": i.mes ?? null,
    UC: i.uc ?? null,
    "Município": i.municipio ?? null,
    "Consumo P (kWh)": formatDecimal(i.consumoKwhP),
    "Consumo P1 (kWh)": formatDecimal(i.consumoKwhP1),
    "Consumo total (kWh)": formatDecimal(i.consumoTotalKwh),
    "Valor (R$)": formatDecimal(i.valor),
    "Valor 1 (R$)": formatDecimal(i.valor1),
    "Valor 2 (R$)": formatDecimal(i.valor2),
  };
}

// ----------------------------------------------------------------------------
// Import — validação de headers e parse por linha
// ----------------------------------------------------------------------------

export interface RowError {
  /** Linha 1-based (header é 1, primeira de dados é 2). */
  row: number;
  field?: string;
  value?: unknown;
  message: string;
  expected?: string;
}

export function validateHeaders(headers: string[]): RowError[] {
  const errors: RowError[] = [];
  const present = new Set(headers);
  for (const col of INJECAO_EXCEL_COLUMNS) {
    if (!present.has(col)) {
      errors.push({
        row: 1,
        field: col,
        message: `Coluna obrigatória ausente: "${col}".`,
        expected: `Coluna "${col}" no header.`,
      });
    }
  }
  for (const h of headers) {
    if (!COLUMN_SET.has(h)) {
      errors.push({
        row: 1,
        field: h,
        message: `Coluna não reconhecida: "${h}".`,
        expected: `Apenas as colunas do modelo exportado pelo sistema.`,
      });
    }
  }
  return errors;
}

export function excelRowToInjecao(
  raw: Record<string, unknown>,
  rowNumber: number,
): {
  data: Record<string, unknown>;
  id: string | null;
  filialId: string | null;
  filialCodigo: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  errors: RowError[];
} {
  const errors: RowError[] = [];

  const id = pickString(raw, "ID");
  const filialId = pickString(raw, "Filial ID");
  const filialCodigo = pickString(raw, "Filial Código");
  const fornecedorId = pickString(raw, "Fornecedor ID");
  const fornecedorNome = pickString(raw, "Fornecedor Nome");

  // Ano: int 1900-2100.
  let ano: number | null = null;
  const anoRaw = raw["Ano"];
  if (anoRaw != null && anoRaw !== "") {
    const n =
      typeof anoRaw === "number" ? anoRaw : Number(String(anoRaw).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1900 || n > 2100) {
      errors.push({
        row: rowNumber,
        field: "Ano",
        value: anoRaw,
        message: `Ano inválido.`,
        expected: `Número inteiro entre 1900 e 2100.`,
      });
    } else {
      ano = n;
    }
  }

  // Mês: enum PT-BR case-insensitive.
  let mes: string | null = null;
  const mesRaw = pickString(raw, "Mês");
  if (mesRaw) {
    const lower = mesRaw.toLowerCase();
    if (!MESES_LOWERCASE.has(lower)) {
      errors.push({
        row: rowNumber,
        field: "Mês",
        value: mesRaw,
        message: `Mês inválido.`,
        expected: `Nome em pt-BR (Janeiro, Fevereiro, ..., Dezembro).`,
      });
    } else {
      mes = MES_CANONICAL[lower];
    }
  }

  // 6 colunas numéricas — todas com a mesma heurística.
  const numericFields: Array<{ col: InjecaoExcelColumn; key: string }> = [
    { col: "Consumo P (kWh)", key: "consumoKwhP" },
    { col: "Consumo P1 (kWh)", key: "consumoKwhP1" },
    { col: "Consumo total (kWh)", key: "consumoTotalKwh" },
    { col: "Valor (R$)", key: "valor" },
    { col: "Valor 1 (R$)", key: "valor1" },
    { col: "Valor 2 (R$)", key: "valor2" },
  ];

  const numericData: Record<string, number | null> = {};
  for (const { col, key } of numericFields) {
    const rawVal = raw[col];
    if (rawVal == null || rawVal === "") {
      numericData[key] = null;
      continue;
    }
    const n = parseDecimalFlexible(rawVal);
    if (!Number.isFinite(n)) {
      errors.push({
        row: rowNumber,
        field: col,
        value: rawVal,
        message: `Valor numérico inválido.`,
        expected: `Número decimal (pode usar ponto ou vírgula como separador).`,
      });
      numericData[key] = null;
    } else if (n < 0) {
      errors.push({
        row: rowNumber,
        field: col,
        value: rawVal,
        message: `Valor não pode ser negativo.`,
        expected: `Número ≥ 0.`,
      });
      numericData[key] = null;
    } else {
      numericData[key] = n;
    }
  }

  return {
    id,
    filialId,
    filialCodigo,
    fornecedorId,
    fornecedorNome,
    data: {
      ano,
      mes,
      uc: pickString(raw, "UC"),
      municipio: pickString(raw, "Município"),
      // `filialId` e `fornecedorId` preenchidos pela action depois do lookup.
      filialId,
      fornecedorId,
      ...numericData,
    },
    errors,
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function pickString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Re-export — API pública preservada; implementação agora em ./common.
export { parseDecimalFlexible } from "./common";
