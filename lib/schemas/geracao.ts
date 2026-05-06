/**
 * Schema Zod + config de form para Geracao.
 *
 * O form não edita os 31 valores diários (`GeracaoDia`) — esses entram via
 * import/seed e ganham UI dedicada (drawer "Dias"). O form aqui edita só o
 * cabeçalho da geração mensal: usina, ano/mês e metas.
 */
import { z } from "zod";

import type { FormFieldConfig } from "@/components/forms/entity-form";
import type { FilialOption } from "./usina";

const MESES = [
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

export const geracaoSchema = z.object({
  ano: intFromAny(),
  mes: z.preprocess(nullishToNull, z.string().nullable()),
  metaMensal: numericFromBR(),
  metaGeracao: numericFromBR(),
  usinaId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type GeracaoInput = z.infer<typeof geracaoSchema>;

// ----------------------------------------------------------------------------
// Form config — `usinaId` ganha opções via `buildGeracaoFormFields(...)`
// ----------------------------------------------------------------------------

/** Opção de Usina para o picker — análoga à `FilialOption` do schema de Usina. */
export interface UsinaOption {
  id: string;
  nome: string;
}

export function buildGeracaoFormFields(
  usinaOptions: UsinaOption[],
  // FilialOption deixado disponível pra extensões futuras (ex: filtro por filial).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _filialOptions: FilialOption[] = [],
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
      placeholder: "2026",
    },
    {
      name: "mes",
      label: "Mês",
      type: "select",
      span: 1,
      options: MESES.map((m) => ({ value: m, label: m })),
    },
    {
      name: "metaMensal",
      label: "Meta mensal (kWh)",
      type: "currency",
      span: 1,
      placeholder: "0,00",
    },
    {
      name: "metaGeracao",
      label: "Meta de geração (kWh)",
      type: "currency",
      span: 1,
      placeholder: "0,00",
    },
  ];
}
