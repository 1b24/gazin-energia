"use server";

import { createCrudActions } from "@/lib/actions/crud";
import { tarifaEnergiaSchema } from "@/lib/schemas/tarifa-energia";

const actions = createCrudActions("TarifaEnergia", tarifaEnergiaSchema, {
  revalidate: "/tarifas",
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
