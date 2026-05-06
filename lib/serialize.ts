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
  // Path #1: instância da nossa cópia do decimal.js (lib root).
  if (v instanceof Decimal) return true;
  // Path #2: instância de OUTRA cópia (Prisma 7 traz a sua própria — o
  // `instanceof` falha entre cópias). Duck-type por `toNumber` é suficiente:
  // Date, Buffer, etc. não têm. Importante: NÃO exigimos `toFixed`, porque
  // versões internas do Prisma podem omitir.
  if (typeof (v as { toNumber?: unknown }).toNumber === "function") {
    // Sanity adicional: descarta objects que tem toNumber mas não são
    // decimais — precisa também produzir number ao chamar.
    try {
      const n = (v as { toNumber(): unknown }).toNumber();
      return typeof n === "number";
    } catch {
      return false;
    }
  }
  return false;
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
