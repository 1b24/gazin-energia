/**
 * Schema Zod + config de form para VendaKwh.
 *
 * `mes` é armazenado como "01".."12" (vide seed wide-to-long); o select
 * exibe os nomes em pt-BR mas o value enviado é o código zero-padded.
 */
import { z } from "zod";

import type { FormFieldConfig } from "@/components/forms/entity-form";
import type { UsinaOption } from "./geracao";

const MES_OPTIONS = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

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

export const vendaKwhSchema = z.object({
  // ano e mes são `required` no Prisma. Coercimos pra inteiro/string e exigimos.
  ano: z.preprocess(
    (v) => {
      if (v == null || v === "") return undefined;
      if (typeof v === "number") return Math.trunc(v);
      const n = Number(String(v).replace(/\D/g, ""));
      return Number.isFinite(n) ? n : undefined;
    },
    z
      .number({ message: "Ano é obrigatório" })
      .int()
      .min(2000)
      .max(2100),
  ),
  mes: z
    .string({ message: "Mês é obrigatório" })
    .refine((s) => MES_OPTIONS.some((o) => o.value === s), {
      message: "Mês inválido (use 01..12)",
    }),

  kwhVendidos: numericFromBR(),
  valorReais: numericFromBR(),
  notaFiscalUrl: z.preprocess(nullishToNull, z.string().nullable()),

  usinaId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type VendaKwhInput = z.infer<typeof vendaKwhSchema>;

export function buildVendaKwhFormFields(
  usinaOptions: UsinaOption[],
): FormFieldConfig[] {
  return [
    {
      name: "usinaId",
      label: "Usina",
      type: "select",
      span: 2,
      required: true,
      options: usinaOptions.map((u) => ({ value: u.id, label: u.nome })),
      placeholder: "Selecione a usina...",
    },
    {
      name: "ano",
      label: "Ano",
      type: "number",
      span: 1,
      required: true,
      placeholder: "2026",
    },
    {
      name: "mes",
      label: "Mês",
      type: "select",
      span: 1,
      required: true,
      options: MES_OPTIONS,
    },
    {
      name: "kwhVendidos",
      label: "KWh vendidos",
      type: "currency",
      span: 1,
      placeholder: "0,00",
    },
    {
      name: "valorReais",
      label: "Valor (R$)",
      type: "currency",
      span: 1,
      placeholder: "0,00",
    },
    {
      name: "notaFiscalUrl",
      label: "Nota fiscal",
      type: "file",
      span: 2,
      bucket: "venda-kwh",
      accept: ".pdf,image/*",
      helpText: "Anexe o PDF ou imagem da NF (até 25 MB).",
    },
  ];
}

export { MES_OPTIONS };
