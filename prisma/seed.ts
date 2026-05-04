/**
 * Seed entrypoint. Delega ao importer em `scripts/import-raw.ts`.
 * Quando auth chegar (Tarefa 5), o admin inicial via `SEED_ADMIN_PASSWORD`
 * passa a ser criado aqui também.
 */
import "dotenv/config";

import { createPrismaClient } from "../lib/db";
import { printSummary, runImport } from "../scripts/import-raw";

async function main() {
  const prisma = createPrismaClient();
  try {
    const { stats } = await runImport(prisma);
    printSummary(stats);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
