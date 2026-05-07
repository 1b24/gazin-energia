/**
 * check:rbac — verificação estática de uso de Prisma fora dos arquivos
 * permitidos. Falha (exit 1) se algum `app/**` ou outro consumidor user-facing
 * usar `prisma.<model>.<op>(...)` sem passar antes pela camada escopada.
 *
 * Allowlist (arquivos onde o uso direto é necessário/aceitável):
 *  - lib/db.ts                        (define o singleton + scopedPrisma)
 *  - lib/auth.ts                      (Credentials provider — login pré-session)
 *  - lib/actions/crud.ts              (factory mutate; faz pre-check via scopedPrisma)
 *  - prisma/seed.ts                   (CLI de seed)
 *  - scripts/import-raw.ts            (CLI de import)
 *  - scripts/validate-migration.ts    (CLI de validate)
 *  - app/(dashboard)/layout.tsx       (busca a própria filial do user pelo id que ele já tem)
 *
 * Outros usos custom (ex: app/(dashboard)/X/actions.ts updateY) são permitidos
 * SE chamarem auth() + userCanAccessId/scopedPrisma antes do prisma direto.
 * O check confirma essa convenção via heurística: arquivo precisa importar
 * `auth` E `userCanAccessId` (ou `scopedPrisma`) quando chama prisma direto.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const ALLOWLIST = new Set(
  [
    "lib/db.ts",
    "lib/auth.ts",
    "lib/actions/crud.ts",
    "prisma/seed.ts",
    "scripts/import-raw.ts",
    "scripts/validate-migration.ts",
    "scripts/check-rbac.ts",
    "app/(dashboard)/layout.tsx",
  ].map((p) => p.replace(/\\/g, "/")),
);

const PRISMA_OP = /\bprisma\.[a-zA-Z]+\.(findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\b/;

interface Issue {
  file: string;
  line: number;
  match: string;
  reason: string;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      out.push(...(await walk(full)));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

async function listFiles(): Promise<string[]> {
  const dirs = ["app", "lib"];
  const all: string[] = [];
  for (const d of dirs) all.push(...(await walk(path.join(ROOT, d))));
  return all.map((f) =>
    path.relative(ROOT, f).replace(/\\/g, "/"),
  );
}

function fileImportsScopeHelpers(content: string): boolean {
  // Heurística: se o arquivo importa `auth` E (userCanAccessId ou scopedPrisma),
  // assumimos que o autor implementou o check. O script não consegue provar
  // que o check está em CADA chamada, mas pega arquivos sem o mínimo.
  const imp1 = /from\s+["']@\/lib\/auth["']/;
  const imp2 = /\b(userCanAccessId|scopedPrisma|applyCreateScope)\b/;
  return imp1.test(content) && imp2.test(content);
}

async function main() {
  const files = await listFiles();
  const issues: Issue[] = [];

  for (const f of files) {
    if (ALLOWLIST.has(f)) continue;
    const abs = path.join(ROOT, f);
    let src: string;
    try {
      src = await readFile(abs, "utf-8");
    } catch {
      continue;
    }
    const lines = src.split(/\r?\n/);
    let firstHit: { line: number; match: string } | null = null;
    for (let i = 0; i < lines.length; i++) {
      const m = PRISMA_OP.exec(lines[i]);
      if (m) {
        firstHit = { line: i + 1, match: m[0] };
        break;
      }
    }
    if (!firstHit) continue;

    if (fileImportsScopeHelpers(src)) {
      // Arquivo passa pela heurística — inspeção manual recomendada mas não
      // bloqueia o check.
      continue;
    }

    issues.push({
      file: f,
      line: firstHit.line,
      match: firstHit.match,
      reason:
        "Uso direto de prisma sem importar auth + userCanAccessId/scopedPrisma. " +
        "Use scopedPrisma(session?.user) ou adicione check de escopo.",
    });
  }

  if (issues.length === 0) {
    console.log("[check:rbac] OK — nenhum uso desprotegido encontrado.");
    return;
  }

  console.error(`[check:rbac] FAIL — ${issues.length} problema(s):\n`);
  for (const it of issues) {
    console.error(`  ${it.file}:${it.line}`);
    console.error(`    ${it.match}`);
    console.error(`    ${it.reason}\n`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
