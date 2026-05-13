/**
 * Converte um registro do banco (formato Prisma serializado) em valores
 * iniciais pro `<EntityForm />`. Aplica máscaras BR e formata datas de volta
 * pro shape que os campos `<input>` esperam — inverso dos preprocess do schema.
 */
import type { FormFieldConfig } from "./entity-form";
import { maskCNPJ } from "./masks";

function formatDateBR(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function formatNumberBR(n: number, decimals = 2): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatForField(value: unknown, field: FormFieldConfig): unknown {
  const type = field.type;
  if (value == null) return type === "boolean" ? false : "";

  switch (type) {
    case "currency":
      return typeof value === "number"
        ? formatNumberBR(value, field.decimals)
        : String(value);
    case "date":
      return value instanceof Date || typeof value === "string"
        ? formatDateBR(value as Date | string)
        : "";
    case "cnpj":
      return typeof value === "string" ? maskCNPJ(value) : "";
    case "boolean":
      return !!value;
    case "number":
      return typeof value === "number" ? value : "";
    case "select":
      return value == null ? "" : String(value);
    default:
      return value == null ? "" : String(value);
  }
}

/**
 * Recebe a entidade (já passada por `serializePrisma()`) e retorna um objeto
 * compatível com `defaultValues` do `<EntityForm />`. Campos não listados em
 * `fields` são ignorados.
 */
export function entityToFormDefaults<T extends Record<string, unknown>>(
  entity: T,
  fields: FormFieldConfig[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    out[f.name] = formatForField(entity[f.name], f);
  }
  return out;
}
