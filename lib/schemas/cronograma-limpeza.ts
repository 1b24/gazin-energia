/**
 * Schema Zod + config de form para CronogramaLimpeza.
 *
 * Os 6 `LimpezaItem` filhos não entram neste schema — são editados via aba
 * "Itens" do drawer através da action `updateItens`. Aqui apenas o cabeçalho:
 * usina, status geral e nota de "realizado".
 */
import { z } from "zod";
import { StatusManutencao } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";
import type { UsinaOption } from "./geracao";

const STATUS_VALUES = Object.values(StatusManutencao) as [
  StatusManutencao,
  ...StatusManutencao[],
];

function nullishToNull(s: string | null | undefined) {
  return s == null || s === "" ? null : s.trim();
}

function emptyToNull<T>(v: T | "" | null | undefined): T | null {
  return v == null || v === "" ? null : (v as T);
}

export const cronogramaLimpezaSchema = z.object({
  realizado: z.preprocess(nullishToNull, z.string().nullable()),
  statusGeral: z
    .preprocess(emptyToNull, z.enum(STATUS_VALUES).nullable())
    .transform((s) => s ?? "pendente" as StatusManutencao),
  usinaId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type CronogramaLimpezaInput = z.infer<typeof cronogramaLimpezaSchema>;

export const STATUS_MANUTENCAO_LABEL: Record<StatusManutencao, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

export function buildCronogramaLimpezaFormFields(
  usinaOptions: UsinaOption[],
): FormFieldConfig[] {
  return [
    {
      name: "usinaId",
      label: "Usina",
      type: "select",
      span: 2,
      options: usinaOptions.map((u) => ({ value: u.id, label: u.nome })),
      placeholder: "Selecione a usina...",
    },
    {
      name: "statusGeral",
      label: "Status geral",
      type: "select",
      span: 1,
      options: STATUS_VALUES.map((v) => ({
        value: v,
        label: STATUS_MANUTENCAO_LABEL[v],
      })),
    },
    {
      name: "realizado",
      label: "Realizado",
      type: "text",
      span: 1,
      placeholder: "Nota livre (Pendente, Concluída...)",
    },
  ];
}
