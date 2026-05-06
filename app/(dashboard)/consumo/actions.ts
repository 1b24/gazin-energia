"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { consumoSchema } from "@/lib/schemas/consumo";

const actions = createCrudActions("Consumo", consumoSchema, {
  revalidate: "/consumo",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
