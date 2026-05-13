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
 * Tipos de scoping por model:
 *   - "id":         model é a Filial em si — filtra por `id = user.filialId`.
 *   - "filialId":   model tem coluna `filialId` direta.
 *   - "usina":      model linka pra Usina — filtra via `usina.filialId`.
 *   - omitido:      não escopado (ex: Fornecedor, Documento, ProcessoJuridico).
 */
const MODEL_SCOPE: Record<string, "id" | "filialId" | "usina"> = {
  filial: "id",
  usina: "filialId",
  consumo: "filialId",
  injecao: "filialId",
  user: "filialId",
  // Via Usina (models sem coluna filialId direta):
  geracao: "usina",
  vendaKwh: "usina",
  orcamento: "usina",
  cronogramaLimpeza: "usina",
  manutencaoPreventiva: "usina",
  consertoEquipamento: "usina",
  manutencaoCorretiva: "usina",
  licenca: "usina",
};

export type ScopedUser = { role?: string; filialId?: string | null } | null | undefined;

/**
 * Devolve um cliente Prisma escopado para a filial do usuário. Admins recebem
 * o cliente normal. Gestor_filial / operacional recebem cliente extended que
 * injeta filtro de filial em **leituras** (findMany/findFirst/count/aggregate/
 * groupBy/updateMany/deleteMany).
 *
 * `findUnique`/`update`/`delete` por id NÃO são escopados pelo extension
 * (Prisma exige unique key, não aceita AND no where). A proteção pra mutações
 * por id vive no factory `createCrudActions` (lib/actions/crud.ts), que faz
 * pre-check via `findFirst` escopado antes de qualquer write.
 */
export function scopedPrisma(user: ScopedUser): PrismaClient {
  if (!user || user.role === "admin" || !user.filialId) {
    return prisma;
  }
  const filialId = user.filialId;

  return prisma.$extends({
    name: "filial-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const m = model.charAt(0).toLowerCase() + model.slice(1);
          const scope = MODEL_SCOPE[m];
          if (!scope) return query(args);

          // Operações que aceitam `where` arbitrário:
          if (
            operation !== "findMany" &&
            operation !== "findFirst" &&
            operation !== "count" &&
            operation !== "aggregate" &&
            operation !== "groupBy" &&
            operation !== "updateMany" &&
            operation !== "deleteMany"
          ) {
            return query(args);
          }

          const a = (args ?? {}) as { where?: Record<string, unknown> };
          let scopeWhere: Record<string, unknown>;
          if (scope === "id") scopeWhere = { id: filialId };
          else if (scope === "filialId") scopeWhere = { filialId };
          else /* "usina" */ scopeWhere = { usina: { filialId } };

          a.where = { AND: [a.where ?? {}, scopeWhere] };
          return query(a);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/**
 * Helper pra crud factory — devolve `true` se o user pode operar sobre o
 * registro com aquele id. Usa scopedPrisma + findFirst.
 */
export async function userCanAccessId(
  user: ScopedUser,
  modelLower: string,
  id: string,
): Promise<boolean> {
  if (!user || user.role === "admin") return true;
  if (!user.filialId) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = scopedPrisma(user) as any;
  const delegate = db[modelLower];
  if (!delegate?.findFirst) return false;
  const found = await delegate.findFirst({ where: { id }, select: { id: true } });
  return !!found;
}

/**
 * Decide se o input de `create` precisa ser sobrescrito com o filialId do
 * usuário (defesa contra gestor_filial criando registro em outra filial).
 * Retorna `data` com filialId/usinaId forçado quando aplicável.
 */
export function applyCreateScope(
  user: ScopedUser,
  modelLower: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!user || user.role === "admin" || !user.filialId) return data;
  const scope = MODEL_SCOPE[modelLower];
  if (!scope) return data;
  if (scope === "filialId") {
    return { ...data, filialId: user.filialId };
  }
  // Para "usina"-scoped, se a usinaId fornecida não pertencer à filial do
  // user, o create vai falhar no pre-check (userCanAccessId no usinaId).
  return data;
}

// ----------------------------------------------------------------------------
// Retry transiente para PGLite — "Server has closed the connection" e
// "Connection terminated unexpectedly" aparecem quando a socket do PGLite
// expira/recicla entre requisições do dev server. Não é falha real do banco;
// uma segunda tentativa imediata costuma passar.
// ----------------------------------------------------------------------------

const TRANSIENT_CONNECTION_ERRORS = [
  "Server has closed the connection",
  "Connection terminated unexpectedly",
];

function isTransientConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return TRANSIENT_CONNECTION_ERRORS.some((m) => err.message.includes(m));
}

/**
 * Executa `operation()` com retry único quando o erro for transiente de
 * conexão. Se falhar de novo, propaga o erro original.
 *
 * Use em queries lidas por páginas/server actions que falham com 500 quando
 * o PGLite recicla a socket. Mutations em transação NÃO devem ser envolvidas
 * aqui — re-executar pode duplicar audit/efeitos colaterais.
 */
export async function retryClosedConnection<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (isTransientConnectionError(err)) return operation();
    throw err;
  }
}
