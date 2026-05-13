"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createCrudActions } from "@/lib/actions/crud";
import { prisma, userCanAccessId } from "@/lib/db";
import { geracaoSchema } from "@/lib/schemas/geracao";

const actions = createCrudActions("Geracao", geracaoSchema, {
  revalidate: "/geracao",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;

// ----------------------------------------------------------------------------
// Custom action: edição inline dos 31 GeracaoDia.
// ----------------------------------------------------------------------------

const diaInputSchema = z.array(
  z.object({
    dia: z.number().int().min(1).max(31),
    /**
     * Valores virão como string (do <input>) — preprocess pra number ou null.
     * Aceita "1234,56" (BR) e "1234.56" (US).
     */
    kwh: z.preprocess((v) => {
      if (v == null || v === "") return null;
      if (typeof v === "number") return v;
      const cleaned = String(v).replace(/\./g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }, z.number().nullable()),
  }),
);

export async function updateDias(
  geracaoId: string,
  dias: { dia: number; kwh: unknown }[],
): Promise<{ count: number }> {
  // RBAC: exige session + autoriza via scopedPrisma.
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");
  const ok = await userCanAccessId(session.user, "geracao", geracaoId);
  if (!ok) {
    throw new Error("Não autorizado: geração fora do escopo do usuário.");
  }

  const parsed = diaInputSchema.parse(dias);

  // Garante que a Geracao existe (e que ainda não está soft-deleted).
  const ger = await prisma.geracao.findUnique({
    where: { id: geracaoId },
    select: { id: true, deletedAt: true },
  });
  if (!ger || ger.deletedAt) {
    throw new Error(`Geração ${geracaoId} não encontrada ou arquivada.`);
  }

  // Mutações + audit numa única transação — falha em qualquer ponto reverte
  // tudo (nenhuma linha de GeracaoDia muda sem audit correspondente).
  const count = await prisma.$transaction(async (tx) => {
    const beforeDias = await tx.geracaoDia.findMany({
      where: { geracaoId },
      select: { dia: true, kwh: true },
      orderBy: { dia: "asc" },
    });

    let n = 0;
    for (const d of parsed) {
      if (d.kwh == null) {
        await tx.geracaoDia.deleteMany({
          where: { geracaoId, dia: d.dia },
        });
      } else {
        await tx.geracaoDia.upsert({
          where: { geracaoId_dia: { geracaoId, dia: d.dia } },
          create: { geracaoId, dia: d.dia, kwh: d.kwh },
          update: { kwh: d.kwh },
        });
      }
      n++;
    }

    const afterDias = await tx.geracaoDia.findMany({
      where: { geracaoId },
      select: { dia: true, kwh: true },
      orderBy: { dia: "asc" },
    });
    await recordAudit(
      {
        actor: { id: session.user.id, email: session.user.email },
        entityType: "Geracao",
        entityId: geracaoId,
        action: "update",
        before: { dias: beforeDias },
        after: { dias: afterDias },
      },
      tx,
    );
    return n;
  });

  revalidatePath("/geracao");
  return { count };
}
