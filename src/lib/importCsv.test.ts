import { describe, expect, it } from 'vitest';
import {
  chunks,
  csvEscape,
  findColumn,
  normalizeEmail,
  normalizeKey,
  normalizeText,
  parseCsv,
} from './importCsv';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('importCsv', () => {
  describe('parseCsv', () => {
    it('parsea un CSV válido con encabezados y filas', () => {
      const text = 'NOMBRE,EMAIL,GRUPO\nJuan Pérez,juan@example.com,A\nMaría García,maria@example.com,B';
      const records = parseCsv(text);
      expect(records).toHaveLength(3);
      expect(records[0]).toEqual(['NOMBRE', 'EMAIL', 'GRUPO']);
      expect(records[1]).toEqual(['Juan Pérez', 'juan@example.com', 'A']);
    });

    it('respeta comillas y comas dentro de campos', () => {
      const text = 'NOMBRE,EMAIL\n"Pérez, Juan",juan@example.com';
      const records = parseCsv(text);
      expect(records[1]).toEqual(['Pérez, Juan', 'juan@example.com']);
    });

    it('respeta comillas escapadas', () => {
      const text = 'NOMBRE,EMAIL\n"Juan ""Paco""",juan@example.com';
      const records = parseCsv(text);
      expect(records[1][0]).toBe('Juan "Paco"');
    });

    it('omite filas vacías', () => {
      const text = 'NOMBRE,EMAIL\nJuan,juan@example.com\n\n\nMaría,maria@example.com\n';
      const records = parseCsv(text);
      expect(records).toHaveLength(3);
    });

    it('detecta filas con campos vacíos', () => {
      const text = 'NOMBRE,EMAIL,GRUPO\nJuan,juan@example.com,A\n,,A';
      const records = parseCsv(text);
      const [nombre, email, grupo] = records[2];
      expect(nombre).toBe('');
      expect(email).toBe('');
      expect(grupo).toBe('A');
    });

    it('detecta emails mal formados en filas parseadas', () => {
      const text = 'NOMBRE,EMAIL\nJuan,juan@example.com\nAna,not-an-email\nPedro,';
      const records = parseCsv(text);
      const invalid = records.slice(1).filter(([, email]) => !EMAIL_REGEX.test(email));
      expect(invalid).toHaveLength(2);
      expect(invalid[0][0]).toBe('Ana');
      expect(invalid[1][0]).toBe('Pedro');
    });
  });

  describe('normalizeText', () => {
    it('quita acentos, pasa a mayúsculas y normaliza espacios', () => {
      expect(normalizeText('  ingeniería  ')).toBe('INGENIERIA');
    });
  });

  describe('normalizeKey', () => {
    it('elimina caracteres no alfanuméricos', () => {
      expect(normalizeKey('Correo Institucional')).toBe('CORREOINSTITUCIONAL');
    });
  });

  describe('normalizeEmail', () => {
    it('limpia y pasa a minúsculas', () => {
      expect(normalizeEmail('  Juan.Perez@EXAMPLE.COM ')).toBe('juan.perez@example.com');
    });
  });

  describe('findColumn', () => {
    it('encuentra columnas por nombre normalizado', () => {
      const headers = ['Nombre Completo', 'CORREO INSTITUCIONAL'];
      expect(findColumn(headers, 'nombre completo')).toBe(0);
      expect(findColumn(headers, 'correo institucional')).toBe(1);
      expect(findColumn(headers, 'noexiste')).toBe(-1);
    });
  });

  describe('chunks', () => {
    it('divide un arreglo en bloques del tamaño indicado', () => {
      expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  describe('csvEscape', () => {
    it('no escapa texto simple', () => {
      expect(csvEscape('hola')).toBe('hola');
    });

    it('envuelve entre comillas cuando hay comas o saltos', () => {
      expect(csvEscape('hola, mundo')).toBe('"hola, mundo"');
      expect(csvEscape('linea\n2')).toBe('"linea\n2"');
      expect(csvEscape('dice "hola"')).toBe('"dice ""hola"""');
    });
  });
});
