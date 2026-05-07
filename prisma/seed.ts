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

    let adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const isProd = process.env.NODE_ENV === "production";

    if (!adminPassword) {
      if (isProd) {
        throw new Error(
          "[seed] SEED_ADMIN_PASSWORD obrigatório em produção. " +
            "Defina a variável e rode novamente.",
        );
      }
      // Em dev: gera senha aleatória forte e imprime no console (uma vez).
      const { randomBytes } = await import("node:crypto");
      adminPassword = randomBytes(12).toString("base64url");
      console.log(
        "\n[seed] SEED_ADMIN_PASSWORD ausente — senha aleatória gerada (apenas dev):",
      );
      console.log(`        ${adminPassword}`);
      console.log(
        "        Copie e guarde — não será reimpressa. Em prod, defina a variável.",
      );
    } else if (adminPassword.length < 12) {
      const msg =
        `[seed] SEED_ADMIN_PASSWORD muito curta (${adminPassword.length} chars). ` +
        `Mínimo 12.`;
      if (isProd) throw new Error(msg);
      console.warn(msg + " Aceita em dev mas troque antes do deploy.");
    }

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
