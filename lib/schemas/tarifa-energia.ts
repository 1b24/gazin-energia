/**
 * Schema Zod + config de form para TarifaEnergia.
 *
 * Polimórfica: pertence a um Fornecedor (mercado livre) OU a uma
 * Distribuidora (cativo), nunca os dois. O enum `origem` indica qual FK
 * deve estar preenchida — o schema Zod valida a consistência via refine
 * (Prisma não tem CHECK condicional nativo).
 */
import { z } from "zod";
import { OrigemTarifa } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";

import type { DistribuidoraPickerOption } from "./distribuidora";
import type { FornecedorPickerOption } from "./injecao";

const ORIGEM_VALUES = Object.values(OrigemTarifa) as [
  OrigemTarifa,
  ...OrigemTarifa[],
];

function nullishToNull(s: string | null | undefined) {
  return s == null || s === "" ? null : s.trim();
}

function emptyToNull<T>(v: T | "" | null | undefined): T | null {
  return v == null || v === "" ? null : (v as T);
}

function decimal4FromBR() {
  return z
    .preprocess((v) => {
      if (v == null || v === "") return null;
      if (typeof v === "number") return v;
      const cleaned = String(v).replace(/\./g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }, z.number().min(0).nullable())
    .nullable();
}

function dateFromBR() {
  return z.preprocess((v) => {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v;
    const s = String(v).trim();
    // Aceita "dd/mm/yyyy"
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }, z.date().nullable());
}

export const tarifaEnergiaSchema = z
  .object({
    origem: z.enum(ORIGEM_VALUES),
    fornecedorId: z.preprocess(emptyToNull, z.string().nullable()),
    distribuidoraId: z.preprocess(emptyToNull, z.string().nullable()),

    valorPonta: decimal4FromBR(),
    valorForaPonta: decimal4FromBR(),

    vigenciaInicio: dateFromBR().refine((v) => v != null, {
      message: "Vigência início obrigatória",
    }),
    vigenciaFim: dateFromBR(),

    modalidade: z.preprocess(nullishToNull, z.string().nullable()),
    observacao: z.preprocess(nullishToNull, z.string().nullable()),
  })
  .refine(
    (data) => {
      if (data.origem === "fornecedor") {
        return !!data.fornecedorId && !data.distribuidoraId;
      }
      return !!data.distribuidoraId && !data.fornecedorId;
    },
    {
      message:
        "Origem inconsistente: fornecedor exige fornecedorId; distribuidora exige distribuidoraId.",
      path: ["origem"],
    },
  )
  .refine(
    (data) =>
      data.valorPonta != null ||
      data.valorForaPonta != null,
    {
      message: "Informe ao menos um valor (Ponta ou Fora Ponta).",
      path: ["valorPonta"],
    },
  )
  .refine(
    (data) =>
      data.vigenciaFim == null ||
      data.vigenciaInicio == null ||
      data.vigenciaFim.getTime() >= data.vigenciaInicio.getTime(),
    {
      message: "Vigência fim deve ser após o início.",
      path: ["vigenciaFim"],
    },
  );

export type TarifaEnergiaInput = z.infer<typeof tarifaEnergiaSchema>;

export function buildTarifaEnergiaFormFields(
  fornecedorOptions: FornecedorPickerOption[],
  distribuidoraOptions: DistribuidoraPickerOption[],
): FormFieldConfig[] {
  return [
    {
      name: "origem",
      label: "Origem",
      type: "select",
      span: 2,
      required: true,
      options: [
        { value: "fornecedor", label: "Fornecedor (mercado livre)" },
        { value: "distribuidora", label: "Distribuidora (cativo)" },
      ],
      helpText:
        "Escolha entre comercializadora do mercado livre ou concessionária regulada.",
    },
    {
      name: "fornecedorId",
      label: "Fornecedor",
      type: "select",
      span: 2,
      placeholder: "Selecione a comercializadora...",
      options: fornecedorOptions.map((f) => ({
        value: f.id,
        label: f.nome ?? f.id,
      })),
      helpText: "Use somente quando origem = Fornecedor.",
    },
    {
      name: "distribuidoraId",
      label: "Distribuidora",
      type: "select",
      span: 2,
      placeholder: "Selecione a concessionária...",
      options: distribuidoraOptions.map((d) => ({
        value: d.id,
        label: [d.nome, d.sigla].filter(Boolean).join(" — ") || d.nome,
      })),
      helpText: "Use somente quando origem = Distribuidora.",
    },
    {
      name: "valorPonta",
      label: "Valor Ponta (R$/kWh)",
      type: "currency",
      span: 1,
      placeholder: "0,0000",
      helpText: "Tarifa no horário de ponta. Use 4 casas decimais.",
    },
    {
      name: "valorForaPonta",
      label: "Valor Fora Ponta (R$/kWh)",
      type: "currency",
      span: 1,
      placeholder: "0,0000",
    },
    {
      name: "vigenciaInicio",
      label: "Vigência início",
      type: "date",
      span: 1,
      required: true,
    },
    {
      name: "vigenciaFim",
      label: "Vigência fim",
      type: "date",
      span: 1,
      helpText: "Deixe em branco se ainda vigente.",
    },
    {
      name: "modalidade",
      label: "Modalidade",
      type: "select",
      span: 1,
      options: [
        { value: "verde", label: "Verde" },
        { value: "azul", label: "Azul" },
        { value: "convencional", label: "Convencional" },
        { value: "branca", label: "Branca" },
      ],
      helpText: "Específico de distribuidora; opcional para fornecedor.",
    },
    {
      name: "observacao",
      label: "Observação",
      type: "text",
      span: 2,
    },
  ];
}
