/**
 * Validates that an `npm run db:seed` run round-tripped the raw JSON dumps
 * faithfully:
 *
 *   1. Parses each JSON in `data/raw/` and counts the rows.
 *   2. Compares against the row count in the corresponding Prisma model.
 *   3. Spot-checks a few known invariants (FK resolution rate, etc).
 *
 * Exits with code 1 if anything looks off, so it's safe to wire into CI later.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPrismaClient } from "@/lib/db";

const RAW_DIR = path.join(process.cwd(), "data", "raw");

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

async function main() {
  const prisma = createPrismaClient();
  const checks: Check[] = [];

  try {
    // ---- Row count parity ---------------------------------------------------
    const pairs: { file: string; count: () => Promise<number>; label: string }[] = [
      { file: "Usinas Relatório.json", label: "Filial", count: () => prisma.filial.count() },
      { file: "Cadástro de usinas Relatório.json", label: "Usina", count: () => prisma.usina.count() },
      { file: "Cadastro de fornecedores Relatório.json", label: "Fornecedor", count: () => prisma.fornecedor.count() },
      { file: "Geração Usinas Relatório.json", label: "Geracao", count: () => prisma.geracao.count() },
      { file: "Consumo Relatório.json", label: "Consumo", count: () => prisma.consumo.count() },
      { file: "Controle de injeção Relatório.json", label: "Injecao", count: () => prisma.injecao.count() },
      { file: "Cadastro de orçamento Relatório.json", label: "Orcamento", count: () => prisma.orcamento.count() },
      { file: "Cronograma de limpeza - report.json", label: "CronogramaLimpeza", count: () => prisma.cronogramaLimpeza.count() },
      { file: "Cronograma de manutenção preventiva Relatório.json", label: "ManutencaoPreventiva", count: () => prisma.manutencaoPreventiva.count() },
      { file: "Processos ADMs e Judiciais, Relatório.json", label: "ProcessoJuridico", count: () => prisma.processoJuridico.count() },
    ];

    for (const p of pairs) {
      const expected = (await loadRows(p.file)).length;
      const actual = await p.count();
      checks.push({
        label: `${p.label} count`,
        ok: expected === actual,
        detail: `expected=${expected} actual=${actual}`,
      });
    }

    // VendaKwhMes is wide-to-long, so row count differs. We assert at least
    // one row per source row.
    {
      const sourceRows = (await loadRows("Venda de energia elétrica Relatório.json")).length;
      const exploded = await prisma.vendaKwhMes.count();
      checks.push({
        label: "VendaKwhMes explosion",
        ok: exploded >= sourceRows,
        detail: `source=${sourceRows} long=${exploded}`,
      });
    }

    // ---- FK resolution rate -------------------------------------------------
    const usinaTotal = await prisma.usina.count();
    const usinaWithFilial = await prisma.usina.count({ where: { filialId: { not: null } } });
    checks.push({
      label: "Usina → Filial linkage",
      ok: usinaTotal === 0 || usinaWithFilial > 0,
      detail: `${usinaWithFilial}/${usinaTotal} usinas linked to a filial`,
    });

    const geracaoTotal = await prisma.geracao.count();
    const geracaoLinked = await prisma.geracao.count({ where: { usinaId: { not: null } } });
    checks.push({
      label: "Geracao → Usina linkage",
      ok: geracaoTotal === 0 || geracaoLinked > 0,
      detail: `${geracaoLinked}/${geracaoTotal} geracoes linked to a usina`,
    });

    // ---- Daily geração rows -------------------------------------------------
    const dias = await prisma.geracaoDia.count();
    checks.push({
      label: "GeracaoDia present",
      ok: geracaoTotal === 0 || dias > 0,
      detail: `${dias} daily values across ${geracaoTotal} geracoes`,
    });
  } finally {
    await prisma.$disconnect();
  }

  // ---- Report ---------------------------------------------------------------
  console.log("\n=== Validation report ===");
  let failed = 0;
  for (const c of checks) {
    const icon = c.ok ? "[OK]  " : "[FAIL]";
    console.log(`  ${icon} ${c.label.padEnd(32)} ${c.detail}`);
    if (!c.ok) failed++;
  }
  console.log(`\n${failed === 0 ? "All checks passed." : `${failed} check(s) failed.`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
