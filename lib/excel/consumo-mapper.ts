/**
 * Mapper Excel ↔ Consumo.
 *
 * Espelha `lib/excel/filial-mapper.ts` (mesmo contrato de colunas oficiais)
 * mas com as diferenças do Consumo:
 *
 *  - **FK obrigatória**: `filialId` precisa de uma referência humana. Usamos
 *    coluna "Filial Código" (visível, editável) + "Filial ID" (oculta, para
 *    round-trip). A action faz lookup `código → id` antes do parse final.
 *  - **13 colunas numéricas** (kWh + R$): todas com heurística decimal
 *    flexível (ponto OU vírgula).
 *  - **Mês como enum PT-BR** (`Janeiro`..`Dezembro`), salvo como o banco.
 *  - **Sem unicidade composta no banco**: matching pra detectar duplicata
 *    fica por conta do caller (action), não do mapper.
 *  - **`arquivoFatura` pulado**: upload PDF/imagem fica no fluxo individual.
 */
import type { Serialized } from "@/lib/serialize";
import type { Consumo, Filial } from "@prisma/client";
import { MESES_PT } from "@/lib/period";

/** Nome oficial das colunas — contrato export ↔ import. NÃO renomear. */
export const CONSUMO_EXCEL_COLUMNS = [
  "ID",
  "Filial ID",
  "Filial Código",
  "Filial Mercado Livre",
  "Ano",
  "Mês",
  "UC",
  "Município",
  "Status Anexo",
  "Consumo P (kWh)",
  "Consumo FP (kWh)",
  "Consumo total (kWh)",
  "Injeção recebida (kWh)",
  "Valor P (R$)",
  "Valor FP (R$)",
  "Valor consumo total (R$)",
  "Valor injeção recebida (R$)",
  "Valor total da fatura (R$)",
  "Multas/juros/atraso (R$)",
  "Outras multas (R$)",
] as const;

export type ConsumoExcelColumn = (typeof CONSUMO_EXCEL_COLUMNS)[number];

const COLUMN_SET = new Set<string>(CONSUMO_EXCEL_COLUMNS);

/** Colunas que saem ocultas no XLSX (round-trip, sem poluir UX). */
export const CONSUMO_HIDDEN_COLUMNS = new Set<ConsumoExcelColumn>([
  "ID",
  "Filial ID",
]);

/** Set pra match O(1) do nome do mês — normalizado lowercase. */
const MESES_LOWERCASE = new Set(MESES_PT.map((m) => m.toLowerCase()));
/** Map de lowercase → forma canônica salva no banco ("Janeiro" etc.). */
const MES_CANONICAL: Record<string, string> = Object.fromEntries(
  MESES_PT.map((m) => [m.toLowerCase(), m]),
);

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------

export type ConsumoExportRow = Pick<
  Serialized<Consumo>,
  | "id"
  | "filialId"
  | "ano"
  | "mes"
  | "uc"
  | "municipio"
  | "statusAnexo"
  | "consumoKwhP"
  | "consumoKwhFp"
  | "consumoTotal"
  | "injecaoRecebida"
  | "valor"
  | "valor1"
  | "valor2"
  | "valor3"
  | "valorTotalFatura"
  | "multasJurosAtraso"
  | "outrasMultas"
> & {
  filial: Pick<Filial, "codigo" | "mercadoLivre"> | null;
};

/** Constrói uma linha da planilha a partir do Consumo serializado. */
export function consumoToExcelRow(
  c: ConsumoExportRow,
): Record<ConsumoExcelColumn, string | number | null> {
  return {
    ID: c.id,
    "Filial ID": c.filialId ?? null,
    "Filial Código": c.filial?.codigo ?? null,
    "Filial Mercado Livre": c.filial?.mercadoLivre ?? null,
    Ano: c.ano ?? null,
    "Mês": c.mes ?? null,
    UC: c.uc ?? null,
    "Município": c.municipio ?? null,
    "Status Anexo": c.statusAnexo ?? null,
    "Consumo P (kWh)": formatDecimal(c.consumoKwhP),
    "Consumo FP (kWh)": formatDecimal(c.consumoKwhFp),
    "Consumo total (kWh)": formatDecimal(c.consumoTotal),
    "Injeção recebida (kWh)": formatDecimal(c.injecaoRecebida),
    "Valor P (R$)": formatDecimal(c.valor),
    "Valor FP (R$)": formatDecimal(c.valor1),
    "Valor consumo total (R$)": formatDecimal(c.valor2),
    "Valor injeção recebida (R$)": formatDecimal(c.valor3),
    "Valor total da fatura (R$)": formatDecimal(c.valorTotalFatura),
    "Multas/juros/atraso (R$)": formatDecimal(c.multasJurosAtraso),
    "Outras multas (R$)": formatDecimal(c.outrasMultas),
  };
}

/** Decimal → string com ponto (`1234.56`). null/undefined → null. */
function formatDecimal(v: unknown): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
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

/**
 * Valida que os headers da planilha batem EXATAMENTE com o contrato.
 * Mesma regra do filial-mapper: headers extras/faltantes = erro pré-import.
 */
export function validateHeaders(headers: string[]): RowError[] {
  const errors: RowError[] = [];
  const present = new Set(headers);
  for (const col of CONSUMO_EXCEL_COLUMNS) {
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

export interface ParsedConsumoRow {
  row: number;
  /** ID do Consumo. null = create, presente = update. */
  id: string | null;
  /** ID da Filial — vem da coluna oculta OU resolvido por código depois. */
  filialId: string | null;
  /** Código da filial digitado pelo user (para lookup). */
  filialCodigo: string | null;
  /** Payload bruto pra `consumoSchema.parse`. `filialId` é preenchido na fase 3. */
  data: Record<string, unknown>;
}

/**
 * Converte uma linha da planilha em payload bruto + erros estruturais.
 *
 * NÃO resolve `filialId` por código aqui — fica pra fase 3 da action (precisa
 * de acesso ao DB). O mapper deixa `filialCodigo` no struct retornado pra
 * caller usar no lookup.
 */
export function excelRowToConsumo(
  raw: Record<string, unknown>,
  rowNumber: number,
): {
  data: ParsedConsumoRow["data"];
  id: string | null;
  filialId: string | null;
  filialCodigo: string | null;
  errors: RowError[];
} {
  const errors: RowError[] = [];

  const id = pickString(raw, "ID");
  const filialId = pickString(raw, "Filial ID");
  const filialCodigo = pickString(raw, "Filial Código");

  // Ano: int positivo (4 dígitos esperado, mas aceita mais por flexibilidade).
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

  // Mês: enum PT-BR. Aceita case-insensitive, salva no formato canônico.
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

  // 13 colunas numéricas — todas com a mesma heurística.
  const numericFields: Array<{ col: ConsumoExcelColumn; key: string }> = [
    { col: "Consumo P (kWh)", key: "consumoKwhP" },
    { col: "Consumo FP (kWh)", key: "consumoKwhFp" },
    { col: "Consumo total (kWh)", key: "consumoTotal" },
    { col: "Injeção recebida (kWh)", key: "injecaoRecebida" },
    { col: "Valor P (R$)", key: "valor" },
    { col: "Valor FP (R$)", key: "valor1" },
    { col: "Valor consumo total (R$)", key: "valor2" },
    { col: "Valor injeção recebida (R$)", key: "valor3" },
    { col: "Valor total da fatura (R$)", key: "valorTotalFatura" },
    { col: "Multas/juros/atraso (R$)", key: "multasJurosAtraso" },
    { col: "Outras multas (R$)", key: "outrasMultas" },
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
    data: {
      ano,
      mes,
      uc: pickString(raw, "UC"),
      municipio: pickString(raw, "Município"),
      statusAnexo: pickString(raw, "Status Anexo"),
      // `filialId` é preenchido pela action depois do lookup por código.
      filialId,
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

/**
 * Parser decimal flexível — aceita ponto OU vírgula como separador decimal,
 * com fallback inteligente quando ambos aparecem. Igual ao
 * `parseDecimalPercent` do filial-mapper mas sem o `%`.
 */
export function parseDecimalFlexible(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return Number.NaN;

  const raw = String(v).trim().replace(/\s/g, "").replace(/R\$/i, "");
  if (raw === "") return Number.NaN;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    // Último separador é o decimal (BR: 1.234,56 | US: 1,234.56)
    const commaIsDecimal = raw.lastIndexOf(",") > raw.lastIndexOf(".");
    normalized = commaIsDecimal
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}
