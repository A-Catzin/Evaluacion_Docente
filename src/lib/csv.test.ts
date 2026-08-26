import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from './csv';

describe('CSV helpers', () => {
  it('quotes delimiters, quotes, and line breaks', () => {
    expect(escapeCsvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(escapeCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(escapeCsvCell('-cmd')).toBe('"\'-cmd"');
  });

  it('emits UTF-8 BOM and CRLF rows for spreadsheet compatibility', () => {
    expect(toCsv([['Nombre', 'Valor'], ['Ana', 5]])).toBe('\uFEFF"Nombre","Valor"\r\n"Ana","5"\r\n');
  });
});
