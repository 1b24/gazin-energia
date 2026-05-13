import { auth } from "@/lib/auth";
import { retryClosedConnection, scopedPrisma } from "@/lib/db";
import { serializePrisma } from "@/lib/serialize";

import { TarifasTable, type TarifaRow } from "./tarifas-table";

export default async function TarifasPage() {
  const session = await auth();
  const db = scopedPrisma(session?.user);

  // Tarifas + opções de Fornecedor (apenas comercializadoras) e Distribuidora
  // pra alimentar os pickers do form.
  const [rows, fornecedorOptions, distribuidoraOptions] = await Promise.all([
    retryClosedConnection(() =>
      db.tarifaEnergia.findMany({
        include: {
          fornecedor: { select: { id: true, nome: true } },
          distribuidora: { select: { id: true, nome: true, sigla: true } },
        },
        orderBy: [{ vigenciaInicio: "desc" }],
      }),
    ),
    retryClosedConnection(() =>
      db.fornecedor.findMany({
        where: {
          deletedAt: null,
          tipoFornecimento: "comercializadora",
          nome: { not: null },
        },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      }),
    ),
    retryClosedConnection(() =>
      db.distribuidora.findMany({
        where: { deletedAt: null },
        select: { id: true, nome: true, sigla: true },
        orderBy: { nome: "asc" },
      }),
    ),
  ]);

  return (
    <TarifasTable
      rows={serializePrisma(rows) as TarifaRow[]}
      fornecedorOptions={fornecedorOptions}
      distribuidoraOptions={distribuidoraOptions}
    />
  );
}
