"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { geracaoSchema } from "@/lib/schemas/geracao";

const actions = createCrudActions("Geracao", geracaoSchema, {
  revalidate: "/geracao",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
