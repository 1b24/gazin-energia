/**
 * Schema Zod + config de form para Injecao.
 *
 * FKs: filialId (Filial.codigo bate com source quando é numérico) e
 * fornecedorId (Fornecedor.nome bate, normalizado pra lowercase).
 * Quando não bate, valor original fica em filialCodigoRaw / fornecedorRaw.
 *
 * Cross-field linking: ao escolher Filial no form, `uc` e `municipio`
 * auto-preenchem a partir da Filial selecionada (via `linksTo`).
 */
import { z } from "zod";

import type { FormFieldConfig } from "@/components/forms/entity-form";

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

export const injecaoSchema = z.object({
  ano: intFromAny(),
  mes: z.preprocess(nullishToNull, z.string().nullable()),
  uc: z.preprocess(nullishToNull, z.string().nullable()),
  municipio: z.preprocess(nullishToNull, z.string().nullable()),
  anexoFechamento: z.preprocess(nullishToNull, z.string().nullable()),

  consumoKwhP: numericFromBR(),
  consumoKwhP1: numericFromBR(),
  consumoTotalKwh: numericFromBR(),
  valor: numericFromBR(),
  valor1: numericFromBR(),
  valor2: numericFromBR(),

  filialId: z.preprocess(emptyToNull, z.string().nullable()),
  fornecedorId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type InjecaoInput = z.infer<typeof injecaoSchema>;

// Filial option carrega uc e municipio pra alimentar o auto-preenchimento.
export interface FilialPickerOption {
  id: string;
  codigo: string | null;
  mercadoLivre: string | null;
  uc: string | null;
  municipio: string | null;
}

export interface FornecedorPickerOption {
  id: string;
  nome: string | null;
}

export function buildInjecaoFormFields(
  filialOptions: FilialPickerOption[],
  fornecedorOptions: FornecedorPickerOption[],
): FormFieldConfig[] {
  return [
    {
      name: "filialId",
      label: "Filial",
      type: "select",
      span: 2,
      placeholder: "Selecione a filial...",
      options: filialOptions.map((f) => ({
        value: f.id,
        label: [f.codigo, f.mercadoLivre].filter(Boolean).join(" — ") || f.id,
        // Carregadas pra serem copiadas via linksTo quando a filial for escolhida:
        uc: f.uc,
        municipio: f.municipio,
      })),
      // Quando filial muda, auto-preenche uc + município (usuário ainda pode
      // sobrescrever manualmente depois).
      linksTo: { uc: "uc", municipio: "municipio" },
      helpText: "UC e município preenchem sozinhos a partir da filial.",
    },
    {
      name: "fornecedorId",
      label: "Fornecedor",
      type: "select",
      span: 2,
      placeholder: "Selecione o fornecedor...",
      options: fornecedorOptions.map((f) => ({
        value: f.id,
        label: f.nome ?? f.id,
      })),
    },
    { name: "ano", label: "Ano", type: "number", span: 1, placeholder: "2026" },
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
    { name: "consumoKwhP1", label: "Consumo P1 (kWh)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "consumoTotalKwh", label: "Consumo total (kWh)", type: "currency", span: 2, placeholder: "0,00" },

    // Valores (R$)
    { name: "valor", label: "Valor (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "valor1", label: "Valor 1 (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "valor2", label: "Valor 2 (R$)", type: "currency", span: 2, placeholder: "0,00" },

    // Anexo
    {
      name: "anexoFechamento",
      label: "Anexo de fechamento",
      type: "file",
      span: 2,
      bucket: "injecao",
      accept: ".pdf,image/*",
      helpText: "Anexe o PDF/imagem do fechamento (até 25 MB).",
    },
  ];
}
