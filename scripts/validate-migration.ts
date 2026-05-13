/**
 * Valida que `npm run db:seed` round-tripou os JSONs em `data/raw/` corretamente.
 *
 * Segue o BRIEF item 2.2:
 *  - Para entidades ATIVAS: conta JSON vs banco, integridade referencial,
 *    nulls em campos suspeitos de obrigatórios.
 *  - Para entidades STUB: confirma que a tabela existe e está vazia. Não é erro.
 *
 * Saída separa "Migradas" de "Stubs aguardando dados", com cores no terminal.
 * Exit 1 se algo falhar — pronto pra wirar em CI mais tarde.
 */
import "dotenv/config";

import type { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { createPrismaClient } from "@/lib/db";
import { listByStatus } from "@/lib/modules/status";

const RAW_DIR = path.join(process.cwd(), "data", "raw");

// ANSI colors — desligados se NO_COLOR estiver setado.
const NO_COLOR = !!process.env.NO_COLOR;
const c = {
  green: (s: string) => (NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`),
  red: (s: string) => (NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`),
  yellow: (s: string) => (NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`),
  dim: (s: string) => (NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`),
  bold: (s: string) => (NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`),
};

async function loadRows(file: string): Promise<unknown[]> {
  const raw = await readFile(path.join(RAW_DIR, file), "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown[]>;
  const key = Object.keys(parsed)[0];
  return parsed[key];
}

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

// Conta linhas em models cujos counts devem bater 1:1 com o JSON fonte.
const ROW_COUNT_PAIRS: {
  file: string;
  model: string;
  count: (p: PrismaClient) => Promise<number>;
}[] = [
  {
    file: "filiais.json",
    model: "Filial",
    count: (p) => p.filial.count({ where: { deletedAt: null } }),
  },
  {
    file: "usinas.json",
    model: "Usina",
    count: (p) => p.usina.count({ where: { deletedAt: null } }),
  },
  {
    file: "fornecedores.json",
    model: "Fornecedor",
    count: (p) => p.fornecedor.count({ where: { deletedAt: null } }),
  },
  {
    file: "geracao.json",
    model: "Geracao",
    count: (p) => p.geracao.count({ where: { deletedAt: null } }),
  },
  {
    file: "consumo.json",
    model: "Consumo",
    count: (p) => p.consumo.count({ where: { deletedAt: null } }),
  },
  {
    file: "injecao.json",
    model: "Injecao",
    count: (p) => p.injecao.count({ where: { deletedAt: null } }),
  },
  {
    file: "orcamentario.json",
    model: "Orcamento",
    count: (p) => p.orcamento.count({ where: { deletedAt: null } }),
  },
  {
    file: "manutencao_limpeza.json",
    model: "CronogramaLimpeza",
    count: (p) => p.cronogramaLimpeza.count({ where: { deletedAt: null } }),
  },
  {
    file: "manutencao_preventiva.json",
    model: "ManutencaoPreventiva",
    count: (p) => p.manutencaoPreventiva.count({ where: { deletedAt: null } }),
  },
  {
    file: "juridico_processos.json",
    model: "ProcessoJuridico",
    count: (p) => p.processoJuridico.count({ where: { deletedAt: null } }),
  },
];

// Stubs: contagens devem ser zero (nenhum dado real ainda).
const STUB_COUNTS: {
  model: string;
  count: (p: PrismaClient) => Promise<number>;
}[] = [
  { model: "Licenca", count: (p) => p.licenca.count() },
  { model: "ValidacaoFatura", count: (p) => p.validacaoFatura.count() },
  { model: "ItemEstoque", count: (p) => p.itemEstoque.count() },
  { model: "ConsertoEquipamento", count: (p) => p.consertoEquipamento.count() },
  { model: "ManutencaoCorretiva", count: (p) => p.manutencaoCorretiva.count() },
  { model: "Documento", count: (p) => p.documento.count() },
];

async function runActiveChecks(prisma: PrismaClient): Promise<Check[]> {
  const checks: Check[] = [];

  // Row count parity
  for (const p of ROW_COUNT_PAIRS) {
    if (!existsSync(path.join(RAW_DIR, p.file))) {
      checks.push({
        label: `${p.model} parity`,
        ok: false,
        detail: `JSON ausente (${p.file})`,
      });
      continue;
    }
    const expected = (await loadRows(p.file)).length;
    const actual = await p.count(prisma);
    checks.push({
      label: `${p.model} parity`,
      ok: expected === actual,
      detail: `expected=${expected} actual=${actual}`,
    });
  }

  // VendaKwh: explosão wide-to-long, counts devem ser ≥ source.
  if (existsSync(path.join(RAW_DIR, "venda_kwh.json"))) {
    const source = (await loadRows("venda_kwh.json")).length;
    const exploded = await prisma.vendaKwh.count({
      where: { deletedAt: null },
    });
    checks.push({
      label: "VendaKwh explosion",
      ok: exploded >= source,
      detail: `source=${source} long=${exploded}`,
    });
  }

  // GeracaoDia presente?
  const dias = await prisma.geracaoDia.count({
    where: { geracao: { deletedAt: null } },
  });
  const geracoes = await prisma.geracao.count({ where: { deletedAt: null } });
  checks.push({
    label: "GeracaoDia present",
    ok: geracoes === 0 || dias > 0,
    detail: `${dias} valores diários para ${geracoes} gerações`,
  });

  // Linkage Usina → Filial (não falha se 0%, mas avisa visualmente).
  const usinaTotal = await prisma.usina.count({ where: { deletedAt: null } });
  const usinaLinked = await prisma.usina.count({
    where: { deletedAt: null, filialId: { not: null } },
  });
  checks.push({
    label: "Usina → Filial linkage",
    ok: true,
    detail: `${usinaLinked}/${usinaTotal} usinas linkadas a filial`,
  });

  // Linkage Geracao → Usina (esperado 100%).
  const gerLinked = await prisma.geracao.count({
    where: { deletedAt: null, usinaId: { not: null } },
  });
  checks.push({
    label: "Geracao → Usina linkage",
    ok: geracoes === 0 || gerLinked === geracoes,
    detail: `${gerLinked}/${geracoes} gerações linkadas a usina`,
  });

  // Nulls em campos suspeitos de obrigatórios (Usina.nome, Fornecedor.nome).
  const usinaSemNome = await prisma.usina.count({
    where: { deletedAt: null, nome: "" },
  });
  checks.push({
    label: "Usina.nome populated",
    ok: usinaSemNome === 0,
    detail: `${usinaSemNome} sem nome`,
  });
  // Fornecedor.nome é nullable porque a fonte legada aceita Nome vazio em
  // alguns registros. A checagem é informacional (não falha).
  const fornSemNome = await prisma.fornecedor.count({
    where: { deletedAt: null, nome: null },
  });
  const fornTotal = await prisma.fornecedor.count({
    where: { deletedAt: null },
  });
  checks.push({
    label: "Fornecedor.nome populated",
    ok: true,
    detail: `${fornTotal - fornSemNome}/${fornTotal} com nome (${fornSemNome} sem nome no source legado)`,
  });

  return checks;
}

async function runStubChecks(prisma: PrismaClient): Promise<Check[]> {
  const checks: Check[] = [];
  for (const s of STUB_COUNTS) {
    const n = await s.count(prisma);
    checks.push({
      label: `${s.model} (stub)`,
      ok: n === 0, // stubs devem estar vazios; população só vem com JSON real
      detail:
        n === 0
          ? "tabela existe, vazia ✓"
          : `inesperadamente populada (${n} linhas)`,
    });
  }
  return checks;
}

function renderChecks(title: string, checks: Check[]): number {
  console.log(`\n${c.bold(title)}`);
  let failed = 0;
  for (const ch of checks) {
    const icon = ch.ok ? c.green("[OK]  ") : c.red("[FAIL]");
    console.log(`  ${icon} ${ch.label.padEnd(32)} ${c.dim(ch.detail)}`);
    if (!ch.ok) failed++;
  }
  return failed;
}

async function main() {
  const prisma = createPrismaClient();
  try {
    const active = await runActiveChecks(prisma);
    const stub = await runStubChecks(prisma);

    let failed = 0;
    failed += renderChecks("=== Migradas ===", active);
    failed += renderChecks("=== Stubs aguardando dados ===", stub);

    const activeModels = listByStatus("active");
    const stubModels = listByStatus("stub");
    console.log(
      `\n${c.bold("Resumo:")} ${activeModels.length} migrada(s), ${stubModels.length} stub(s).`,
    );

    if (failed === 0) {
      console.log(c.green("Todas as checagens passaram."));
      process.exit(0);
    } else {
      console.log(c.red(`${failed} checagem(ns) falharam.`));
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
