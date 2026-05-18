/**
 * Import isolado de Geração — usa o pipeline existente em
 * `scripts/import-raw.ts` (`importGeracao`), idempotente por `zohoId`.
 *
 * Diferente de `npm run db:seed`, NÃO toca em outras entidades nem reseta
 * a senha do admin. Roda apenas:
 *   1. Geracao.upsert por zohoId.
 *   2. GeracaoDia.upsert/delete por (geracaoId, dia).
 *
 * Path de entrada (fixo, contrato do importer): `data/raw/geracao.json`.
 */
import "dotenv/config";

import { createPrismaClient } from "../lib/db";
import { importGeracao } from "./import-raw";

async function main() {
  const prisma = createPrismaClient();
  const t0 = Date.now();
  try {
    const before = {
      geracoes: await prisma.geracao.count(),
      dias: await prisma.geracaoDia.count(),
    };
    console.log("[import-geracao] antes:", before);

    await importGeracao(prisma);

    const after = {
      geracoes: await prisma.geracao.count(),
      dias: await prisma.geracaoDia.count(),
    };
    console.log("[import-geracao] depois:", after);
    console.log("[import-geracao] delta:", {
      geracoes: after.geracoes - before.geracoes,
      dias: after.dias - before.dias,
    });
    console.log(`[import-geracao] concluído em ${Date.now() - t0}ms`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[import-geracao] FAIL:", err);
    process.exit(1);
  });
