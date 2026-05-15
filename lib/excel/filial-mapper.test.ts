import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  excelRowToFilial,
  filialToExcelRow,
  FILIAL_EXCEL_COLUMNS,
  parseDecimalPercent,
  type FilialExportRow,
} from "@/lib/excel/filial-mapper";

const filialBase = {
  id: "filial-1",
  codigo: "10153",
  cd: null,
  mercadoLivre: "10153.1",
  cnpj: null,
  distribuidora: "ENERGISA",
  grupo: null,
  classeTensao: null,
  uc: null,
  uc2: null,
  uc3: null,
  municipio: "Campo Grande",
  uf: "MS",
  percentualAbsorcaoUsp: 3.22,
  filialClimatizada: null,
  dataClimatizacaoPlanejada: null,
  usuario: null,
} satisfies FilialExportRow;

describe("filial excel mapper", () => {
  it("exports % Absorção USP with dot decimal text", () => {
    const row = filialToExcelRow(filialBase);

    expect(row["% Absorção USP"]).toBe("3.22");
  });

  it.each([
    ["3.22", 3.22],
    ["3,22", 3.22],
    [3.22, 3.22],
    ["0.0322", 0.0322],
    ["100,00", 100],
    ["100.00", 100],
  ])("parses % Absorção USP value %s as %s", (raw, expected) => {
    expect(parseDecimalPercent(raw)).toBe(expected);
  });

  it("rejects values outside 0..100 without changing scale", () => {
    const parsed = excelRowToFilial({ "% Absorção USP": "322" }, 2);

    expect(parsed.data.percentualAbsorcaoUsp).toBeNull();
    expect(parsed.errors).toEqual([
      expect.objectContaining({
        field: "% Absorção USP",
        expected: "Número entre 0 e 100.",
      }),
    ]);
  });

  it("round-trips the exported model through XLSX import parsing", () => {
    const ws = XLSX.utils.json_to_sheet([filialToExcelRow(filialBase)], {
      header: FILIAL_EXCEL_COLUMNS as unknown as string[],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Filiais");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const readWb = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = readWb.Sheets[readWb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: null,
    });

    expect(rows[0]["% Absorção USP"]).toBe("3.22");

    const parsed = excelRowToFilial(rows[0], 2);
    expect(parsed.errors).toEqual([]);
    expect(parsed.data.percentualAbsorcaoUsp).toBe(3.22);
  });
});
