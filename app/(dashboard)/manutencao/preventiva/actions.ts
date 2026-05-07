"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { manutencaoPreventivaSchema } from "@/lib/schemas/manutencao-preventiva";

const actions = createCrudActions(
  "ManutencaoPreventiva",
  manutencaoPreventivaSchema,
  { revalidate: "/manutencao/preventiva" },
);

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
