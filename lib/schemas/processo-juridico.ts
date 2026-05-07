/**
 * Schema Zod + config de form para ProcessoJuridico.
 *
 * Sem FK formal: `nomeUsinasRaw` cita múltiplas usinas em texto livre
 * ("Gazin NAS II- Filial 265 - MS, Gazin Matriz, ..."). A resolução pra
 * tabela de junção fica para uma etapa futura.
 */
import { z } from "zod";
import { TipoProcesso } from "@prisma/client";

import type { FormFieldConfig } from "@/components/forms/entity-form";

const TIPO_VALUES = Object.values(TipoProcesso) as [
  TipoProcesso,
  ...TipoProcesso[],
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

export const processoJuridicoSchema = z.object({
  tipo: z.preprocess(emptyToNull, z.enum(TIPO_VALUES).nullable()),
  parteAdversa: z.preprocess(nullishToNull, z.string().nullable()),
  pleito: z.preprocess(nullishToNull, z.string().nullable()),
  fornecedor: z.preprocess(nullishToNull, z.string().nullable()),
  evolucaoJaneiro: z.preprocess(nullishToNull, z.string().nullable()),
  nomeUsinasRaw: z.preprocess(nullishToNull, z.string().nullable()),
  dataProtocolo: dateFromBR(),
});

export type ProcessoJuridicoInput = z.infer<typeof processoJuridicoSchema>;

export const TIPO_PROCESSO_LABEL: Record<TipoProcesso, string> = {
  judicial: "Judicial",
  administrativo: "Administrativo",
};

export const processoJuridicoFormFields: FormFieldConfig[] = [
  {
    name: "nomeUsinasRaw",
    label: "Usina(s) envolvida(s)",
    type: "textarea",
    span: 2,
    placeholder: "Lista textual — uma ou mais usinas",
    helpText: "Texto livre. Vinculação formal a Usinas vem em iteração futura.",
  },
  {
    name: "tipo",
    label: "Tipo",
    type: "select",
    span: 1,
    options: TIPO_VALUES.map((v) => ({
      value: v,
      label: TIPO_PROCESSO_LABEL[v],
    })),
  },
  {
    name: "dataProtocolo",
    label: "Data do protocolo",
    type: "date",
    span: 1,
  },
  {
    name: "parteAdversa",
    label: "Parte adversa",
    type: "text",
    span: 1,
    placeholder: "ENERGISA, COEPL, ...",
  },
  {
    name: "fornecedor",
    label: "Fornecedor (string)",
    type: "text",
    span: 1,
  },
  {
    name: "pleito",
    label: "Pleito",
    type: "textarea",
    span: 2,
    placeholder: "Ex: GD2 PARA GD3, GD3 PARA GD1...",
  },
  {
    name: "evolucaoJaneiro",
    label: "Evolução do processo (Janeiro)",
    type: "textarea",
    span: 2,
  },
];
