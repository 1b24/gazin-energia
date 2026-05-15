"use server";

import * as XLSX from "xlsx";

import { auth } from "@/lib/auth";
import { createCrudActions } from "@/lib/actions/crud";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import {
  CONSUMO_EXCEL_COLUMNS,
  CONSUMO_HIDDEN_COLUMNS,
  consumoToExcelRow,
  excelRowToConsumo,
  validateHeaders,
  type ConsumoExportRow,
  type RowError,
} from "@/lib/excel/consumo-mapper";
import { exportRows } from "@/lib/exports";
import { consumoSchema } from "@/lib/schemas/consumo";
import { serializePrisma } from "@/lib/serialize";

const actions = createCrudActions("Consumo", consumoSchema, {
  revalidate: "/consumo",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;

// ----------------------------------------------------------------------------
// Limites de proteção pra `$transaction` do Prisma
// ----------------------------------------------------------------------------

/**
 * Tamanho máximo aceito em uma importação. PGLite/Postgres aguentam mais,
 * mas $transaction com N*2 writes (mutation + audit) começa a ficar lento
 * acima disso e perde a janela de timeout default. Quebrar em múltiplas
 * importações é mais saudável que cresçer o limite.
 */
const MAX_IMPORT_ROWS = 5000;

// ----------------------------------------------------------------------------
// Export do MODELO Excel oficial
// ----------------------------------------------------------------------------

/**
 * Exporta TODOS os consumos ativos no formato oficial — usado como modelo
 * pra reimport. Inclui:
 *  - Coluna "ID" oculta (round-trip de update).
 *  - Coluna "Filial ID" oculta (round-trip da FK).
 *  - Coluna "Filial Código" visível (humano insere ao criar linha nova).
 *  - Coluna "Filial Mercado Livre" visível (info-only, ignorada no import).
 *  - 13 colunas numéricas com ponto decimal padronizado.
 *  - `arquivoFatura`, `zohoId`, `filialCodigoRaw`, timestamps NÃO exportadas.
 */
export async function exportConsumoModel(): Promise<{
  buffer: ArrayBuffer;
  filename: string;
  mimetype: string;
}> {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");
  const db = scopedPrisma(session.user);

  const rows = await retryClosedConnection(() =>
    db.consumo.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        filialId: true,
        ano: true,
        mes: true,
        uc: true,
        municipio: true,
        statusAnexo: true,
        consumoKwhP: true,
        consumoKwhFp: true,
        consumoTotal: true,
        injecaoRecebida: true,
        valor: true,
        valor1: true,
        valor2: true,
        valor3: true,
        valorTotalFatura: true,
        multasJurosAtraso: true,
        outrasMultas: true,
        filial: { select: { codigo: true, mercadoLivre: true } },
      },
      orderBy: [
        { ano: "desc" },
        { mes: "desc" },
        { filial: { codigo: "asc" } },
      ],
    }),
  );

  const serialized = serializePrisma(rows) as ConsumoExportRow[];
  const sheetRows = serialized.map(consumoToExcelRow);

  const ws = XLSX.utils.json_to_sheet(sheetRows, {
    header: CONSUMO_EXCEL_COLUMNS as unknown as string[],
  });

  // Esconde colunas técnicas (ID, Filial ID) — round-trip sem poluir UX.
  ws["!cols"] = CONSUMO_EXCEL_COLUMNS.map((col) => ({
    hidden: CONSUMO_HIDDEN_COLUMNS.has(col),
    wch: CONSUMO_HIDDEN_COLUMNS.has(col) ? 12 : 18,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Consumo");
  const buffer = XLSX.write(wb, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;

  const { filename, mimetype } = exportRows([], "xlsx", "consumo-modelo");
  return { buffer, filename, mimetype };
}

// ----------------------------------------------------------------------------
// Importação Excel — all-or-nothing
// ----------------------------------------------------------------------------

export interface ImportConsumoResult {
  ok: boolean;
  errors: RowError[];
  created: number;
  updated: number;
  total: number;
}

/**
 * Importa planilha Excel de Consumos. 3 fases:
 *
 *  1. Parse + headers oficiais.
 *  2. Parse por linha (numéricos, mês, ano) + agrega erros.
 *  3. Cruza com DB:
 *      - resolve `filialId` por `Filial Código` quando ID não vier;
 *      - valida IDs (consumo + filial) informados;
 *      - detecta duplicata lógica (mesmo filialId + ano + mes) dentro da
 *        planilha E vs banco em linhas sem ID;
 *      - aplica via `bulkApply` (transação única).
 */
export async function importConsumo(
  buffer: ArrayBuffer,
): Promise<ImportConsumoResult> {
  const session = await auth();
  if (!session?.user) {
    return errResult("Não autenticado.", 0);
  }
  const db = scopedPrisma(session.user);

  // -----------------------------------------------------------------------
  // Fase 1 — leitura do arquivo + headers
  // -----------------------------------------------------------------------
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    return errResult("Arquivo inválido — não foi possível ler como .xlsx.", 0);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return errResult("Planilha vazia.", 0);
  const sheet = workbook.Sheets[sheetName];

  const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
  });
  if (headerRows.length === 0) return errResult("Planilha vazia.", 0);

  const headers = (headerRows[0] as unknown[]).map((h) =>
    String(h ?? "").trim(),
  );
  const headerErrors = validateHeaders(headers);
  if (headerErrors.length > 0) {
    return { ok: false, errors: headerErrors, created: 0, updated: 0, total: 0 };
  }

  // -----------------------------------------------------------------------
  // Fase 2 — parse linha-a-linha + agregação de erros estruturais
  // -----------------------------------------------------------------------
  const dataRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: null,
  });

  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message: `Planilha excede o limite de ${MAX_IMPORT_ROWS} linhas (${dataRows.length} encontradas).`,
          expected: `Quebre em arquivos menores — por ano, por filial, etc.`,
        },
      ],
      created: 0,
      updated: 0,
      total: dataRows.length,
    };
  }

  const errors: RowError[] = [];
  type Parsed = {
    row: number;
    id: string | null;
    filialIdFromExcel: string | null;
    filialCodigo: string | null;
    ano: number | null;
    mes: string | null;
    data: Record<string, unknown>;
  };
  const parsed: Parsed[] = [];

  dataRows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // header é 1, primeira de dados é 2
    const result = excelRowToConsumo(raw, rowNumber);
    errors.push(...result.errors);
    parsed.push({
      row: rowNumber,
      id: result.id,
      filialIdFromExcel: result.filialId,
      filialCodigo: result.filialCodigo,
      ano: (result.data.ano as number | null) ?? null,
      mes: (result.data.mes as string | null) ?? null,
      data: result.data,
    });
  });

  // -----------------------------------------------------------------------
  // Fase 3 — lookups + validações cruzadas
  // -----------------------------------------------------------------------

  // 3a — IDs de Consumo informados existem?
  const idsInformados = parsed
    .map((p) => p.id)
    .filter((v): v is string => !!v);
  const existingConsumos =
    idsInformados.length > 0
      ? await retryClosedConnection(() =>
          db.consumo.findMany({
            where: { id: { in: idsInformados } },
            select: { id: true },
          }),
        )
      : [];
  const consumoIdsExistentes = new Set(existingConsumos.map((c) => c.id));

  // 3b — lookups de Filial por código (linhas sem Filial ID).
  const codigosParaResolver = parsed
    .filter((p) => !p.filialIdFromExcel && p.filialCodigo)
    .map((p) => p.filialCodigo as string);
  const filiaisPorCodigo =
    codigosParaResolver.length > 0
      ? await retryClosedConnection(() =>
          db.filial.findMany({
            where: { codigo: { in: codigosParaResolver }, deletedAt: null },
            select: { id: true, codigo: true },
          }),
        )
      : [];
  const codigoToFilialId = new Map<string, string>();
  for (const f of filiaisPorCodigo) {
    if (f.codigo) codigoToFilialId.set(f.codigo, f.id);
  }

  // 3c — Filial IDs informados existem?
  const filialIdsInformados = parsed
    .map((p) => p.filialIdFromExcel)
    .filter((v): v is string => !!v);
  const existingFiliais =
    filialIdsInformados.length > 0
      ? await retryClosedConnection(() =>
          db.filial.findMany({
            where: { id: { in: filialIdsInformados }, deletedAt: null },
            select: { id: true },
          }),
        )
      : [];
  const filialIdsExistentes = new Set(existingFiliais.map((f) => f.id));

  // 3d — Resolve `filialId` final por linha e valida.
  for (const p of parsed) {
    if (p.id && !consumoIdsExistentes.has(p.id)) {
      errors.push({
        row: p.row,
        field: "ID",
        value: p.id,
        message: `ID de Consumo não existe no sistema.`,
        expected: `Deixe ID em branco pra criar novo, ou use um ID existente.`,
      });
      continue;
    }

    if (p.filialIdFromExcel) {
      if (!filialIdsExistentes.has(p.filialIdFromExcel)) {
        errors.push({
          row: p.row,
          field: "Filial ID",
          value: p.filialIdFromExcel,
          message: `Filial ID não existe no sistema.`,
          expected: `Use ID de filial ativa, ou deixe vazio e preencha apenas "Filial Código".`,
        });
        continue;
      }
      p.data.filialId = p.filialIdFromExcel;
    } else if (p.filialCodigo) {
      const resolved = codigoToFilialId.get(p.filialCodigo);
      if (!resolved) {
        errors.push({
          row: p.row,
          field: "Filial Código",
          value: p.filialCodigo,
          message: `Filial com este código não encontrada.`,
          expected: `Use código de filial ativa cadastrada no sistema.`,
        });
        continue;
      }
      p.data.filialId = resolved;
    } else {
      errors.push({
        row: p.row,
        field: "Filial Código",
        value: null,
        message: `Filial obrigatória — preencha "Filial Código".`,
        expected: `Código de filial ativa cadastrada no sistema.`,
      });
      continue;
    }
  }

  // 3e — Duplicata lógica DENTRO da planilha (mesmo filialId+ano+mes em linhas
  //      sem ID). Linhas com ID podem repetir filialId+ano+mes sem problema.
  const dedupKeyInPlanilha = new Map<string, number[]>();
  for (const p of parsed) {
    if (p.id) continue;
    const filialId = p.data.filialId as string | null;
    if (!filialId || !p.ano || !p.mes) continue;
    const k = `${filialId}|${p.ano}|${p.mes}`;
    const arr = dedupKeyInPlanilha.get(k) ?? [];
    arr.push(p.row);
    dedupKeyInPlanilha.set(k, arr);
  }
  for (const [, rows] of dedupKeyInPlanilha) {
    if (rows.length > 1) {
      for (const r of rows) {
        errors.push({
          row: r,
          field: "Filial Código",
          message: `Duplicata dentro da planilha (linhas ${rows.join(", ")}): mesma combinação Filial + Ano + Mês.`,
          expected: `Cada combinação Filial+Ano+Mês deve aparecer uma vez (ou use ID pra atualizar existente).`,
        });
      }
    }
  }

  // 3f — Duplicata lógica vs BANCO (sem ID + (filialId+ano+mes) já existe).
  const dedupQueries = parsed
    .filter((p) => !p.id && p.data.filialId && p.ano && p.mes)
    .map((p) => ({
      filialId: p.data.filialId as string,
      ano: p.ano as number,
      mes: p.mes as string,
      row: p.row,
    }));

  if (dedupQueries.length > 0) {
    // Busca tudo do escopo em um único findMany — evita N+1.
    const possibleDups = await retryClosedConnection(() =>
      db.consumo.findMany({
        where: {
          deletedAt: null,
          OR: dedupQueries.map((d) => ({
            filialId: d.filialId,
            ano: d.ano,
            mes: d.mes,
          })),
        },
        select: { filialId: true, ano: true, mes: true },
      }),
    );
    const existingKeys = new Set(
      possibleDups
        .filter((d) => d.filialId != null)
        .map((d) => `${d.filialId}|${d.ano}|${d.mes}`),
    );
    for (const q of dedupQueries) {
      const key = `${q.filialId}|${q.ano}|${q.mes}`;
      if (existingKeys.has(key)) {
        errors.push({
          row: q.row,
          field: "Filial Código",
          message: `Já existe Consumo desta filial neste Ano+Mês.`,
          expected: `Para atualizar o registro existente, preencha a coluna "ID" (baixe o modelo primeiro pra obter o ID).`,
        });
      }
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

  // -----------------------------------------------------------------------
  // Aplicação transacional via bulkApply
  // -----------------------------------------------------------------------
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
    return errResult(
      err instanceof Error
        ? `Falha ao aplicar: ${err.message}`
        : "Falha ao aplicar importação.",
      parsed.length,
    );
  }
}

function errResult(message: string, total: number): ImportConsumoResult {
  return {
    ok: false,
    errors: [{ row: 0, message }],
    created: 0,
    updated: 0,
    total,
  };
}
