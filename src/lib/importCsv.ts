export type CsvRecord = string[];

export function normalizeText(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeKey(value: string | null | undefined): string {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, '');
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function normalizeEmployeeNumber(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, '');
}

export function parseCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field.trim());
      field = '';
    } else if (char === '\n') {
      record.push(field.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || record.length) {
    record.push(field.trim());
    if (record.some(Boolean)) records.push(record);
  }
  return records;
}

export function findColumn(headers: string[], ...names: string[]): number {
  const normalized = headers.map(normalizeKey);
  for (const name of names) {
    const index = normalized.indexOf(normalizeKey(name));
    if (index >= 0) return index;
  }
  return -1;
}

export function chunks<T>(items: T[], size = 100): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
