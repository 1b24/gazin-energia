"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { fornecedorSchema } from "@/lib/schemas/fornecedor";

const actions = createCrudActions("Fornecedor", fornecedorSchema, {
  revalidate: "/fornecedores",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
