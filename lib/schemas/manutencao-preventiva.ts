/**
 * Schema Zod + config de form para ManutencaoPreventiva.
 *
 * Reusa STATUS_MANUTENCAO_LABEL do schema de CronogramaLimpeza e UsinaOption
 * do schema de Geração — mesma família semântica.
 */
import { z } from "zod";
import { StatusManutencao } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";
import { STATUS_MANUTENCAO_LABEL } from "./cronograma-limpeza";
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

function dateFromBR() {
  return z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      if (v instanceof Date) return v;
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v));
      if (!m) return null;
      const [, d, mm, y] = m;
      const dt = new Date(Number(y), Number(mm) - 1, Number(d));
      return Number.isNaN(dt.getTime()) ? null : dt;
    },
    z.date().nullable(),
  );
}

export const manutencaoPreventivaSchema = z.object({
  status: z
    .preprocess(emptyToNull, z.enum(STATUS_VALUES).nullable())
    .transform((s) => s ?? "pendente" as StatusManutencao),
  dataExecucao: dateFromBR(),
  dataConclusao: dateFromBR(),
  laudoTecnico: z.preprocess(nullishToNull, z.string().nullable()),
  fotosUsina: z.preprocess(nullishToNull, z.string().nullable()),
  checklistVerificacao: z.preprocess(nullishToNull, z.string().nullable()),
  usinaId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type ManutencaoPreventivaInput = z.infer<
  typeof manutencaoPreventivaSchema
>;

export function buildManutencaoPreventivaFormFields(
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
      name: "status",
      label: "Status",
      type: "select",
      span: 1,
      options: STATUS_VALUES.map((v) => ({
        value: v,
        label: STATUS_MANUTENCAO_LABEL[v],
      })),
    },
    { name: "dataExecucao", label: "Data de execução", type: "date", span: 1 },
    {
      name: "dataConclusao",
      label: "Data de conclusão",
      type: "date",
      span: 1,
    },
    {
      name: "fotosUsina",
      label: "Fotos da usina",
      type: "file",
      span: 2,
      bucket: "manutencao-preventiva",
      accept: "image/*,.pdf",
      helpText: "Anexe a foto/galeria (até 25 MB).",
    },
    {
      name: "laudoTecnico",
      label: "Laudo técnico",
      type: "file",
      span: 2,
      bucket: "manutencao-preventiva",
      accept: ".pdf,image/*",
    },
    {
      name: "checklistVerificacao",
      label: "Checklist de verificação",
      type: "textarea",
      span: 2,
    },
  ];
}
