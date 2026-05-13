"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { distribuidoraSchema } from "@/lib/schemas/distribuidora";

const actions = createCrudActions("Distribuidora", distribuidoraSchema, {
  revalidate: "/distribuidoras",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
