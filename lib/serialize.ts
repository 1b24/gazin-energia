/**
 * Converte rows do Prisma em objetos plain JSON-friendly antes de passar
 * de Server Components para Client Components.
 *
 * Por que: RSC só serializa "plain objects". `Decimal` (decimal.js) e
 * `BigInt` quebram. `Date` e `null` passam OK. Aplicar este helper na
 * borda RSC→Client mantém o componente client tipado com `number` em vez
 * de `Decimal`.
 *
 * Tipo de saída: usa `unknown` no entry e o caller refina com `as` ou
 * convenientemente via `serializePrismaRow<T>(row)` se precisar.
 */
import { Decimal } from "decimal.js";

export type Serialized<T> = T extends Decimal
  ? number
  : T extends Date
    ? Date
    : T extends Array<infer U>
      ? Array<Serialized<U>>
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

function isDecimalLike(v: unknown): v is { toNumber(): number } {
  if (v == null || typeof v !== "object") return false;
  // @prisma/client devolve uma instância de Prisma.Decimal cujo construtor é
  // `Decimal` (do decimal.js) e tem `toNumber`. Cobrir ambos com duck-typing.
  if (v instanceof Decimal) return true;
  return (
    typeof (v as { toNumber?: unknown }).toNumber === "function" &&
    typeof (v as { toFixed?: unknown }).toFixed === "function"
  );
}

export function serializePrisma<T>(input: T): Serialized<T> {
  if (input == null) return input as Serialized<T>;
  if (isDecimalLike(input)) {
    return input.toNumber() as Serialized<T>;
  }
  if (input instanceof Date) return input as Serialized<T>;
  if (Array.isArray(input)) {
    return input.map((v) => serializePrisma(v)) as Serialized<T>;
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(input)) {
      out[k] = serializePrisma((input as Record<string, unknown>)[k]);
    }
    return out as Serialized<T>;
  }
  return input as Serialized<T>;
}
