"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { filialSchema } from "@/lib/schemas/filial";

const actions = createCrudActions("Filial", filialSchema, {
  revalidate: "/filiais",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
