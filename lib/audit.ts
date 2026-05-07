/**
 * Audit log — append-only.
 *
 * Captura de userId:
 *   O BRIEF pede "via Prisma client extension". Tentei o caminho mais puro
 *   (extension global capturando session via AsyncLocalStorage) — esbarra em
 *   limitação real: extensions Prisma não têm acesso a request scope sem um
 *   middleware HTTP que injete o storage por request, e server actions do
 *   Next 16 não expõem isso de forma estável.
 *
 *   A camada genérica `createCrudActions` (lib/actions/crud.ts) é o ponto
 *   natural — ela já cobre as 17 entidades, captura `actor()` via NextAuth,
 *   e centraliza create/update/softDelete/restore. Custom actions (updateDias,
 *   updateItens) chamam `recordAudit` explicitamente. Resultado equivalente:
 *   dev novo NÃO escreve direto no Prisma; usa o factory ou a função aqui.
 *
 * Sanitização:
 *   `before`/`after` passam por `sanitize()` que dropa chaves sensíveis
 *   (password, hash, token, secret, senha). Assinaturas, URLs de arquivo e
 *   metadados normais passam.
 *
 * Visualização (RBAC):
 *   `loadAuditLogs` exige session + valida `userCanAccessId(viewer, model, id)`
 *   antes de devolver — gestor_filial/operacional não vê histórico fora do
 *   escopo. Admins veem tudo.
 */
import type {
  AuditAction,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma, userCanAccessId } from "@/lib/db";

/** Cliente Prisma OU transação. Aceito por `recordAudit` para atomicidade. */
type PrismaLike =
  | PrismaClient
  | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const SENSITIVE_KEY_RE =
  /(^|_|[A-Z])(password|senha|hash|token|secret|accesskey|secretkey|apikey)/i;

function sanitize(input: unknown): unknown {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map(sanitize);
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEY_RE.test(k)) continue;
      // Decimal e Date virariam string ao serializar — passa adiante.
      out[k] = sanitize(v);
    }
    return out;
  }
  return input;
}

function toJsonValue(v: unknown): Prisma.InputJsonValue | undefined {
  if (v == null) return undefined;
  // Prisma rejeita undefined no campo; null já vira Prisma.JsonNull se quiser.
  // Serializa via JSON pra normalizar Decimal/Date.
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export interface AuditActor {
  id: string;
}

/**
 * Grava um evento no AuditLog. Chamado pelo factory CRUD e por custom actions
 * SEMPRE dentro de uma transação Prisma (`tx` argumento). Audit é OBRIGATÓRIO:
 * se falha, a transação é revertida — mutação não fica sem log.
 *
 * Transação atômica é viável porque AuditLog vive no mesmo DB que as entidades
 * de negócio (sem necessidade de distributed tx). Quando `tx` não é passado
 * (callers fora de transação, raros), grava com prisma global; falha sobe
 * stack normalmente — sem catch silencioso.
 */
export async function recordAudit(
  params: {
    actor: AuditActor;
    entityType: string;
    entityId: string;
    action: AuditAction;
    before?: unknown;
    after?: unknown;
  },
  tx?: PrismaLike,
): Promise<void> {
  const client = (tx ?? prisma) as PrismaClient;
  await client.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      userId: params.actor.id,
      before: toJsonValue(sanitize(params.before)),
      after: toJsonValue(sanitize(params.after)),
    },
  });
}

// ---------------------------------------------------------------------------
// Visualização
// ---------------------------------------------------------------------------

export interface AuditLogView {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  createdAt: string; // ISO
  user: { id: string; name: string; email: string };
  before: unknown;
  after: unknown;
}

/**
 * Carrega logs de uma entidade ordenados desc. Exige session + RBAC: viewer
 * só recebe logs se ele puder acessar o entityId pelo scopedPrisma.
 *
 * `entityType` é o nome do model em PascalCase ("Usina", "Filial", ...) — o
 * mesmo usado pelo `createCrudActions(prismaModel, ...)`.
 */
export async function loadAuditLogs(
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<AuditLogView[]> {
  const session = await auth();
  if (!session?.user) return [];

  // RBAC: o viewer pode ver o histórico apenas se enxerga a entidade.
  const modelLower =
    entityType.charAt(0).toLowerCase() + entityType.slice(1);
  const ok = await userCanAccessId(session.user, modelLower, entityId);
  if (!ok) return [];

  const rows = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    createdAt: r.createdAt.toISOString(),
    user: r.user,
    before: r.before,
    after: r.after,
  }));
}
