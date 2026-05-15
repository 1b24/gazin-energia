/**
 * Mapper Excel ↔ Filial.
 *
 * Contrato: os nomes de coluna usados pela exportação são os mesmos aceitos
 * pela importação. Se o usuário renomear no Excel, a importação falha com
 * mensagem clara antes de tocar em qualquer linha.
 *
 * Convenções:
 *  - `senha` NUNCA é exportada (denylist em lib/actions/export-helpers).
 *  - CNPJ vai mascarado pra evitar Excel mangle (notação científica).
 *  - Datas vão como string `dd/mm/yyyy` (Excel não tenta reinterpretar).
 *  - Enums vão como label PT-BR (`B3 Optante`) com mapeamento bidirecional —
 *    o valor do enum interno (`B3_optante`) nunca atravessa pro usuário.
 *  - Coluna "ID" sai oculta no XLSX: continua presente pra round-trip de
 *    update, mas o usuário não esbarra. Linhas novas: deixa em branco.
 */
import { ClasseTensao, UF } from "@prisma/client";

import type { Serialized } from "@/lib/serialize";
import type { Filial } from "@prisma/client";
import { formatCNPJ } from "@/lib/format";

/** Nome oficial das colunas — contrato export ↔ import. NÃO renomear sem migration. */
export const FILIAL_EXCEL_COLUMNS = [
  "ID",
  "Código",
  "CD",
  "Mercado Livre",
  "CNPJ",
  "Distribuidora",
  "Grupo Tarifário",
  "Classe de Tensão",
  "UC principal",
  "UC #2",
  "UC #3",
  "Município",
  "UF",
  "% Absorção USP",
  "Climatizada",
  "Climatização planejada",
  "Usuário",
] as const;

export type FilialExcelColumn = (typeof FILIAL_EXCEL_COLUMNS)[number];

/** Conjunto pra checagem O(1) de headers desconhecidos. */
const COLUMN_SET = new Set<string>(FILIAL_EXCEL_COLUMNS);

/**
 * Labels humanos pra `ClasseTensao` no Excel (curtos, sem parênteses).
 * Mantém alinhado com `CLASSE_TENSAO_LABEL` em schemas/filial.ts mas usa
 * forma compacta — usuário copia/digita sem dor.
 */
const CLASSE_TENSAO_EXCEL_LABEL: Record<ClasseTensao, string> = {
  A1: "A1",
  A2: "A2",
  A3: "A3",
  A3a: "A3a",
  A4: "A4",
  AS: "AS",
  B1: "B1",
  B2: "B2",
  B3: "B3",
  B3_optante: "B3 Optante",
  B4: "B4",
};

const CLASSE_TENSAO_FROM_EXCEL: Record<string, ClasseTensao> = Object.fromEntries(
  Object.entries(CLASSE_TENSAO_EXCEL_LABEL).map(([enumVal, label]) => [
    label.toLowerCase(),
    enumVal as ClasseTensao,
  ]),
);

const UF_SET = new Set<string>(Object.values(UF) as string[]);

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------

export type FilialExportRow = Pick<
  Serialized<Filial>,
  | "id"
  | "codigo"
  | "cd"
  | "mercadoLivre"
  | "cnpj"
  | "distribuidora"
  | "grupo"
  | "classeTensao"
  | "uc"
  | "uc2"
  | "uc3"
  | "municipio"
  | "uf"
  | "percentualAbsorcaoUsp"
  | "filialClimatizada"
  | "dataClimatizacaoPlanejada"
  | "usuario"
>;

/** Constrói uma linha da planilha a partir de um Filial serializado. */
export function filialToExcelRow(
  f: FilialExportRow,
): Record<FilialExcelColumn, string | number | null> {
  return {
    ID: f.id,
    "Código": f.codigo ?? null,
    CD: f.cd ?? null,
    "Mercado Livre": f.mercadoLivre ?? null,
    CNPJ: f.cnpj ? formatCNPJ(f.cnpj) : null,
    Distribuidora: f.distribuidora ?? null,
    "Grupo Tarifário": f.grupo ?? null,
    "Classe de Tensão": f.classeTensao
      ? CLASSE_TENSAO_EXCEL_LABEL[f.classeTensao]
      : null,
    "UC principal": f.uc ?? null,
    "UC #2": f.uc2 ?? null,
    "UC #3": f.uc3 ?? null,
    "Município": f.municipio ?? null,
    UF: f.uf ?? null,
    "% Absorção USP":
      f.percentualAbsorcaoUsp != null
        ? formatDecimalPointPercent(f.percentualAbsorcaoUsp)
        : null,
    Climatizada: f.filialClimatizada ?? null,
    "Climatização planejada": f.dataClimatizacaoPlanejada
      ? formatDateBR(new Date(f.dataClimatizacaoPlanejada))
      : null,
    "Usuário": f.usuario ?? null,
  };
}

function formatDateBR(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDecimalPointPercent(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

// ----------------------------------------------------------------------------
// Import — validação de headers e parse por linha
// ----------------------------------------------------------------------------

export interface RowError {
  /** Linha 1-based, alinhada com a planilha (header é linha 1, primeira linha de dado é 2). */
  row: number;
  field?: string;
  value?: unknown;
  message: string;
  expected?: string;
}

/**
 * Valida que os headers da planilha batem EXATAMENTE com o contrato.
 * - Headers extras → erro (usuário pode ter renomeado e quebrado o contrato).
 * - Headers faltantes → erro (`Código` é obrigatório, demais opcionais; o
 *   contrato exige a presença da coluna, não do valor).
 */
export function validateHeaders(headers: string[]): RowError[] {
  const errors: RowError[] = [];
  const present = new Set(headers);
  for (const col of FILIAL_EXCEL_COLUMNS) {
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

/** Resultado do parse por linha. */
export interface ParsedFilialRow {
  /** Linha 1-based pra erros. */
  row: number;
  /** ID quando presente — sinaliza update. */
  id: string | null;
  /** Payload pronto pra `filialSchema.parse` ou pra `create`. */
  data: Record<string, unknown>;
}

/**
 * Converte uma linha da planilha (já com headers validados) no payload bruto
 * que será alimentado ao `filialSchema`. Validação Zod fica a cargo da action
 * — aqui só fazemos coerções determinísticas e relatamos erros estruturais
 * (enum inválido, data inválida, número inválido).
 */
export function excelRowToFilial(
  raw: Record<string, unknown>,
  rowNumber: number,
): { data: ParsedFilialRow["data"]; id: string | null; errors: RowError[] } {
  const errors: RowError[] = [];

  // ID: se preenchido, mantém; senão null (= create).
  const idRaw = pickString(raw, "ID");
  const id = idRaw ? idRaw : null;

  // Classe de Tensão: aceita labels do Excel (case-insensitive). Convert pra enum.
  let classeTensao: ClasseTensao | null = null;
  const classeRaw = pickString(raw, "Classe de Tensão");
  if (classeRaw) {
    const found = CLASSE_TENSAO_FROM_EXCEL[classeRaw.toLowerCase()];
    if (!found) {
      errors.push({
        row: rowNumber,
        field: "Classe de Tensão",
        value: classeRaw,
        message: `Valor inválido para Classe de Tensão.`,
        expected: `Um destes: ${Object.values(CLASSE_TENSAO_EXCEL_LABEL).join(", ")}.`,
      });
    } else {
      classeTensao = found;
    }
  }

  // UF: deve ser sigla válida (maiúscula).
  let uf: UF | null = null;
  const ufRaw = pickString(raw, "UF");
  if (ufRaw) {
    const upper = ufRaw.toUpperCase();
    if (!UF_SET.has(upper)) {
      errors.push({
        row: rowNumber,
        field: "UF",
        value: ufRaw,
        message: `Valor inválido para UF.`,
        expected: `Sigla de 2 letras (ex: PR, SP, MS, GO).`,
      });
    } else {
      uf = upper as UF;
    }
  }

  // % Absorção USP: number, 0..100.
  let percentualAbsorcaoUsp: number | null = null;
  const pctRaw = raw["% Absorção USP"];
  if (pctRaw != null && pctRaw !== "") {
    const n = parseDecimalPercent(pctRaw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      errors.push({
        row: rowNumber,
        field: "% Absorção USP",
        value: pctRaw,
        message: `Valor inválido para % Absorção USP.`,
        expected: `Número entre 0 e 100.`,
      });
    } else {
      percentualAbsorcaoUsp = n;
    }
  }

  // Data de climatização: dd/mm/yyyy ou Date (Excel auto-converte às vezes).
  let dataClimatizacaoPlanejada: Date | null = null;
  const dataRaw = raw["Climatização planejada"];
  if (dataRaw != null && dataRaw !== "") {
    const dt = parseDateBR(dataRaw);
    if (!dt) {
      errors.push({
        row: rowNumber,
        field: "Climatização planejada",
        value: dataRaw,
        message: `Data inválida.`,
        expected: `Formato dd/mm/aaaa (ex: 31/12/2026).`,
      });
    } else {
      dataClimatizacaoPlanejada = dt;
    }
  }

  // CNPJ: aceita mascarado ou digits-only; valida 14 dígitos.
  let cnpj: string | null = null;
  const cnpjRaw = pickString(raw, "CNPJ");
  if (cnpjRaw) {
    const digits = cnpjRaw.replace(/\D/g, "");
    if (digits.length !== 14) {
      errors.push({
        row: rowNumber,
        field: "CNPJ",
        value: cnpjRaw,
        message: `CNPJ inválido.`,
        expected: `14 dígitos (com ou sem máscara, ex: 12.345.678/0001-90).`,
      });
    } else {
      cnpj = digits;
    }
  }

  return {
    id,
    data: {
      codigo: pickString(raw, "Código"),
      cd: pickString(raw, "CD"),
      mercadoLivre: pickString(raw, "Mercado Livre"),
      cnpj,
      distribuidora: pickString(raw, "Distribuidora"),
      grupo: pickString(raw, "Grupo Tarifário"),
      classeTensao,
      uc: pickString(raw, "UC principal"),
      uc2: pickString(raw, "UC #2"),
      uc3: pickString(raw, "UC #3"),
      municipio: pickString(raw, "Município"),
      uf,
      percentualAbsorcaoUsp,
      filialClimatizada: pickString(raw, "Climatizada"),
      dataClimatizacaoPlanejada,
      usuario: pickString(raw, "Usuário"),
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

export function parseDecimalPercent(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return Number.NaN;

  const raw = String(v).trim().replace(/\s/g, "").replace(/%$/, "");
  if (raw === "") return Number.NaN;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
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

function parseDateBR(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number") {
    // Excel serial date — só aceitamos se for "raw" do parser; ideal é string.
    // Fórmula: epoch base 1899-12-30 + dias.
    const ms = (v - 25569) * 86400 * 1000;
    const dt = new Date(ms);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof v !== "string") return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const [, d, mm, y] = m;
  const dt = new Date(Number(y), Number(mm) - 1, Number(d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}
