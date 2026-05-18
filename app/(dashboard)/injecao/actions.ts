"use server";

import * as XLSX from "xlsx";

import { auth } from "@/lib/auth";
import { createCrudActions } from "@/lib/actions/crud";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import {
  excelRowToInjecao,
  INJECAO_EXCEL_COLUMNS,
  INJECAO_HIDDEN_COLUMNS,
  injecaoToExcelRow,
  validateHeaders,
  type InjecaoExportRow,
  type RowError,
} from "@/lib/excel/injecao-mapper";
import { exportRows } from "@/lib/exports";
import { injecaoSchema } from "@/lib/schemas/injecao";
import { serializePrisma } from "@/lib/serialize";

const actions = createCrudActions("Injecao", injecaoSchema, {
  revalidate: "/injecao",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;

const MAX_IMPORT_ROWS = 5000;

// ----------------------------------------------------------------------------
// Export do MODELO Excel oficial
// ----------------------------------------------------------------------------

/**
 * Exporta TODAS as injeções ativas no formato oficial. Inclui:
 *  - Coluna "ID" oculta (round-trip de update).
 *  - "Filial ID" e "Fornecedor ID" ocultas (round-trip das FKs).
 *  - "Filial Código" e "Fornecedor Nome" visíveis (humano referencia).
 *  - "Filial Mercado Livre" visível (info-only, ignorada no import).
 *  - 6 colunas numéricas com ponto decimal padronizado.
 *  - `anexoFechamento`, `zohoId`, raws, timestamps NÃO exportadas.
 */
export async function exportInjecaoModel(): Promise<{
  buffer: ArrayBuffer;
  filename: string;
  mimetype: string;
}> {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");
  const db = scopedPrisma(session.user);

  const rows = await retryClosedConnection(() =>
    db.injecao.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        filialId: true,
        fornecedorId: true,
        ano: true,
        mes: true,
        uc: true,
        municipio: true,
        consumoKwhP: true,
        consumoKwhP1: true,
        consumoTotalKwh: true,
        valor: true,
        valor1: true,
        valor2: true,
        filial: { select: { codigo: true, mercadoLivre: true } },
        fornecedor: { select: { nome: true } },
      },
      orderBy: [
        { ano: "desc" },
        { mes: "desc" },
        { filial: { codigo: "asc" } },
      ],
    }),
  );

  const serialized = serializePrisma(rows) as InjecaoExportRow[];
  const sheetRows = serialized.map(injecaoToExcelRow);

  const ws = XLSX.utils.json_to_sheet(sheetRows, {
    header: INJECAO_EXCEL_COLUMNS as unknown as string[],
  });

  ws["!cols"] = INJECAO_EXCEL_COLUMNS.map((col) => ({
    hidden: INJECAO_HIDDEN_COLUMNS.has(col),
    wch: INJECAO_HIDDEN_COLUMNS.has(col) ? 12 : 18,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Injecao");
  const buffer = XLSX.write(wb, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;

  const { filename, mimetype } = exportRows([], "xlsx", "injecao-modelo");
  return { buffer, filename, mimetype };
}

// ----------------------------------------------------------------------------
// Importação Excel — all-or-nothing
// ----------------------------------------------------------------------------

export interface ImportInjecaoResult {
  ok: boolean;
  errors: RowError[];
  created: number;
  updated: number;
  total: number;
}

/**
 * Importa planilha Excel de Injeções. 3 fases (mesmo padrão do Consumo):
 *
 *  1. Parse + headers oficiais.
 *  2. Parse por linha (numéricos, mês, ano) + agrega erros.
 *  3. Cruza com DB:
 *      - resolve `filialId` por `Filial Código` quando ID não vier;
 *      - resolve `fornecedorId` por `Fornecedor Nome` quando ID não vier;
 *      - valida IDs informados (consumo + filial + fornecedor);
 *      - detecta duplicata lógica (filial + ano + mes) dentro da planilha
 *        E vs banco em linhas sem ID;
 *      - aplica via `bulkApply` (transação única).
 */
export async function importInjecao(
  buffer: ArrayBuffer,
): Promise<ImportInjecaoResult> {
  const session = await auth();
  if (!session?.user) {
    return errResult("Não autenticado.", 0);
  }
  const db = scopedPrisma(session.user);

  // -----------------------------------------------------------------------
  // Fase 1 — leitura + headers
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
  // Fase 2 — parse linha-a-linha
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
    fornecedorIdFromExcel: string | null;
    fornecedorNome: string | null;
    ano: number | null;
    mes: string | null;
    data: Record<string, unknown>;
  };
  const parsed: Parsed[] = [];

  dataRows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const result = excelRowToInjecao(raw, rowNumber);
    errors.push(...result.errors);
    parsed.push({
      row: rowNumber,
      id: result.id,
      filialIdFromExcel: result.filialId,
      filialCodigo: result.filialCodigo,
      fornecedorIdFromExcel: result.fornecedorId,
      fornecedorNome: result.fornecedorNome,
      ano: (result.data.ano as number | null) ?? null,
      mes: (result.data.mes as string | null) ?? null,
      data: result.data,
    });
  });

  // -----------------------------------------------------------------------
  // Fase 3 — lookups + validações cruzadas
  // -----------------------------------------------------------------------

  // 3a — IDs de Injecao informados existem?
  const idsInformados = parsed
    .map((p) => p.id)
    .filter((v): v is string => !!v);
  const existingInjecoes =
    idsInformados.length > 0
      ? await retryClosedConnection(() =>
          db.injecao.findMany({
            where: { id: { in: idsInformados } },
            select: { id: true },
          }),
        )
      : [];
  const injecaoIdsExistentes = new Set(existingInjecoes.map((i) => i.id));

  // 3b — lookups de Filial por código (linhas sem Filial ID).
  const codigosFilialParaResolver = parsed
    .filter((p) => !p.filialIdFromExcel && p.filialCodigo)
    .map((p) => p.filialCodigo as string);
  const filiaisPorCodigo =
    codigosFilialParaResolver.length > 0
      ? await retryClosedConnection(() =>
          db.filial.findMany({
            where: { codigo: { in: codigosFilialParaResolver }, deletedAt: null },
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

  // 3d — lookups de Fornecedor por nome (linhas sem Fornecedor ID, opcional).
  const nomesFornecedorParaResolver = parsed
    .filter((p) => !p.fornecedorIdFromExcel && p.fornecedorNome)
    .map((p) => p.fornecedorNome as string);
  const fornecedoresPorNome =
    nomesFornecedorParaResolver.length > 0
      ? await retryClosedConnection(() =>
          db.fornecedor.findMany({
            where: { nome: { in: nomesFornecedorParaResolver }, deletedAt: null },
            select: { id: true, nome: true },
          }),
        )
      : [];
  // Detecta nome ambíguo (mais de 1 fornecedor com mesmo nome) — vira erro
  // pra forçar usuário a usar o ID no Excel.
  const nomeToFornecedorId = new Map<string, string>();
  const nomesAmbiguos = new Set<string>();
  for (const f of fornecedoresPorNome) {
    if (!f.nome) continue;
    if (nomeToFornecedorId.has(f.nome)) {
      nomesAmbiguos.add(f.nome);
    } else {
      nomeToFornecedorId.set(f.nome, f.id);
    }
  }

  // 3e — Fornecedor IDs informados existem?
  const fornecedorIdsInformados = parsed
    .map((p) => p.fornecedorIdFromExcel)
    .filter((v): v is string => !!v);
  const existingFornecedores =
    fornecedorIdsInformados.length > 0
      ? await retryClosedConnection(() =>
          db.fornecedor.findMany({
            where: { id: { in: fornecedorIdsInformados }, deletedAt: null },
            select: { id: true },
          }),
        )
      : [];
  const fornecedorIdsExistentes = new Set(
    existingFornecedores.map((f) => f.id),
  );

  // 3f — Resolve FKs finais por linha + valida.
  for (const p of parsed) {
    if (p.id && !injecaoIdsExistentes.has(p.id)) {
      errors.push({
        row: p.row,
        field: "ID",
        value: p.id,
        message: `ID de Injeção não existe no sistema.`,
        expected: `Deixe ID em branco pra criar novo, ou use um ID existente.`,
      });
      continue;
    }

    // Filial (obrigatória pra dedup, opcional no schema mas exigida pra
    // import — sem filial não dá pra detectar duplicata lógica).
    if (p.filialIdFromExcel) {
      if (!filialIdsExistentes.has(p.filialIdFromExcel)) {
        errors.push({
          row: p.row,
          field: "Filial ID",
          value: p.filialIdFromExcel,
          message: `Filial ID não existe no sistema.`,
          expected: `Use ID de filial ativa, ou deixe vazio e preencha "Filial Código".`,
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

    // Fornecedor (opcional). Se vier ID/Nome, valida; caso contrário, fica null.
    if (p.fornecedorIdFromExcel) {
      if (!fornecedorIdsExistentes.has(p.fornecedorIdFromExcel)) {
        errors.push({
          row: p.row,
          field: "Fornecedor ID",
          value: p.fornecedorIdFromExcel,
          message: `Fornecedor ID não existe no sistema.`,
          expected: `Use ID de fornecedor ativo, ou deixe vazio e preencha "Fornecedor Nome".`,
        });
        continue;
      }
      p.data.fornecedorId = p.fornecedorIdFromExcel;
    } else if (p.fornecedorNome) {
      if (nomesAmbiguos.has(p.fornecedorNome)) {
        errors.push({
          row: p.row,
          field: "Fornecedor Nome",
          value: p.fornecedorNome,
          message: `Existem múltiplos fornecedores com este nome — ambíguo.`,
          expected: `Preencha a coluna "Fornecedor ID" pra desambiguar.`,
        });
        continue;
      }
      const resolved = nomeToFornecedorId.get(p.fornecedorNome);
      if (!resolved) {
        errors.push({
          row: p.row,
          field: "Fornecedor Nome",
          value: p.fornecedorNome,
          message: `Fornecedor com este nome não encontrado.`,
          expected: `Use nome de fornecedor ativo cadastrado no sistema.`,
        });
        continue;
      }
      p.data.fornecedorId = resolved;
    } else {
      // Fornecedor é opcional — fica null.
      p.data.fornecedorId = null;
    }
  }

  // 3g — Duplicata lógica DENTRO da planilha (mesmo filialId+ano+mes em
  //      linhas sem ID).
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

  // 3h — Duplicata lógica vs BANCO (sem ID + (filialId+ano+mes) já existe).
  const dedupQueries = parsed
    .filter((p) => !p.id && p.data.filialId && p.ano && p.mes)
    .map((p) => ({
      filialId: p.data.filialId as string,
      ano: p.ano as number,
      mes: p.mes as string,
      row: p.row,
    }));

  if (dedupQueries.length > 0) {
    const possibleDups = await retryClosedConnection(() =>
      db.injecao.findMany({
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
          message: `Já existe Injeção desta filial neste Ano+Mês.`,
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

function errResult(message: string, total: number): ImportInjecaoResult {
  return {
    ok: false,
    errors: [{ row: 0, message }],
    created: 0,
    updated: 0,
    total,
  };
}
