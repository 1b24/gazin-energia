"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { StatusManutencao } from "@prisma/client";

import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createCrudActions } from "@/lib/actions/crud";
import { prisma, userCanAccessId } from "@/lib/db";
import { cronogramaLimpezaSchema } from "@/lib/schemas/cronograma-limpeza";

const actions = createCrudActions(
  "CronogramaLimpeza",
  cronogramaLimpezaSchema,
  { revalidate: "/manutencao/limpeza" },
);

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;

// ----------------------------------------------------------------------------
// Custom action: edição inline dos 6 LimpezaItem.
// ----------------------------------------------------------------------------

const STATUS_VALUES = Object.values(StatusManutencao) as [
  StatusManutencao,
  ...StatusManutencao[],
];

const itemInputSchema = z.array(
  z.object({
    ordem: z.number().int().min(1).max(6),
    dataPlanejada: z.preprocess((v) => parseDateBR(v), z.date().nullable()),
    dataConclusao: z.preprocess((v) => parseDateBR(v), z.date().nullable()),
    status: z.preprocess(
      (v) => (v == null || v === "" ? null : v),
      z.enum(STATUS_VALUES).nullable(),
    ),
    fotoUrl: z.preprocess(
      (v) => (v == null || v === "" ? null : String(v).trim()),
      z.string().nullable(),
    ),
  }),
);

function parseDateBR(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const [, d, mm, y] = m;
  const dt = new Date(Number(y), Number(mm) - 1, Number(d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function updateItens(
  cronogramaId: string,
  itens: {
    ordem: number;
    dataPlanejada: unknown;
    dataConclusao: unknown;
    status: unknown;
    fotoUrl: unknown;
  }[],
): Promise<{ count: number }> {
  // RBAC: exige session + autoriza via scopedPrisma.
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");
  const ok = await userCanAccessId(
    session.user,
    "cronogramaLimpeza",
    cronogramaId,
  );
  if (!ok) {
    throw new Error("Não autorizado: cronograma fora do escopo do usuário.");
  }

  const parsed = itemInputSchema.parse(itens);

  const cron = await prisma.cronogramaLimpeza.findUnique({
    where: { id: cronogramaId },
    select: { id: true, deletedAt: true },
  });
  if (!cron || cron.deletedAt) {
    throw new Error(`Cronograma ${cronogramaId} não encontrado ou arquivado.`);
  }

  // Mutações + audit numa transação. Falha em qualquer ponto reverte tudo.
  const count = await prisma.$transaction(async (tx) => {
    const beforeItens = await tx.limpezaItem.findMany({
      where: { cronogramaId },
      orderBy: { ordem: "asc" },
    });

    let n = 0;
    for (const it of parsed) {
      const allEmpty =
        !it.dataPlanejada && !it.dataConclusao && !it.status && !it.fotoUrl;
      if (allEmpty) {
        await tx.limpezaItem.deleteMany({
          where: { cronogramaId, ordem: it.ordem },
        });
      } else {
        await tx.limpezaItem.upsert({
          where: { cronogramaId_ordem: { cronogramaId, ordem: it.ordem } },
          create: {
            cronogramaId,
            ordem: it.ordem,
            dataPlanejada: it.dataPlanejada,
            dataConclusao: it.dataConclusao,
            status: it.status,
            fotoUrl: it.fotoUrl,
          },
          update: {
            dataPlanejada: it.dataPlanejada,
            dataConclusao: it.dataConclusao,
            status: it.status,
            fotoUrl: it.fotoUrl,
          },
        });
      }
      n++;
    }

    const afterItens = await tx.limpezaItem.findMany({
      where: { cronogramaId },
      orderBy: { ordem: "asc" },
    });
    await recordAudit(
      {
        actor: { id: session.user.id, email: session.user.email },
        entityType: "CronogramaLimpeza",
        entityId: cronogramaId,
        action: "update",
        before: { itens: beforeItens },
        after: { itens: afterItens },
      },
      tx,
    );
    return n;
  });

  revalidatePath("/manutencao/limpeza");
  return { count };
}
