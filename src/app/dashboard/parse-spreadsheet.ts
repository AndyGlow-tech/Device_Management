"use server";

import ExcelJS from "exceljs";
import type { RawImportRow } from "@/lib/import";

export type ParseSpreadsheetResult =
  | { rows: RawImportRow[]; error?: undefined }
  | { rows?: undefined; error: string };

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object") {
    if ("text" in value) return (value as { text: string }).text;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return value;
}

export async function parseSpreadsheet(
  formData: FormData,
): Promise<ParseSpreadsheetResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided." };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // exceljs's bundled types predate @types/node's newer generic Buffer,
    // so the two Buffer types don't structurally match even though this
    // is a real Node Buffer at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch {
    return { error: "Could not read this file as an Excel spreadsheet." };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { error: "The spreadsheet has no sheets." };
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cellValue(cell) ?? "").trim();
  });

  const rows: RawImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: RawImportRow = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      record[header] = cellValue(cell);
      hasValue = true;
    });
    if (hasValue) rows.push(record);
  });

  return { rows };
}
