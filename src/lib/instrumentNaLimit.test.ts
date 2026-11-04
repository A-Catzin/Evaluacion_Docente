import { describe, expect, it } from 'vitest';
import { excessiveNaMessage, hasExcessiveNa, maxAllowedNa } from './instrumentNaLimit';

describe('N/A limit of versioned instruments', () => {
  it('allows up to 20% N/A and blocks anything above', () => {
    expect(maxAllowedNa(12)).toBe(2);
    expect(hasExcessiveNa(2, 12)).toBe(false);
    expect(hasExcessiveNa(3, 12)).toBe(true);
    expect(hasExcessiveNa(4, 12)).toBe(true);
    expect(hasExcessiveNa(0, 12)).toBe(false);
  });
  it('matches the database rule exactly at the boundary', () => {
    expect(hasExcessiveNa(1, 5)).toBe(false); // exactly 20%
    expect(hasExcessiveNa(2, 5)).toBe(true);
    expect(maxAllowedNa(5)).toBe(1);
  });
  it('explains how many N/A are allowed', () => {
    expect(excessiveNaMessage(4, 12)).toBe('Hay demasiadas respuestas N/A (4 de 12). Máximo permitido: 2 (20%). Contesta más criterios para poder enviar.');
  });
});
