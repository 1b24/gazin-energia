import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { GeracaoTable, type GeracaoRow } from "./geracao-table";

export default async function GeracaoPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const [rows, usinaOptions, tarifasDistribuidoras] = await Promise.all([
    retryClosedConnection(() =>
      db.geracao.findMany({
        include: {
          usina: { select: { id: true, nome: true, uf: true } },
          dias: { orderBy: { dia: "asc" } },
        },
        orderBy: [{ ano: "desc" }, { usinaId: "asc" }],
      }),
    ),
    retryClosedConnection(() =>
      db.usina.findMany({
        where: { deletedAt: null },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      }),
    ),
    // Tarifas históricas de distribuidoras — usadas no analytics pra
    // calcular receita evitada (kWh gerado × tarifa que seria cobrada).
    retryClosedConnection(() =>
      db.tarifaEnergia.findMany({
        where: {
          origem: "distribuidora",
          deletedAt: null,
          distribuidoraId: { not: null },
        },
        select: {
          valorPonta: true,
          valorForaPonta: true,
          vigenciaInicio: true,
          vigenciaFim: true,
          distribuidora: { select: { uf: true } },
        },
      }),
    ),
  ]);

  // Achata tarifas pra formato consumível pelo client (Date como ISO).
  const tarifasFlat = (
    serializePrisma(tarifasDistribuidoras) as Array<{
      valorPonta: number | null;
      valorForaPonta: number | null;
      vigenciaInicio: Date;
      vigenciaFim: Date | null;
      distribuidora: { uf: string | null } | null;
    }>
  )
    .filter((t) => t.distribuidora?.uf)
    .map((t) => ({
      uf: t.distribuidora!.uf as string,
      valorPonta: t.valorPonta,
      valorForaPonta: t.valorForaPonta,
      vigenciaInicio: t.vigenciaInicio.toISOString(),
      vigenciaFim: t.vigenciaFim ? t.vigenciaFim.toISOString() : null,
    }));

  return (
    <GeracaoTable
      rows={serializePrisma(rows) as GeracaoRow[]}
      usinaOptions={usinaOptions}
      tarifasDistribuidoras={tarifasFlat}
    />
  );
}
