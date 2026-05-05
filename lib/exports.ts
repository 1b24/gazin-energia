/**
 * Bulk-export helpers (XLSX / CSV / JSON).
 *
 * Server-side: rodam dentro de server actions ou route handlers; produzem
 * `{ buffer, filename, mimetype }` que o handler retorna como Response.
 *
 * Os dados já vêm filtrados/ordenados pela camada chamadora (a EntityPage
 * passa o subset que respeita filtros da URL).
 */
import * as XLSX from "xlsx";

export type ExportFormat = "xlsx" | "csv" | "json";

export interface ExportPayload {
  buffer: ArrayBuffer | Uint8Array | string;
  filename: string;
  mimetype: string;
}

const MIME: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  json: "application/json",
};

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function exportRows<T extends Record<string, unknown>>(
  rows: T[],
  format: ExportFormat,
  basename: string,
): ExportPayload {
  const stamp = nowStamp();
  const filename = `${basename}-${stamp}.${format}`;

  if (format === "json") {
    return {
      buffer: JSON.stringify(rows, null, 2),
      filename,
      mimetype: MIME.json,
    };
  }

  const sheet = XLSX.utils.json_to_sheet(rows);

  if (format === "csv") {
    return {
      buffer: XLSX.utils.sheet_to_csv(sheet),
      filename,
      mimetype: MIME.csv,
    };
  }

  // xlsx
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, basename.slice(0, 31));
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { buffer: buf, filename, mimetype: MIME.xlsx };
}
