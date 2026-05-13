/**
 * Schema Zod + config de form para Distribuidora.
 *
 * Entidade global (não escopada por filial). Volume baixo (~10 registros).
 * Cadastrada manualmente. UF é a área principal de atuação.
 */
import { z } from "zod";
import { UF } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";

const UF_VALUES = Object.values(UF) as [UF, ...UF[]];

function nullishToNull(s: string | null | undefined) {
  return s == null || s === "" ? null : s.trim();
}

export const distribuidoraSchema = z.object({
  nome: z.preprocess(
    nullishToNull,
    z.string().min(1, "Nome obrigatório"),
  ),
  sigla: z.preprocess(nullishToNull, z.string().nullable()),
  codigoAneel: z.preprocess(nullishToNull, z.string().nullable()),
  uf: z.preprocess(
    (v) => (v == null || v === "" ? null : v),
    z.enum(UF_VALUES).nullable(),
  ),
});

export type DistribuidoraInput = z.infer<typeof distribuidoraSchema>;

export const distribuidoraFormFields: FormFieldConfig[] = [
  {
    name: "nome",
    label: "Nome",
    type: "text",
    span: 2,
    required: true,
    placeholder: "Energisa MS, Copel, Enel SP...",
  },
  {
    name: "sigla",
    label: "Sigla",
    type: "text",
    span: 1,
    placeholder: "ENERGISA-MS",
  },
  {
    name: "uf",
    label: "UF",
    type: "select",
    span: 1,
    options: UF_VALUES.map((u) => ({ value: u, label: u })),
  },
  {
    name: "codigoAneel",
    label: "Código ANEEL",
    type: "text",
    span: 2,
    helpText: "Código oficial da distribuidora na ANEEL (opcional).",
  },
];

/**
 * Subset de Distribuidora usado pelo picker do form de TarifaEnergia.
 */
export interface DistribuidoraPickerOption {
  id: string;
  nome: string;
  sigla: string | null;
}
