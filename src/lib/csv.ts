export function escapeCsvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Prevent spreadsheet formula evaluation in Excel-compatible consumers.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}
