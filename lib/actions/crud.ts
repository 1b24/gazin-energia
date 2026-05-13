/**
 * CRUD action factory — entity-agnostic.
 *
 * Cada página de entidade na Tarefa 4 cria um `actions.ts` "use server" que
 * importa e expõe as ações geradas aqui:
 *
 *   ```ts
 *   "use server";
 *   import { z } from "zod";
 *   import { createCrudActions } from "@/lib/actions/crud";
 *   import { usinaSchema } from "@/lib/schemas/usina";
 *
 *   const actions = createCrudActions("Usina", usinaSchema);
 *   export const create     = actions.create;
 *   export const update     = actions.update;
 *   export const softDelete = actions.softDelete;
 *   export const restore    = actions.restore;
 *   export const bulkDelete = actions.bulkDelete;
 *   export const bulkExport = actions.bulkExport;
 *   ```
 *
 * `prismaModel` é a chave camelCase do PrismaClient (`"usina"`, `"filial"`,
 * `"cronogramaLimpeza"` ...). Usado via dispatch dinâmico — o type system
 * confere via `keyof PrismaClient` em opções avançadas, mas pra simplicidade
 * aqui mantemos `string` e validamos em runtime.
 *
 * Audit (Tarefa 6) e RBAC (Tarefa 5) são integrados pelos hooks `onMutation`
 * e `getActor` opcionais — estubados por enquanto.
 */
import { revalidatePath } from "next/cache";

import { Prisma } from "@prisma/client";
import { serializePrisma } from "@/lib/serialize";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  applyCreateScope,
  prisma,
  scopedPrisma,
  userCanAccessId,
} from "@/lib/db";
import { exportRows, type ExportFormat } from "@/lib/exports";
import { isStub } from "@/lib/modules/status";

export type CrudActor = {
  id: string;
  email?: string | null;
  role: string;
  filialId?: string | null;
} | null;

export interface CrudHooks {
  /** Resolve o usuário atual a partir do contexto da request (NextAuth na T5). */
  getActor?: () => Promise<CrudActor>;
  /** Loga mutação no audit (T6). */
  onMutation?: (event: {
    actor: CrudActor;
    model: string;
    action: "create" | "update" | "soft_delete" | "restore" | "hard_delete";
    entityId: string;
    before?: unknown;
    after?: unknown;
  }) => Promise<void>;
}

let globalHooks: CrudHooks = {};

/** Define hooks globais (chamado uma vez do auth/audit setup). */
export function configureCrudHooks(hooks: CrudHooks) {
  globalHooks = hooks;
}

interface CrudOptions {
  /** Sobrescreve hooks globais para esta entidade. */
  hooks?: CrudHooks;
  /** Default `true`. Stubs ignoram mutate (lança erro). */
  enforceStubBlock?: boolean;
  /** Path(s) a invalidar via `revalidatePath` após qualquer mutação. */
  revalidate?: string | string[];
}

// Tipo opaco para o delegate dinâmico do Prisma (`prisma[modelLower]`).
// O cliente Prisma tipa cada model como objeto com `create`, `update`, etc.
type AnyDelegate = {
  create: (args: { data: unknown }) => Promise<{ id: string }>;
  update: (args: {
    where: { id: string };
    data: unknown;
  }) => Promise<{ id: string }>;
  findUnique: (args: { where: { id: string } }) => Promise<unknown>;
  findMany: (args?: { where?: unknown; take?: number }) => Promise<unknown[]>;
  count: (args?: { where?: unknown }) => Promise<number>;
};

function delegateFor(
  prismaModel: string,
  client: unknown = prisma,
): AnyDelegate {
  const key = prismaModel.charAt(0).toLowerCase() + prismaModel.slice(1);
  // O cliente Prisma 7 expõe os models pelo nome em camelCase. Aceita um
  // tx (interactive transaction) no lugar do client global.
  const delegate = (client as Record<string, AnyDelegate>)[key];
  if (!delegate) {
    throw new Error(`PrismaClient não tem o model "${prismaModel}".`);
  }
  return delegate;
}

export function createCrudActions<S extends z.ZodObject>(
  prismaModel: string,
  schema: S,
  opts: CrudOptions = {},
) {
  const { enforceStubBlock = true, hooks: localHooks, revalidate } = opts;

  function bustCache() {
    if (!revalidate) return;
    const paths = Array.isArray(revalidate) ? revalidate : [revalidate];
    for (const p of paths) revalidatePath(p);
  }

  function effectiveHooks(): CrudHooks {
    return { ...globalHooks, ...localHooks };
  }

  function ensureNotStub() {
    if (enforceStubBlock && isStub(prismaModel)) {
      throw new Error(
        `Mutações em "${prismaModel}" estão desabilitadas — entidade é stub. ` +
          `Mude ENTITY_STATUS para "active" antes.`,
      );
    }
  }

  /**
   * Actor padrão usa a session do NextAuth. Pode ser sobrescrito via hook.
   */
  async function actor(): Promise<CrudActor> {
    const fromHook = await effectiveHooks().getActor?.();
    if (fromHook) return fromHook;
    const session = await auth();
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      filialId: session.user.filialId,
    };
  }

  function modelLower() {
    return prismaModel.charAt(0).toLowerCase() + prismaModel.slice(1);
  }

  /** Lança se o user não pode acessar o registro (via scopedPrisma). */
  async function ensureCanAccess(id: string) {
    const a = await actor();
    if (!a) {
      throw new Error("Não autenticado.");
    }
    const ok = await userCanAccessId(a, modelLower(), id);
    if (!ok) {
      throw new Error("Não autorizado: registro fora do escopo do usuário.");
    }
  }

  /**
   * Grava audit DENTRO de uma transação. Chamada pelos métodos CRUD com o
   * `tx` ativo — falha aqui reverte a mutação. Hooks customizados (testes /
   * extensions) ficam fora da tx (best-effort, não-bloqueante).
   */
  async function auditInTx(
    tx: unknown,
    actorVal: NonNullable<CrudActor>,
    action: "create" | "update" | "soft_delete" | "restore" | "hard_delete",
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await recordAudit(
      {
        actor: { id: actorVal.id, email: actorVal.email },
        entityType: prismaModel,
        entityId,
        action,
        before,
        after,
      },
      tx as never,
    );
  }

  async function fireHook(
    actorVal: CrudActor,
    action: "create" | "update" | "soft_delete" | "restore" | "hard_delete",
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    const hook = effectiveHooks().onMutation;
    if (!hook) return;
    try {
      await hook({
        actor: actorVal,
        model: prismaModel,
        action,
        entityId,
        before,
        after,
      });
    } catch (err) {
      // Hook é opcional/externo. Não pode reverter a tx do audit canônico.
      console.error("[crud] hook onMutation falhou:", err);
    }
  }

  async function create(input: unknown) {
    ensureNotStub();
    const a = await actor();
    if (!a) throw new Error("Não autenticado.");
    let data = schema.parse(input) as Record<string, unknown>;
    data = applyCreateScope(a, modelLower(), data);

    const created = await prisma.$transaction(async (tx) => {
      const delegate = delegateFor(prismaModel, tx);
      const c = await delegate.create({ data });
      await auditInTx(tx, a, "create", c.id, null, c);
      return c;
    });
    bustCache();
    await fireHook(a, "create", created.id, null, created);
    return serializePrisma(created);
  }

  async function update(id: string, input: unknown) {
    ensureNotStub();
    await ensureCanAccess(id);
    const a = await actor();
    if (!a) throw new Error("Não autenticado.");
    const data = schema.partial().parse(input);

    const result = await prisma.$transaction(async (tx) => {
      const delegate = delegateFor(prismaModel, tx);
      const before = await delegate.findUnique({ where: { id } });
      const after = await delegate.update({ where: { id }, data });
      await auditInTx(tx, a, "update", id, before, after);
      return { before, after };
    });
    bustCache();
    await fireHook(a, "update", id, result.before, result.after);
    return serializePrisma(result.after);
  }

  async function softDelete(id: string) {
    ensureNotStub();
    await ensureCanAccess(id);
    const a = await actor();
    if (!a) throw new Error("Não autenticado.");

    const result = await prisma.$transaction(async (tx) => {
      const delegate = delegateFor(prismaModel, tx);
      const before = await delegate.findUnique({ where: { id } });
      const after = await delegate.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await auditInTx(tx, a, "soft_delete", id, before, after);
      return { before, after };
    });
    bustCache();
    await fireHook(a, "soft_delete", id, result.before, result.after);
    return serializePrisma(result.after);
  }

  async function restore(id: string) {
    ensureNotStub();
    await ensureCanAccess(id);
    const a = await actor();
    if (!a) throw new Error("Não autenticado.");

    const result = await prisma.$transaction(async (tx) => {
      const delegate = delegateFor(prismaModel, tx);
      const before = await delegate.findUnique({ where: { id } });
      const after = await delegate.update({
        where: { id },
        data: { deletedAt: null },
      });
      await auditInTx(tx, a, "restore", id, before, after);
      return { before, after };
    });
    bustCache();
    await fireHook(a, "restore", id, result.before, result.after);
    return serializePrisma(result.after);
  }

  async function bulkDelete(ids: string[]) {
    ensureNotStub();
    // softDelete já valida cada id via ensureCanAccess + chama bustCache.
    for (const id of ids) await softDelete(id);
    return { count: ids.length };
  }

  async function bulkExport(
    ids: string[] | "all",
    format: ExportFormat,
    where?: unknown,
  ) {
    const a = await actor();
    if (!a) throw new Error("Não autenticado.");
    // Export respeita escopo via scopedPrisma (admin = tudo).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = scopedPrisma(a) as any;
    const delegate = db[modelLower()];
    if (!delegate?.findMany)
      throw new Error(`Model "${prismaModel}" inacessível.`);
    const filter =
      ids === "all"
        ? where
        : { ...((where as Record<string, unknown>) ?? {}), id: { in: ids } };

    // Inclui relações 1-1/N-1 com seus escalares — exports antes deixavam
    // todos os campos vinculados (filial, fornecedor, usina) de fora, e o
    // próprio Decimal dos valores virava célula opaca no XLSX.
    const include = buildScalarInclude(prismaModel);
    const rows = (await delegate.findMany({
      where: filter,
      ...(include ? { include } : {}),
    })) as Record<string, unknown>[];

    // Decimal → number; Date mantém. XLSX/CSV/JSON aceitam ambos.
    const serialized = serializePrisma(rows) as Record<string, unknown>[];
    // Achata relações como `filial_codigo`, `fornecedor_nome` etc.
    const flat = flattenRelations(serialized);

    return exportRows(flat, format, prismaModel.toLowerCase());
  }

  return { create, update, softDelete, restore, bulkDelete, bulkExport };
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

/**
 * Campos NUNCA exportados — defesa em profundidade. Mesmo padrão usado pelo
 * audit (lib/audit.ts) para redigir antes de persistir o `before/after`.
 */
const SENSITIVE_FIELD_PATTERN =
  /(^|_)(senha|password|hash|token|secret|accesskey|secretkey|apikey)($|[_A-Z])/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(key);
}

/**
 * Constrói um `include` Prisma com todas as relações 1-1/N-1 (não-list) do
 * model — apenas escalares de cada relação, evitando recursão profunda e
 * campos sensíveis (senha/password/token). Lista (1-N/N-N) é deixada de fora
 * pra não inflar o export.
 */
function buildScalarInclude(
  modelName: string,
): Record<string, { select: Record<string, true> }> | undefined {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) return undefined;
  const include: Record<string, { select: Record<string, true> }> = {};
  for (const f of model.fields) {
    if (f.kind !== "object" || f.isList) continue;
    const target = Prisma.dmmf.datamodel.models.find((m) => m.name === f.type);
    if (!target) continue;
    const select: Record<string, true> = {};
    for (const sf of target.fields) {
      if ((sf.kind === "scalar" || sf.kind === "enum") && !isSensitiveKey(sf.name)) {
        select[sf.name] = true;
      }
    }
    if (Object.keys(select).length > 0) include[f.name] = { select };
  }
  return Object.keys(include).length > 0 ? include : undefined;
}

/**
 * Achata relações nesteadas em colunas planas (`filial_codigo`, ...) — XLSX
 * `json_to_sheet` não sabe lidar com objetos aninhados, escreveria
 * "[object Object]" na célula. Aplicado APÓS `serializePrisma`, então não
 * encontra Decimal/BigInt aqui.
 */
function flattenRelations(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (isSensitiveKey(k)) continue;
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        !(v instanceof Date)
      ) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          if (isSensitiveKey(k2)) continue;
          // Não desce além de um nível — evita explosão e ciclos.
          if (
            v2 &&
            typeof v2 === "object" &&
            !Array.isArray(v2) &&
            !(v2 instanceof Date)
          ) {
            continue;
          }
          if (Array.isArray(v2)) continue;
          out[`${k}_${k2}`] = v2;
        }
      } else if (Array.isArray(v)) {
        // Listas viram contagem — evita XLSX vazio.
        out[`${k}_count`] = v.length;
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}
