"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { usinaSchema } from "@/lib/schemas/usina";

const actions = createCrudActions("Usina", usinaSchema, {
  revalidate: "/usinas",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
