"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createCrudActions } from "@/lib/actions/crud";
import { prisma } from "@/lib/db";
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
    kwh: z.preprocess(
      (v) => {
        if (v == null || v === "") return null;
        if (typeof v === "number") return v;
        const cleaned = String(v).replace(/\./g, "").replace(",", ".");
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
      },
      z.number().nullable(),
    ),
  }),
);

export async function updateDias(
  geracaoId: string,
  dias: { dia: number; kwh: unknown }[],
): Promise<{ count: number }> {
  const parsed = diaInputSchema.parse(dias);

  // Garante que a Geracao existe (e que ainda não está soft-deleted).
  const ger = await prisma.geracao.findUnique({
    where: { id: geracaoId },
    select: { id: true, deletedAt: true },
  });
  if (!ger || ger.deletedAt) {
    throw new Error(`Geração ${geracaoId} não encontrada ou arquivada.`);
  }

  // Upsert por (geracaoId, dia). Se kwh é null, remove o registro pra manter
  // a tabela limpa (em vez de armazenar NULL) — o Prisma não permite delete
  // condicional no upsert, então rodamos por linha.
  let count = 0;
  for (const d of parsed) {
    if (d.kwh == null) {
      await prisma.geracaoDia.deleteMany({
        where: { geracaoId, dia: d.dia },
      });
    } else {
      await prisma.geracaoDia.upsert({
        where: { geracaoId_dia: { geracaoId, dia: d.dia } },
        create: { geracaoId, dia: d.dia, kwh: d.kwh },
        update: { kwh: d.kwh },
      });
    }
    count++;
  }

  revalidatePath("/geracao");
  return { count };
}
