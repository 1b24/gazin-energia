/**
 * Seed entrypoint. Currently delegates to the raw-JSON importer in
 * `scripts/import-raw.ts`. When proper auth/admin user seeding lands, that goes
 * here too (likely guarded by `SEED_ADMIN_PASSWORD`).
 */
import { PrismaClient } from "@prisma/client";
import { printSummary, runImport } from "../scripts/import-raw";

async function main() {
  const prisma = new PrismaClient();
  try {
    const stats = await runImport(prisma);
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
