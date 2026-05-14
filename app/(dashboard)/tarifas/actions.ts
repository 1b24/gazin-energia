"use server";

import { createCrudActions } from "@/lib/actions/crud";
import {
  tarifaEnergiaPartialSchema,
  tarifaEnergiaSchema,
} from "@/lib/schemas/tarifa-energia";

// `tarifaEnergiaSchema` tem 3 refinements — Zod proíbe `.partial()` direto.
// Passamos o `tarifaEnergiaPartialSchema` (base sem refines) pro update.
const actions = createCrudActions("TarifaEnergia", tarifaEnergiaSchema, {
  revalidate: "/tarifas",
  updateSchema: tarifaEnergiaPartialSchema,
});

export const create = actions.create;
export const update = actions.update;
export const softDelete = actions.softDelete;
export const restore = actions.restore;
export const bulkDelete = actions.bulkDelete;
export const bulkExport = actions.bulkExport;
