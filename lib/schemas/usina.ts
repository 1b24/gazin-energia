/**
 * Schema Zod + config de form para Usina.
 *
 * O `filialId` aparece como `select` cujas opções são injetadas em runtime
 * (`buildUsinaFormFields(filialOptions)`) — a página passa a lista das filiais
 * disponíveis pra alimentar o picker.
 */
import { z } from "zod";
import { LocalInstalacao, StatusUsina, TipoGD, UF } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";

const UF_VALUES = Object.values(UF) as [UF, ...UF[]];
const TIPO_GD_VALUES = Object.values(TipoGD) as [TipoGD, ...TipoGD[]];
const LOCAL_VALUES = Object.values(LocalInstalacao) as [
  LocalInstalacao,
  ...LocalInstalacao[],
];
const STATUS_VALUES = Object.values(StatusUsina) as [
  StatusUsina,
  ...StatusUsina[],
];

function nullishToNull(s: string | null | undefined) {
  return s == null || s === "" ? null : s.trim();
}

function emptyToNull<T>(v: T | "" | null | undefined): T | null {
  return v == null || v === "" ? null : (v as T);
}

export const usinaSchema = z.object({
  // Único campo obrigatório no schema Prisma — exige nome (após trim).
  nome: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: "Nome é obrigatório" }),

  ccUsinas: z.preprocess(nullishToNull, z.string().nullable()),
  cnpj: z
    .preprocess((v) => {
      if (v == null || v === "") return null;
      const digits = String(v).replace(/\D/g, "");
      return digits.length === 0 ? null : digits;
    }, z.string().nullable())
    .refine((s) => s == null || s.length === 14, {
      message: "CNPJ deve ter 14 dígitos",
    }),
  uc: z.preprocess(nullishToNull, z.string().nullable()),
  municipio: z.preprocess(nullishToNull, z.string().nullable()),
  documentosProjeto: z.preprocess(nullishToNull, z.string().nullable()),

  uf: z.preprocess(emptyToNull, z.enum(UF_VALUES).nullable()),
  tipoGd: z.preprocess(emptyToNull, z.enum(TIPO_GD_VALUES).nullable()),
  localInstalacao: z.preprocess(emptyToNull, z.enum(LOCAL_VALUES).nullable()),

  // status tem default no Prisma; aceita qualquer enum, undefined cai pro default.
  status: z
    .preprocess(emptyToNull, z.enum(STATUS_VALUES).nullable())
    .transform((s) => s ?? "operacional" as StatusUsina),

  // Potências e investimento — aceita "330.000,00", "330000,00", "330000.00", number.
  potenciaInstaladaKw: numericFromBR(),
  potenciaProjetadaKw: numericFromBR(),
  investimentoTotal: numericFromBR(),

  // Inteiros
  metaKwhMes: intFromAny(),
  quantasFlAtende: intFromAny(),

  autoProdutora: z.preprocess((v) => {
    if (v == null || v === "") return null;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["sim", "true", "1"].includes(s)) return true;
    if (["não", "nao", "false", "0"].includes(s)) return false;
    return null;
  }, z.boolean().nullable()),

  inicioOperacao: dateFromBR(),

  filialId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type UsinaInput = z.infer<typeof usinaSchema>;

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

// ----------------------------------------------------------------------------
// Form config — `filialId` ganha opções via `buildUsinaFormFields(...)`
// ----------------------------------------------------------------------------

export interface FilialOption {
  id: string;
  codigo: string | null;
  mercadoLivre: string | null;
}

export function buildUsinaFormFields(
  filialOptions: FilialOption[],
): FormFieldConfig[] {
  return [
    { name: "nome", label: "Nome", type: "text", span: 2, required: true, placeholder: "Gazin Filial 02 / ..." },
    { name: "ccUsinas", label: "CC Usina", type: "text", span: 1 },
    {
      name: "filialId",
      label: "Filial",
      type: "select",
      span: 1,
      options: filialOptions.map((f) => ({
        value: f.id,
        label: [f.codigo, f.mercadoLivre].filter(Boolean).join(" — ") || f.id,
      })),
      placeholder: "Selecione a filial...",
    },
    { name: "cnpj", label: "CNPJ", type: "cnpj", span: 1 },
    { name: "uc", label: "UC", type: "text", span: 1 },
    { name: "municipio", label: "Município", type: "text", span: 1 },
    {
      name: "uf",
      label: "UF",
      type: "select",
      span: 1,
      options: UF_VALUES.map((u) => ({ value: u, label: u })),
    },
    {
      name: "localInstalacao",
      label: "Local de instalação",
      type: "select",
      span: 1,
      options: LOCAL_VALUES.map((v) => ({
        value: v,
        label: v.charAt(0).toUpperCase() + v.slice(1),
      })),
    },
    {
      name: "tipoGd",
      label: "Tipo de GD",
      type: "select",
      span: 1,
      options: TIPO_GD_VALUES.map((v) => ({ value: v, label: v })),
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      span: 1,
      options: STATUS_VALUES.map((s) => ({
        value: s,
        label: s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      })),
    },
    { name: "potenciaInstaladaKw", label: "Potência instalada (kW)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "potenciaProjetadaKw", label: "Potência projetada (kW)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "metaKwhMes", label: "Meta mensal (kWh)", type: "number", span: 1 },
    { name: "investimentoTotal", label: "Investimento total (R$)", type: "currency", span: 1, placeholder: "0,00" },
    { name: "inicioOperacao", label: "Início de operação", type: "date", span: 1 },
    { name: "quantasFlAtende", label: "Quantas filiais atende", type: "number", span: 1 },
    { name: "autoProdutora", label: "Auto-produtora", type: "boolean", span: 1 },
    { name: "documentosProjeto", label: "Documentos do projeto", type: "textarea", span: 2 },
  ];
}
