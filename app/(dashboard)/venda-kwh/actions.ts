"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { vendaKwhSchema } from "@/lib/schemas/venda-kwh";

const actions = createCrudActions("VendaKwh", vendaKwhSchema, {
  revalidate: "/venda-kwh",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
