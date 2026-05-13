/**
 * Schema Zod + config de form para Consumo.
 *
 * Mes aqui é nome completo em pt-BR ("Janeiro".."Dezembro") — origem legada
 * grava assim. Diferente da VendaKwh que usa "01".."12".
 */
import { z } from "zod";

import type { FormFieldConfig } from "@/components/forms/entity-form";
import type { FilialOption } from "./usina";

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

function intFromAny() {
  return z
    .preprocess((v) => {
      if (v == null || v === "") return null;
      if (typeof v === "number") return Math.trunc(v);
      const cleaned = String(v).replace(/\./g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }, z.number().int().nullable())
    .nullable();
}

export const consumoSchema = z.object({
  ano: intFromAny(),
  mes: z.preprocess(nullishToNull, z.string().nullable()),
  uc: z.preprocess(nullishToNull, z.string().nullable()),
  municipio: z.preprocess(nullishToNull, z.string().nullable()),
  statusAnexo: z.preprocess(nullishToNull, z.string().nullable()),
  arquivoFatura: z.preprocess(nullishToNull, z.string().nullable()),

  consumoKwhP: numericFromBR(),
  consumoKwhFp: numericFromBR(),
  consumoTotal: numericFromBR(),
  injecaoRecebida: numericFromBR(),
  multasJurosAtraso: numericFromBR(),
  outrasMultas: numericFromBR(),
  valor: numericFromBR(),
  valor1: numericFromBR(),
  valor2: numericFromBR(),
  valor3: numericFromBR(),
  valorTotalFatura: numericFromBR(),

  filialId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type ConsumoInput = z.infer<typeof consumoSchema>;

export function buildConsumoFormFields(
  filialOptions: FilialOption[],
): FormFieldConfig[] {
  return [
    {
      name: "filialId",
      label: "Filial",
      type: "select",
      span: 2,
      options: filialOptions.map((f) => ({
        value: f.id,
        label: [f.codigo, f.mercadoLivre].filter(Boolean).join(" — ") || f.id,
      })),
      placeholder: "Selecione a filial...",
    },
    {
      name: "ano",
      label: "Ano",
      type: "number",
      span: 1,
      placeholder: "2026",
    },
    {
      name: "mes",
      label: "Mês",
      type: "select",
      span: 1,
      options: MESES_PT.map((m) => ({ value: m, label: m })),
    },
    { name: "uc", label: "UC", type: "text", span: 1 },
    { name: "municipio", label: "Município", type: "text", span: 1 },

    // Consumo (kWh)
    { name: "consumoKwhP", label: "Consumo P (kWh)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "consumoKwhFp", label: "Consumo FP (kWh)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "consumoTotal", label: "Consumo total (kWh)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "injecaoRecebida", label: "Injeção recebida (kWh)", type: "currency", span: 1, placeholder: "0,00" },

    // Valores (R$)
    { name: "valor", label: "Valor P (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "valor1", label: "Valor FP (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "valor2", label: "Valor consumo total (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "valor3", label: "Valor injeção recebida (R$)", type: "currency", span: 1, placeholder: "0,00" },
    {
      name: "valorTotalFatura",
      label: "Valor total da fatura (R$)",
      type: "currency",
      span: 2,
      placeholder: "0,00",
    },

    // Multas
    {
      name: "multasJurosAtraso",
      label: "Multas / juros / atraso (R$)",
      type: "currency",
      span: 1,
      placeholder: "0,00",
    },
    { name: "outrasMultas", label: "Outras multas (R$)", type: "currency", span: 1, placeholder: "0,00" },

    // Anexo
    { name: "statusAnexo", label: "Status do anexo", type: "text", span: 1, placeholder: "Sem anexo / Anexado..." },
    {
      name: "arquivoFatura",
      label: "Arquivo da fatura",
      type: "file",
      span: 2,
      bucket: "consumo",
      accept: ".pdf,image/*",
      helpText: "Anexe o PDF/imagem da fatura (até 25 MB).",
    },
  ];
}
