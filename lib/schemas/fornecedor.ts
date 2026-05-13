/**
 * Schema Zod + config de form para Fornecedor.
 *
 * `abrangenciaFilialId` aparece como `select` cujas opções são injetadas em
 * runtime via `buildFornecedorFormFields(filialOptions)`.
 */
import { z } from "zod";
import { StatusEntidade, TipoFornecimento } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";
import type { FilialOption } from "./usina";

const STATUS_VALUES = Object.values(StatusEntidade) as [
  StatusEntidade,
  ...StatusEntidade[],
];

const TIPO_FORNECIMENTO_VALUES = Object.values(TipoFornecimento) as [
  TipoFornecimento,
  ...TipoFornecimento[],
];

const TIPO_FORNECIMENTO_LABEL: Record<TipoFornecimento, string> = {
  comercializadora: "Comercializadora (vende kWh)",
  servico: "Serviço",
  equipamento: "Equipamento",
  outro: "Outro",
};

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

export const fornecedorSchema = z.object({
  nome: z.preprocess(nullishToNull, z.string().nullable()),
  cnpj: z
    .preprocess((v) => {
      if (v == null || v === "") return null;
      const digits = String(v).replace(/\D/g, "");
      return digits.length === 0 ? null : digits;
    }, z.string().nullable())
    .refine((s) => s == null || s.length === 14, {
      message: "CNPJ deve ter 14 dígitos",
    }),
  status: z
    .preprocess(emptyToNull, z.enum(STATUS_VALUES).nullable())
    .transform((s) => s ?? "ativo" as StatusEntidade),
  tipoFornecimento: z
    .preprocess(emptyToNull, z.enum(TIPO_FORNECIMENTO_VALUES).nullable())
    .transform((t) => t ?? ("outro" as TipoFornecimento)),

  escopoServico: z.preprocess(nullishToNull, z.string().nullable()),
  idContratoZoho: z.preprocess(nullishToNull, z.string().nullable()),
  anexoContrato: z.preprocess(nullishToNull, z.string().nullable()),
  abrangenciaUsinas: z.preprocess(nullishToNull, z.string().nullable()),

  inicioPrestacao: dateFromBR(),
  terminoPrestacao: dateFromBR(),

  abrangenciaFilialId: z.preprocess(emptyToNull, z.string().nullable()),
});

export type FornecedorInput = z.infer<typeof fornecedorSchema>;

export function buildFornecedorFormFields(
  filialOptions: FilialOption[],
): FormFieldConfig[] {
  return [
    { name: "nome", label: "Nome", type: "text", span: 2, placeholder: "Razão social ou nome fantasia" },
    { name: "cnpj", label: "CNPJ", type: "cnpj", span: 1 },
    {
      name: "status",
      label: "Status",
      type: "select",
      span: 1,
      options: STATUS_VALUES.map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
    },
    {
      name: "tipoFornecimento",
      label: "Tipo de fornecimento",
      type: "select",
      span: 2,
      options: TIPO_FORNECIMENTO_VALUES.map((t) => ({
        value: t,
        label: TIPO_FORNECIMENTO_LABEL[t],
      })),
      helpText:
        'Marcar como "Comercializadora" habilita o cadastro de tarifa de kWh em /tarifas.',
    },
    { name: "escopoServico", label: "Escopo de serviço", type: "text", span: 2, placeholder: "Auto-Geração de energia, ..." },
    { name: "inicioPrestacao", label: "Início da prestação", type: "date", span: 1 },
    { name: "terminoPrestacao", label: "Término da prestação", type: "date", span: 1 },
    {
      name: "abrangenciaFilialId",
      label: "Filial de abrangência",
      type: "select",
      span: 2,
      options: filialOptions.map((f) => ({
        value: f.id,
        label: [f.codigo, f.mercadoLivre].filter(Boolean).join(" — ") || f.id,
      })),
      placeholder: "Selecione a filial...",
      helpText: "Vínculo formal. Texto livre fica em \"Abrangência das usinas\".",
    },
    {
      name: "abrangenciaUsinas",
      label: "Abrangência das usinas",
      type: "textarea",
      span: 2,
      placeholder: "Ex: Gazin Ji-Paraná - Filial 67 - RO; Gazin Matriz; ...",
    },
    { name: "idContratoZoho", label: "ID do contrato (Zoho)", type: "text", span: 1 },
    { name: "anexoContrato", label: "Anexo do contrato", type: "textarea", span: 2 },
  ];
}
