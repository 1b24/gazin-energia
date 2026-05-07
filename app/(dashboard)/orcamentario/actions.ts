"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { orcamentoSchema } from "@/lib/schemas/orcamento";

const actions = createCrudActions("Orcamento", orcamentoSchema, {
  revalidate: "/orcamentario",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
