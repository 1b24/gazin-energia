import { Prisma, PrismaClient } from "@prisma/client";
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
// "Connection terminated unexpectedly" aparecem quando uma socket do PGLite
// expira/recicla entre requisições do dev server. Não é falha real do banco.
//
// Estratégia: até 3 tentativas com backoff curto entre elas. O pool do
// Prisma costuma ter várias sockets — se a primeira está morta, a segunda
// pode estar também (mesmo idle timeout). O delay dá tempo do pool fazer
// health check e descartar sockets mortas antes da próxima tentativa.
// ----------------------------------------------------------------------------

const TRANSIENT_CONNECTION_ERRORS = [
  "Server has closed the connection",
  "Connection terminated unexpectedly",
  "Connection terminated",
  // node-postgres / pg socket errors que vazam pela borda do Prisma:
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "read ECONNRESET",
  "socket hang up",
];

/**
 * Códigos de erro do Prisma que indicam falha de conexão transiente.
 * Referência: https://www.prisma.io/docs/reference/api-reference/error-reference
 *  - P1xxx: família de erros de conexão (can't-reach, timeout, TLS, server-closed).
 *  - P2024: Timed out fetching a new connection from the connection pool.
 *
 * `isTransientConnectionError` trata `code.startsWith("P1")` + P2024 como
 * família transiente; não mantemos allowlist fechada porque novos códigos
 * P1xxx em versões futuras seriam falsos negativos.
 */

function isTransientConnectionError(err: unknown): boolean {
  // Match por código Prisma — qualquer P1xxx é erro de conexão por contrato:
  // P1001..P1017 cobrem can't-reach, timeout, TLS, server-closed. Vale
  // tratar a família inteira como transiente em dev — falso positivo apenas
  // tenta de novo, falso negativo vaza erro pro UI (pior).
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code.startsWith("P1") || err.code === "P2024") return true;
  }
  // Erros "Unknown" do Prisma frequentemente são socket errors do driver pg
  // que escaparam sem código atribuído. Vale tratar como transiente.
  if (err instanceof Prisma.PrismaClientUnknownRequestError) return true;
  // PrismaClientInitializationError tipicamente é conexão (P1001/P1002 etc).
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  // PrismaClientRustPanicError também — adapter-pg às vezes panic em socket morta.
  if (err instanceof Prisma.PrismaClientRustPanicError) return true;
  // Fallback: match por mensagem (drivers que vazam direto sem wrap).
  if (!(err instanceof Error)) return false;
  return TRANSIENT_CONNECTION_ERRORS.some((m) => err.message.includes(m));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa `operation()` com até 3 retries em caso de erro transiente de
 * conexão. Estratégia escalonada:
 *   - Tentativa 1: direta.
 *   - Tentativa 2 (após 100ms): direta — pool pode descartar socket morta.
 *   - Tentativa 3 (após 300ms): direta — última chance "barata".
 *   - Tentativa 4 (após 500ms): força `$disconnect()` ANTES — força o pool
 *     a abrir conexões novas do zero. Use apenas como último recurso porque
 *     `$disconnect` afeta o singleton (pode cortar requests concorrentes em
 *     outras rotas se rodando em paralelo). Em dev / situação degradada o
 *     trade-off vale: ou todas as queries falham, ou recuperamos.
 *
 * Use em queries de LEITURA chamadas por páginas/server actions. Mutations
 * em transação NÃO devem ser envolvidas — re-executar pode duplicar audit
 * e efeitos colaterais.
 */
export async function retryClosedConnection<T>(
  operation: () => Promise<T>,
): Promise<T> {
  // Tentativas "baratas" — sem mexer no pool global.
  const cheapDelays = [0, 100, 300];
  let lastErr: unknown;
  for (const delay of cheapDelays) {
    if (delay > 0) await sleep(delay);
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (!isTransientConnectionError(err)) {
        // Loga uma vez no servidor antes de propagar — útil pra diagnosticar
        // erros NÃO-transientes que vazam pra UI sem retry. Aparece no
        // terminal do `npm run dev`.
        logUnhandledDbError(err);
        throw err;
      }
      // Erro transiente — continua pra próxima tentativa.
    }
  }

  // Última cartada — força reset do pool. Disconnect explícito + delay
  // para o cliente reconectar do zero na próxima operação.
  // Nota: se o problema é o SERVIDOR PGLite estar zumbi (porta aberta mas
  // não respondendo), nem o reset do pool resolve — precisa reiniciar o
  // PGLite. Esse caminho protege contra "pool com sockets mortas".
  try {
    await prisma.$disconnect();
  } catch {
    // ignora — se o disconnect falhou, a próxima operação reconecta sozinha.
  }
  await sleep(500);
  try {
    return await operation();
  } catch (err) {
    // Esgotou as 4 tentativas. Loga contexto pra diagnóstico antes de propagar.
    logUnhandledDbError(err, { afterRetries: true, firstError: lastErr });
    throw err;
  }
}

function logUnhandledDbError(
  err: unknown,
  ctx: { afterRetries?: boolean; firstError?: unknown } = {},
) {
  if (typeof process === "undefined" || process.env.NODE_ENV === "test") return;
  const summary = {
    afterRetries: !!ctx.afterRetries,
    name: err instanceof Error ? err.constructor.name : typeof err,
    code:
      err instanceof Prisma.PrismaClientKnownRequestError
        ? err.code
        : err instanceof Prisma.PrismaClientInitializationError
          ? err.errorCode
          : undefined,
    message: err instanceof Error ? err.message.slice(0, 200) : String(err),
    firstErrorName:
      ctx.firstError instanceof Error
        ? ctx.firstError.constructor.name
        : undefined,
    firstErrorCode:
      ctx.firstError instanceof Prisma.PrismaClientKnownRequestError
        ? ctx.firstError.code
        : undefined,
  };
  console.error("[retryClosedConnection] unhandled DB error:", summary);
}
