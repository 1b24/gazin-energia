import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 dropped the legacy `datasources` constructor option. Direct Postgres
// connections now go through a driver adapter; HTTP `prisma+postgres://` URLs go
// through `accelerateUrl` (and require an older client). For both `prisma dev`
// and managed Postgres we use the TCP driver adapter.
export function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (url.startsWith("prisma+postgres://") || url.startsWith("prisma://")) {
    return new PrismaClient({ accelerateUrl: url });
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ----------------------------------------------------------------------------
// Tenant scoping — gestor_filial e operacional só veem dados da própria filial.
// ----------------------------------------------------------------------------

/**
 * Models cuja query precisa ser filtrada por `filialId` quando o usuário é
 * gestor_filial / operacional. Models sem coluna filialId (ex: Geracao,
 * VendaKwh, Orcamento) cascateiam via Usina — não são filtrados aqui;
 * filtre via `usina: { filialId }` na chamada quando necessário.
 */
const FILIAL_SCOPED_MODELS = new Set([
  "filial",
  "usina",
  "consumo",
  "injecao",
  "fornecedor",
  "user",
]);

/**
 * Devolve um cliente Prisma escopado para a filial do usuário atual. Admins
 * recebem o cliente normal; gestor_filial/operacional recebem um cliente
 * que injeta `filialId = <user.filialId>` em todo `findMany`/`findFirst`/
 * `count`/`update`/`delete` dos models acima.
 *
 * Para uso em server components / server actions:
 *
 *   ```ts
 *   const session = await auth();
 *   const db = scopedPrisma(session?.user);
 *   const usinas = await db.usina.findMany({ ... });
 *   ```
 */
type ScopedUser = { role?: string; filialId?: string | null } | null | undefined;

export function scopedPrisma(user: ScopedUser): PrismaClient {
  if (!user || user.role === "admin" || !user.filialId) {
    // Admin e usuários sem filial veem tudo.
    return prisma;
  }
  const filialId = user.filialId;

  return prisma.$extends({
    name: "filial-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const m = model.charAt(0).toLowerCase() + model.slice(1);
          if (!FILIAL_SCOPED_MODELS.has(m)) return query(args);
          // Lemos/contamos/escrevemos só onde filialId === user.filialId.
          // Em inserts (`create`), o caller decide o filialId.
          if (
            operation === "findMany" ||
            operation === "findFirst" ||
            operation === "findUnique" ||
            operation === "count" ||
            operation === "aggregate" ||
            operation === "groupBy" ||
            operation === "updateMany" ||
            operation === "deleteMany"
          ) {
            const a = (args ?? {}) as { where?: Record<string, unknown> };
            // Filial em si filtra por id; demais models por filialId.
            if (m === "filial") {
              a.where = { AND: [a.where ?? {}, { id: filialId }] };
            } else {
              a.where = { AND: [a.where ?? {}, { filialId }] };
            }
            return query(a);
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}
