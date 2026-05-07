"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { processoJuridicoSchema } from "@/lib/schemas/processo-juridico";

const actions = createCrudActions("ProcessoJuridico", processoJuridicoSchema, {
  revalidate: "/juridico/processos",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
