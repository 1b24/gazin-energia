"use server";

import * as XLSX from "xlsx";

import { auth } from "@/lib/auth";
import { createCrudActions } from "@/lib/actions/crud";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import {
  excelRowToFilial,
  filialToExcelRow,
  FILIAL_EXCEL_COLUMNS,
  type FilialExportRow,
  type RowError,
  validateHeaders,
} from "@/lib/excel/filial-mapper";
import { exportRows } from "@/lib/exports";
import { filialSchema } from "@/lib/schemas/filial";
import { serializePrisma } from "@/lib/serialize";

const actions = createCrudActions("Filial", filialSchema, {
  revalidate: "/filiais",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;

// ----------------------------------------------------------------------------
// Exportação do MODELO Excel oficial
// ----------------------------------------------------------------------------

/**
 * Exporta TODAS as filiais ativas no formato oficial — usado tanto como
 * "modelo de preenchimento" (para import depois) quanto como snapshot.
 *
 * Diferenças vs. `bulkExport`:
 *  - Colunas em PT-BR fixas (contrato).
 *  - CNPJ mascarado.
 *  - Datas em dd/mm/yyyy.
 *  - Enums como label PT-BR (B3 Optante etc).
 *  - Coluna ID sai PRESENTE mas marcada `hidden: true` no XLSX.
 *  - `senha` nunca sai (não está no select).
 */
export async function exportFilialModel(): Promise<{
  buffer: ArrayBuffer;
  filename: string;
  mimetype: string;
}> {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");
  const db = scopedPrisma(session.user);

  const rows = await retryClosedConnection(() =>
    db.filial.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        codigo: true,
        cd: true,
        mercadoLivre: true,
        cnpj: true,
        distribuidora: true,
        grupo: true,
        classeTensao: true,
        uc: true,
        uc2: true,
        uc3: true,
        municipio: true,
        uf: true,
        percentualAbsorcaoUsp: true,
        filialClimatizada: true,
        dataClimatizacaoPlanejada: true,
        usuario: true,
      },
      orderBy: [{ codigo: "asc" }, { mercadoLivre: "asc" }],
    }),
  );

  const serialized = serializePrisma(rows) as FilialExportRow[];
  const sheetRows = serialized.map(filialToExcelRow);

  // Gera planilha com headers oficiais (mesmo se rows vazio).
  const ws = XLSX.utils.json_to_sheet(sheetRows, {
    header: FILIAL_EXCEL_COLUMNS as unknown as string[],
  });

  // Marca coluna ID (A) como oculta — usuário não vê, mas o valor fica lá
  // pra round-trip de update.
  ws["!cols"] = FILIAL_EXCEL_COLUMNS.map((col) =>
    col === "ID" ? { hidden: true, wch: 12 } : { wch: 18 },
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Filiais");
  const buffer = XLSX.write(wb, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;

  const { filename, mimetype } = exportRows([], "xlsx", "filiais-modelo");
  return { buffer, filename, mimetype };
}

// ----------------------------------------------------------------------------
// Importação Excel — all-or-nothing
// ----------------------------------------------------------------------------

export interface ImportFilialResult {
  ok: boolean;
  /** Errors agregados (header + linha). Vazio quando ok=true. */
  errors: RowError[];
  /** Quando ok=true: estatísticas da aplicação. */
  created: number;
  updated: number;
  total: number;
}

function errorDetails(err: unknown): Record<string, unknown> {
  const record =
    typeof err === "object" && err !== null
      ? (err as Record<string, unknown>)
      : {};
  return {
    name:
      err instanceof Error
        ? err.name
        : typeof record.name === "string"
          ? record.name
          : typeof err,
    message:
      err instanceof Error
        ? err.message
        : typeof record.message === "string"
          ? record.message
          : String(err),
    code: record.code,
    meta: record.meta,
  };
}

function inspectImportIds(ids: string[]) {
  const first5 = ids.slice(0, 5);
  const idsWithSpaces = ids.filter((id) => id !== id.trim());
  const idsNotCmp = ids.filter((id) => !id.startsWith("cmp"));

  return {
    count: ids.length,
    first5,
    first5Types: first5.map((id) => typeof id),
    allStrings: ids.every((id) => typeof id === "string"),
    emptyCount: ids.filter((id) => id.length === 0).length,
    idsWithSpacesCount: idsWithSpaces.length,
    idsWithSpacesFirst5: idsWithSpaces.slice(0, 5),
    idsNotStartingWithCmpCount: idsNotCmp.length,
    idsNotStartingWithCmpFirst5: idsNotCmp.slice(0, 5),
    modelCheck:
      "Prisma model: filial; schema: model Filial { id String @id @default(cuid()) }",
  };
}

function debugJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Importa uma planilha Excel de Filiais. Executa em 3 fases:
 *
 *  1. Parse e validação estrutural: headers oficiais + parse por linha
 *     (enum/data/cnpj/número). Retorna agregado de erros.
 *  2. Validação de IDs e duplicidade: cada linha com ID precisa existir; sem
 *     ID + código já no banco → erro; código duplicado dentro da planilha →
 *     erro.
 *  3. Aplicação transacional via `bulkApply` (atômica): se Zod do schema
 *     ainda rejeitar algo, a tx rollback completo — nada é salvo.
 *
 * Retorna SEM lançar — usa `{ ok, errors }` pra propagar erros estruturados.
 */
export async function importFilial(
  buffer: ArrayBuffer,
): Promise<ImportFilialResult> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      errors: [{ row: 0, message: "Não autenticado." }],
      created: 0,
      updated: 0,
      total: 0,
    };
  }
  const db = scopedPrisma(session.user);

  // ------------------------------------------------------------------------
  // Fase 1: parse do arquivo + validação de headers
  // ------------------------------------------------------------------------
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message: "Arquivo inválido — não foi possível ler como .xlsx.",
        },
      ],
      created: 0,
      updated: 0,
      total: 0,
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      ok: false,
      errors: [{ row: 0, message: "Planilha vazia." }],
      created: 0,
      updated: 0,
      total: 0,
    };
  }
  const sheet = workbook.Sheets[sheetName];

  // Lê headers da primeira linha pra validar contrato.
  const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
  });
  if (headerRows.length === 0) {
    return {
      ok: false,
      errors: [{ row: 0, message: "Planilha vazia." }],
      created: 0,
      updated: 0,
      total: 0,
    };
  }
  const headers = (headerRows[0] as unknown[]).map((h) => String(h ?? "").trim());
  const headerErrors = validateHeaders(headers);
  if (headerErrors.length > 0) {
    return {
      ok: false,
      errors: headerErrors,
      created: 0,
      updated: 0,
      total: 0,
    };
  }

  // ------------------------------------------------------------------------
  // Fase 2: parse por linha + agregação de erros estruturais
  // ------------------------------------------------------------------------
  const dataRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: null,
  });

  const errors: RowError[] = [];
  type Parsed = {
    row: number;
    id: string | null;
    codigo: string | null;
    data: Record<string, unknown>;
  };
  const parsed: Parsed[] = [];

  dataRows.forEach((raw, idx) => {
    // Linha humana: header é 1, primeira de dados é 2.
    const rowNumber = idx + 2;
    const { id, data, errors: rowErrors } = excelRowToFilial(raw, rowNumber);
    errors.push(...rowErrors);
    parsed.push({
      row: rowNumber,
      id,
      codigo: (data.codigo as string | null) ?? null,
      data,
    });
  });

  // Duplicidade de código DENTRO da planilha (case-sensitive como salvo).
  const codigoSeen = new Map<string, number[]>();
  for (const p of parsed) {
    if (!p.codigo) continue;
    const arr = codigoSeen.get(p.codigo) ?? [];
    arr.push(p.row);
    codigoSeen.set(p.codigo, arr);
  }
  for (const [codigo, rows] of codigoSeen) {
    if (rows.length > 1) {
      for (const r of rows) {
        errors.push({
          row: r,
          field: "Código",
          value: codigo,
          message: `Código duplicado dentro da planilha (linhas ${rows.join(", ")}).`,
          expected: "Cada código deve aparecer no máximo uma vez.",
        });
      }
    }
  }

  // ------------------------------------------------------------------------
  // Fase 3: cruza com banco — IDs existem? sem ID + código já existe?
  // ------------------------------------------------------------------------
  const idsInformados = parsed
    .map((p) => p.id)
    .filter((v): v is string => !!v);
  const codigosSemId = parsed
    .filter((p) => !p.id && p.codigo)
    .map((p) => p.codigo as string);

  let existingById: { id: string }[] = [];
  let existingByCodigo: { id: string; codigo: string | null }[] = [];
  try {
    const result = await Promise.all([
      idsInformados.length > 0
        ? retryClosedConnection(() =>
            db.filial.findMany({
              where: { id: { in: idsInformados } },
              select: { id: true },
            }),
          )
        : Promise.resolve([]),
      codigosSemId.length > 0
        ? retryClosedConnection(() =>
            db.filial.findMany({
              where: { codigo: { in: codigosSemId }, deletedAt: null },
              select: { id: true, codigo: true },
            }),
          )
        : Promise.resolve([]),
    ]);
    existingById = result[0];
    existingByCodigo = result[1];
  } catch (err) {
    const idDiagnostics = inspectImportIds(idsInformados);
    let probe: Record<string, unknown>;
    try {
      const sample = await retryClosedConnection(() =>
        db.filial.findMany({
          take: 1,
          select: { id: true },
        }),
      );
      probe = {
        ok: true,
        count: sample.length,
        firstId: sample[0]?.id ?? null,
        firstIdType: sample[0]?.id == null ? null : typeof sample[0].id,
      };
    } catch (probeErr) {
      probe = {
        ok: false,
        error: errorDetails(probeErr),
      };
    }

    const diagnostic = {
      prismaError: errorDetails(err),
      idDiagnostics,
      isolatedFindManyTake1: probe,
      retryClosedConnection:
        "A consulta principal passou por retryClosedConnection; este diagnóstico capturou o erro final.",
      nextDevContext:
        "Se isolatedFindManyTake1 falhar, suspeitar de conexão Prisma/PGLite/dev server/hot reload.",
    };

    console.error("[filiais:import] Falha ao validar IDs no banco", diagnostic);

    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: "Banco/ID",
          value: idDiagnostics.first5.join(", "),
          message: `Falha ao consultar filiais por ID: ${String(
            diagnostic.prismaError.message,
          )}`,
          expected: debugJson(diagnostic),
        },
      ],
      created: 0,
      updated: 0,
      total: parsed.length,
    };
  }

  const idsExistentes = new Set(existingById.map((f) => f.id));
  const codigosExistentes = new Set(
    existingByCodigo.map((f) => f.codigo).filter((c): c is string => !!c),
  );

  for (const p of parsed) {
    if (p.id && !idsExistentes.has(p.id)) {
      errors.push({
        row: p.row,
        field: "ID",
        value: p.id,
        message: `ID informado não existe no sistema.`,
        expected: `Deixe ID em branco pra criar novo registro, ou use um ID existente.`,
      });
    }
    if (!p.id && p.codigo && codigosExistentes.has(p.codigo)) {
      errors.push({
        row: p.row,
        field: "Código",
        value: p.codigo,
        message: `Já existe filial com este código.`,
        expected: `Para atualizar uma filial existente, preencha a coluna ID (exporte primeiro pra obter os IDs).`,
      });
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      created: 0,
      updated: 0,
      total: parsed.length,
    };
  }

  // ------------------------------------------------------------------------
  // Aplicação transacional — `bulkApply` valida via Zod e roda audit por linha.
  // Erros de Zod ainda podem ocorrer aqui (ex: regra cruzada do schema) — a
  // exceção propaga e nada persiste graças à transação.
  // ------------------------------------------------------------------------
  const operations = parsed.map((p) =>
    p.id
      ? ({ kind: "update" as const, id: p.id, data: p.data })
      : ({ kind: "create" as const, data: p.data }),
  );

  try {
    const result = await actions.bulkApply(operations);
    return {
      ok: true,
      errors: [],
      created: result.created,
      updated: result.updated,
      total: parsed.length,
    };
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message:
            err instanceof Error
              ? `Falha ao aplicar: ${err.message}`
              : "Falha ao aplicar importação.",
        },
      ],
      created: 0,
      updated: 0,
      total: parsed.length,
    };
  }
}
