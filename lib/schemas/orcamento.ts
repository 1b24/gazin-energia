/**
 * Schema Zod + config de form para Orcamento.
 *
 * `tipo` é enum (despesa_direta | outro) — labels amigáveis no select.
 * `mes` é nome cheio em pt-BR matching da fonte legada.
 */
import { z } from "zod";
import { TipoOrcamento } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";
import type { UsinaOption } from "./geracao";

const TIPO_VALUES = Object.values(TipoOrcamento) as [
  TipoOrcamento,
  ...TipoOrcamento[],
];

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

function nullishToNull(s: string | null | undefined) {
  return s == null || s === "" ? null : s.trim();
}

function emptyToNull<T>(v: T | "" | null | undefined): T | null {
  return v == null || v === "" ? null : (v as T);
}

function numericFromBR() {
  return z
    .preprocess((v) => {
      if (v == null || v === "") return null;
      if (typeof v === "number") return v;
      const cleaned = String(v).replace(/\./g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }, z.number().nullable())
    .nullable();
}

export const orcamentoSchema = z.object({
  mes: z.preprocess(nullishToNull, z.string().nullable()),
  tipo: z.preprocess(emptyToNull, z.enum(TIPO_VALUES).nullable()),
  naturezaGasto: z.preprocess(nullishToNull, z.string().nullable()),
  detalhamento: z.preprocess(nullishToNull, z.string().nullable()),
  equipamentos: z.preprocess(nullishToNull, z.string().nullable()),
  anexosDetalhamento: z.preprocess(nullishToNull, z.string().nullable()),

  realEquipamentos: numericFromBR(),
  realViagensEstadias: numericFromBR(),
  realUsoConsumo: numericFromBR(),
  usoConsumo: numericFromBR(),

  usinaId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type OrcamentoInput = z.infer<typeof orcamentoSchema>;

const TIPO_LABEL: Record<TipoOrcamento, string> = {
  despesa_direta: "Despesa direta",
  outro: "Outro",
};

export function buildOrcamentoFormFields(
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
      name: "mes",
      label: "Mês",
      type: "select",
      span: 1,
      options: MESES_PT.map((m) => ({ value: m, label: m })),
    },
    {
      name: "tipo",
      label: "Tipo",
      type: "select",
      span: 1,
      options: TIPO_VALUES.map((v) => ({ value: v, label: TIPO_LABEL[v] })),
    },
    {
      name: "naturezaGasto",
      label: "Natureza do gasto",
      type: "text",
      span: 2,
      placeholder: "Categoria descritiva ou valor base",
    },
    {
      name: "detalhamento",
      label: "Detalhamento",
      type: "textarea",
      span: 2,
    },
    {
      name: "equipamentos",
      label: "Equipamentos",
      type: "textarea",
      span: 2,
    },

    // --- Realizado vs orçado (R$) ---
    { name: "usoConsumo", label: "Uso e consumo (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "realUsoConsumo", label: "Real uso e consumo (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "realEquipamentos", label: "Real equipamentos (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "realViagensEstadias", label: "Real viagens e estadias (R$)", type: "currency", span: 1, placeholder: "0,00" },

    // Anexo
    {
      name: "anexosDetalhamento",
      label: "Anexos do detalhamento",
      type: "file",
      span: 2,
      bucket: "orcamento",
      accept: ".pdf,image/*,.xlsx,.csv",
      helpText: "Documento de detalhamento (até 25 MB).",
    },
  ];
}

export { TIPO_LABEL as ORCAMENTO_TIPO_LABEL };
