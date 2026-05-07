/**
 * Seed entrypoint:
 *   1) importa os JSONs em `data/raw/` via `runImport()`.
 *   2) cria/atualiza o admin inicial a partir de SEED_ADMIN_PASSWORD.
 */
import "dotenv/config";

import bcrypt from "bcryptjs";

import { createPrismaClient } from "../lib/db";
import { printSummary, runImport } from "../scripts/import-raw";

const ADMIN_EMAIL = "admin@gazin.local";
const ADMIN_NAME = "Administrador";

async function main() {
  const prisma = createPrismaClient();
  try {
    const { stats } = await runImport(prisma);
    printSummary(stats);

    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      console.log(
        "\n[seed] SEED_ADMIN_PASSWORD ausente — pulando criação do admin.",
      );
    } else {
      const hash = await bcrypt.hash(adminPassword, 10);
      await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        create: {
          email: ADMIN_EMAIL,
          name: ADMIN_NAME,
          password: hash,
          role: "admin",
        },
        update: { password: hash, role: "admin", deletedAt: null },
      });
      console.log(`\n[seed] Admin pronto: ${ADMIN_EMAIL}`);
    }
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
