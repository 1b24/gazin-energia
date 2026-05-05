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
import { z } from "zod";

import { prisma } from "@/lib/db";
import { exportRows, type ExportFormat } from "@/lib/exports";
import { isStub } from "@/lib/modules/status";

export type CrudActor = { id: string; role: string } | null;

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

function delegateFor(prismaModel: string): AnyDelegate {
  const key = prismaModel.charAt(0).toLowerCase() + prismaModel.slice(1);
  // O cliente Prisma 7 expõe os models pelo nome em camelCase.
  const client = prisma as unknown as Record<string, AnyDelegate>;
  const delegate = client[key];
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
  const { enforceStubBlock = true, hooks: localHooks } = opts;

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

  async function actor(): Promise<CrudActor> {
    return (await effectiveHooks().getActor?.()) ?? null;
  }

  async function audit(
    action: "create" | "update" | "soft_delete" | "restore" | "hard_delete",
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    const a = await actor();
    await effectiveHooks().onMutation?.({
      actor: a,
      model: prismaModel,
      action,
      entityId,
      before,
      after,
    });
  }

  async function create(input: unknown) {
    ensureNotStub();
    const data = schema.parse(input);
    const delegate = delegateFor(prismaModel);
    const created = await delegate.create({ data });
    await audit("create", created.id, null, created);
    return created;
  }

  async function update(id: string, input: unknown) {
    ensureNotStub();
    const data = schema.partial().parse(input);
    const delegate = delegateFor(prismaModel);
    const before = await delegate.findUnique({ where: { id } });
    const updated = await delegate.update({ where: { id }, data });
    await audit("update", id, before, updated);
    return updated;
  }

  async function softDelete(id: string) {
    ensureNotStub();
    const delegate = delegateFor(prismaModel);
    const before = await delegate.findUnique({ where: { id } });
    const after = await delegate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await audit("soft_delete", id, before, after);
    return after;
  }

  async function restore(id: string) {
    ensureNotStub();
    const delegate = delegateFor(prismaModel);
    const before = await delegate.findUnique({ where: { id } });
    const after = await delegate.update({
      where: { id },
      data: { deletedAt: null },
    });
    await audit("restore", id, before, after);
    return after;
  }

  async function bulkDelete(ids: string[]) {
    ensureNotStub();
    for (const id of ids) await softDelete(id);
    return { count: ids.length };
  }

  async function bulkExport(
    ids: string[] | "all",
    format: ExportFormat,
    where?: unknown,
  ) {
    const delegate = delegateFor(prismaModel);
    const filter =
      ids === "all"
        ? where
        : { ...(where ?? {}), id: { in: ids } };
    const rows = (await delegate.findMany({ where: filter })) as Record<
      string,
      unknown
    >[];
    return exportRows(rows, format, prismaModel.toLowerCase());
  }

  return { create, update, softDelete, restore, bulkDelete, bulkExport };
}
