/**
 * Schema Zod + config de form para Filial.
 *
 * O schema é o ÚNICO ponto de verdade pra validação — usado tanto pelo form
 * (`<EntityForm />` via zodResolver) quanto pela server action (`createCrudActions`
 * → `schema.parse(input)`). Os transforms convertem os valores mascarados do
 * input ("12.345.678/0001-90", "100,00", "31/12/2026") para a shape que o
 * Prisma aceita (digits-only, number, Date).
 */
import { z } from "zod";
import { UF } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";

const UF_VALUES = Object.values(UF) as [UF, ...UF[]];

// `nullishToNull`: trata "", null, undefined como null. Usado pra strings opcionais.
function nullishToNull(s: string | null | undefined) {
  return s == null || s === "" ? null : s.trim();
}

export const filialSchema = z.object({
  codigo: z.preprocess(nullishToNull, z.string().nullable()),
  cd: z.preprocess(nullishToNull, z.string().nullable()),
  mercadoLivre: z.preprocess(nullishToNull, z.string().nullable()),
  uc: z.preprocess(nullishToNull, z.string().nullable()),
  uc2: z.preprocess(nullishToNull, z.string().nullable()),
  uc3: z.preprocess(nullishToNull, z.string().nullable()),
  municipio: z.preprocess(nullishToNull, z.string().nullable()),
  uf: z.preprocess(
    (v) => (v == null || v === "" ? null : v),
    z.enum(UF_VALUES).nullable(),
  ),
  senha: z.preprocess(nullishToNull, z.string().nullable()),
  usuario: z.preprocess(nullishToNull, z.string().nullable()),
  grupo: z.preprocess(nullishToNull, z.string().nullable()),
  distribuidora: z.preprocess(nullishToNull, z.string().nullable()),
  filialClimatizada: z.preprocess(nullishToNull, z.string().nullable()),

  // CNPJ — aceita formatado ("12.345.678/0001-90") ou só dígitos. Salva digits-only.
  cnpj: z
    .preprocess((v) => {
      if (v == null || v === "") return null;
      const digits = String(v).replace(/\D/g, "");
      return digits.length === 0 ? null : digits;
    }, z.string().nullable())
    .refine((s) => s == null || s.length === 14, {
      message: "CNPJ deve ter 14 dígitos",
    }),

  // Percentual — aceita "100", "100,00", "100.00", number. Salva number.
  percentualAbsorcaoUsp: z
    .preprocess((v) => {
      if (v == null || v === "") return null;
      if (typeof v === "number") return v;
      const cleaned = String(v).replace(/\./g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }, z.number().min(0).max(100).nullable())
    .nullable(),

  // Data — aceita "dd/mm/yyyy" do input. Salva Date.
  dataClimatizacaoPlanejada: z.preprocess(
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
  ),
});

export type FilialInput = z.infer<typeof filialSchema>;

// ----------------------------------------------------------------------------
// Form config — lida pelo `<EntityForm />`. Ordem reflete a UX desejada.
// ----------------------------------------------------------------------------

export const filialFormFields: FormFieldConfig[] = [
  { name: "codigo",        label: "Código",          type: "text", span: 1, placeholder: "Ex: 10067" },
  { name: "cd",            label: "CD",              type: "text", span: 1, placeholder: "Fábrica / CD..." },
  { name: "mercadoLivre",  label: "Mercado Livre",   type: "text", span: 2, placeholder: "Nome / código no ML" },
  { name: "cnpj",          label: "CNPJ",            type: "cnpj", span: 1 },
  { name: "distribuidora", label: "Distribuidora",   type: "text", span: 1, placeholder: "Energisa - RO..." },
  { name: "grupo",         label: "Grupo Tarifário", type: "text", span: 1, placeholder: "Alta tensão" },
  { name: "uc",            label: "UC principal",    type: "text", span: 1 },
  { name: "uc2",           label: "UC #2",           type: "text", span: 1 },
  { name: "uc3",           label: "UC #3",           type: "text", span: 1 },
  { name: "municipio",     label: "Município",       type: "text", span: 1 },
  {
    name: "uf",
    label: "UF",
    type: "select",
    span: 1,
    options: UF_VALUES.map((u) => ({ value: u, label: u })),
  },
  {
    name: "percentualAbsorcaoUsp",
    label: "% Absorção USP",
    type: "currency",
    span: 1,
    placeholder: "0,00",
    helpText: "Entre 0 e 100",
  },
  { name: "filialClimatizada", label: "Climatizada", type: "text", span: 1, placeholder: "Sim / Não" },
  {
    name: "dataClimatizacaoPlanejada",
    label: "Climatização planejada para",
    type: "date",
    span: 1,
  },
  { name: "usuario", label: "Usuário",  type: "text", span: 1 },
  // `senha` propositalmente AUSENTE do form genérico — é credencial do portal
  // da distribuidora e nunca deve atravessar a borda RSC→Client pelo payload
  // de lista. Edição via fluxo admin dedicado (TODO). Mantida no `filialSchema`
  // pra que o seed/import legado e o eventual endpoint admin continuem aceitando.
];
