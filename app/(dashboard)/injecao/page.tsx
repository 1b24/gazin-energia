import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { InjecaoTable, type InjecaoRow } from "./injecao-table";

export default async function InjecaoPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  const rows = await retryClosedConnection(() =>
    db.injecao.findMany({
      include: {
        filial: {
          select: {
            id: true,
            codigo: true,
            mercadoLivre: true,
            uf: true,
            classeTensao: true,
          },
        },
        fornecedor: { select: { id: true, nome: true } },
      },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
    }),
  );

  // Tarifas históricas de distribuidoras — usadas no analytics pra calcular
  // economia vs distribuidora por UF / período de cada injeção.
  const tarifasDistribuidoras = await retryClosedConnection(() =>
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
        classeTensao: true,
        distribuidora: { select: { uf: true } },
      },
    }),
  );
  const filialOptions = await retryClosedConnection(() =>
    db.filial.findMany({
      where: { deletedAt: null },
      // `uc` e `municipio` precisam vir pra alimentar o linksTo do form.
      select: {
        id: true,
        codigo: true,
        mercadoLivre: true,
        uc: true,
        municipio: true,
      },
      orderBy: { codigo: "asc" },
    }),
  );
  const fornecedorOptions = await retryClosedConnection(() =>
    db.fornecedor.findMany({
      where: { deletedAt: null, nome: { not: null } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  );

  // Achatar tarifas pra formato consumível pelo cliente — extrai UF da
  // relação distribuidora e serializa Decimal→number. Dates vão como
  // string ISO (mais previsível ao atravessar RSC→Client; client converte
  // via `new Date()`).
  const tarifasFlat = (
    serializePrisma(tarifasDistribuidoras) as Array<{
      valorPonta: number | null;
      valorForaPonta: number | null;
      vigenciaInicio: Date;
      vigenciaFim: Date | null;
      classeTensao: string | null;
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
      classeTensao: t.classeTensao,
    }));

  return (
    <InjecaoTable
      rows={serializePrisma(rows) as InjecaoRow[]}
      filialOptions={filialOptions}
      fornecedorOptions={fornecedorOptions}
      tarifasDistribuidoras={tarifasFlat}
    />
  );
}
