export type CsvAmount = { halere: number };
export type CsvValue = string | number | CsvAmount | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function formatAmount(halere: number): string {
  const sign = halere < 0 ? "-" : "";
  const absolute = Math.abs(halere);
  return `${sign}${Math.trunc(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return formatAmount(value.halere);
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** CSV pro český Excel: UTF-8 s BOM, oddělovač středník, řádky CRLF. */
export function buildCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
