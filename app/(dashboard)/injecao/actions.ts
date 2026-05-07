"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { injecaoSchema } from "@/lib/schemas/injecao";

const actions = createCrudActions("Injecao", injecaoSchema, {
  revalidate: "/injecao",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
