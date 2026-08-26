import { describe, expect, it } from 'vitest';
import {
  calcFinalScore,
  calcObservationScore,
  formatScore,
  formatScoreCsv,
  getCategory,
  normalizarModalidad,
  obtenerPerfilModalidad,
  OBSERVATION_FIELDS,
  WEIGHTS,
  type InstrumentScores,
  type NativeStudentEvaluationScore,
  aggregateNativeScoresByTeacher,
  aggregateNativeScoresByTeacherAndSubject,
} from './scoring';

describe('scoring', () => {
  describe('calcObservationScore', () => {
    it('calcula el promedio normalizado a 5 y redondea', () => {
      const row = { cco1: 5, cco2: 5, cco3: 4, cco4: 4, cco5: 3 };
      expect(calcObservationScore(row)).toBe(84);
    });

    it('ignora valores nulos, indefinidos o cero', () => {
      const row = { cco1: 5, cco2: null, cco3: undefined, cco4: 0, cco5: 5 };
      expect(calcObservationScore(row)).toBe(100);
    });

    it('devuelve 0 cuando no hay respuestas', () => {
      expect(calcObservationScore({})).toBe(0);
    });

    it('devuelve 100 cuando todas son 5', () => {
      const row = Object.fromEntries(
        OBSERVATION_FIELDS.map((field) => [field, 5]),
      );
      expect(calcObservationScore(row)).toBe(100);
    });
  });

  describe('normalizarModalidad', () => {
    it('normaliza mayúsculas, acentos y espacios', () => {
      expect(normalizarModalidad('  Ejecutivo / Inglés ')).toBe('ejecutivo / ingles');
      expect(normalizarModalidad('EJECUTIVO')).toBe('ejecutivo');
      expect(normalizarModalidad('inglés')).toBe('ingles');
    });

    it('maneja valores nulos', () => {
      expect(normalizarModalidad(null)).toBe('');
      expect(normalizarModalidad(undefined)).toBe('');
    });
  });

  describe('obtenerPerfilModalidad', () => {
    it('usa pesos normales por defecto', () => {
      const profile = obtenerPerfilModalidad('escolarizado');
      expect(profile.weights).toEqual(WEIGHTS);
      expect(profile.expectedInstrumentCount).toBe(5);
    });

    it('detecta modalidad ejecutiva', () => {
      const profile = obtenerPerfilModalidad('ejecutivo');
      expect(profile.weights.plan).toBe(0);
      expect(profile.weights.obs).toBe(0.3);
      expect(profile.expectedInstrumentCount).toBe(4);
    });

    it('detecta modalidad en inglés como ejecutiva', () => {
      const profile = obtenerPerfilModalidad('Inglés');
      expect(profile.weights.plan).toBe(0);
      expect(profile.expectedInstrumentCount).toBe(4);
    });
  });

  describe('calcFinalScore', () => {
    it('calcula score final con todos los instrumentos', () => {
      const scores: InstrumentScores = { ee: 80, coord: 90, plan: 70, obs: 85, auto: 100 };
      const result = calcFinalScore(scores);
      expect(result.instrumentCount).toBe(5);
      expect(result.expectedInstrumentCount).toBe(5);
      expect(result.final).toBe(
        Math.round(80 * 0.35 + 90 * 0.2 + 70 * 0.15 + 85 * 0.25 + 100 * 0.05),
      );
    });

    it('score 100 con todos los instrumentos al máximo', () => {
      const scores: InstrumentScores = { ee: 100, coord: 100, plan: 100, obs: 100, auto: 100 };
      expect(calcFinalScore(scores)).toMatchObject({
        final: 100,
        instrumentCount: 5,
        expectedInstrumentCount: 5,
        category: 'Sobresaliente',
      });
    });

    it('score 0 con todos los instrumentos al mínimo', () => {
      const scores: InstrumentScores = { ee: 0, coord: 0, plan: 0, obs: 0, auto: 0 };
      expect(calcFinalScore(scores)).toMatchObject({
        final: 0,
        instrumentCount: 5,
        category: 'Insuficiente',
      });
    });

    it('ejecutivo/inglés excluye planeación y repesa correctamente', () => {
      const scores: InstrumentScores = { ee: 80, coord: 90, obs: 85, auto: 100 };
      const result = calcFinalScore(scores, 'ejecutivo');
      expect(result.instrumentCount).toBe(4);
      expect(result.expectedInstrumentCount).toBe(4);
      expect(result.final).toBe(Math.round(80 * 0.4 + 90 * 0.25 + 85 * 0.3 + 100 * 0.05));
    });

    it('marca parcial cuando faltan instrumentos', () => {
      const result = calcFinalScore({ ee: 80 });
      expect(result.instrumentCount).toBe(1);
      expect(result.category).toBe('Parcial');
    });

    it('marca no iniciado cuando no hay instrumentos', () => {
      const result = calcFinalScore({});
      expect(result.final).toBe(0);
      expect(result.category).toBe('No iniciado');
    });
  });

  describe('getCategory', () => {
    it('clasifica correctamente con todos los instrumentos', () => {
      expect(getCategory(95, 5)).toBe('Sobresaliente');
      expect(getCategory(85, 5)).toBe('Distinguido');
      expect(getCategory(75, 5)).toBe('Bueno');
      expect(getCategory(65, 5)).toBe('Aprobado');
      expect(getCategory(55, 5)).toBe('A mejorar');
      expect(getCategory(45, 5)).toBe('Insuficiente');
    });

    it('clasifica parcial cuando faltan instrumentos', () => {
      expect(getCategory(85, 3, 5)).toBe('Parcial');
    });
  });

  describe('formatScore', () => {
    it('formatea con separador decimal local', () => {
      const formatter = new Intl.NumberFormat('es-MX', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      expect(formatScore(85.5)).toBe(formatter.format(85.5));
      expect(formatScore(0)).toBe(formatter.format(0));
    });

    it('devuelve guión para valores nulos', () => {
      expect(formatScore(null)).toBe('—');
      expect(formatScore(undefined)).toBe('—');
    });
  });

  describe('formatScoreCsv', () => {
    it('formatea a un decimal', () => {
      expect(formatScoreCsv(85.5)).toBe('85.5');
      expect(formatScoreCsv(null)).toBe('—');
    });
  });

  describe('aggregateNativeScoresByTeacher', () => {
    it('promedia ponderado por cantidad de respuestas válidas', () => {
      const rows: NativeStudentEvaluationScore[] = [
        { docente_id: 1, asignatura_id: 10, grupo_id: 100, cuatrimestre_id: 1, respuestas_validas: 10, score_normalizado: 80, version_calculo: 'native-19-v2' },
        { docente_id: 1, asignatura_id: 11, grupo_id: 101, cuatrimestre_id: 1, respuestas_validas: 20, score_normalizado: 90, version_calculo: 'native-19-v2' },
      ];
      const map = aggregateNativeScoresByTeacher(rows);
      expect(map.get(1)).toBe((10 * 80 + 20 * 90) / 30);
    });

    it('ignora respuestas inválidas', () => {
      const rows: NativeStudentEvaluationScore[] = [
        { docente_id: 2, asignatura_id: 10, grupo_id: 100, cuatrimestre_id: 1, respuestas_validas: 0, score_normalizado: 80, version_calculo: 'native-19-v2' },
      ];
      expect(aggregateNativeScoresByTeacher(rows).has(2)).toBe(false);
    });
  });

  describe('aggregateNativeScoresByTeacherAndSubject', () => {
    it('agrupa por docente y asignatura', () => {
      const rows: NativeStudentEvaluationScore[] = [
        { docente_id: 1, asignatura_id: 10, grupo_id: 100, cuatrimestre_id: 1, respuestas_validas: 5, score_normalizado: 80, version_calculo: 'native-19-v2' },
        { docente_id: 1, asignatura_id: 10, grupo_id: 101, cuatrimestre_id: 1, respuestas_validas: 15, score_normalizado: 90, version_calculo: 'native-19-v2' },
        { docente_id: 1, asignatura_id: 11, grupo_id: 102, cuatrimestre_id: 1, respuestas_validas: 10, score_normalizado: 70, version_calculo: 'native-19-v2' },
      ];
      const map = aggregateNativeScoresByTeacherAndSubject(rows);
      expect(map.get(1)?.get(10)).toBe((5 * 80 + 15 * 90) / 20);
      expect(map.get(1)?.get(11)).toBe(70);
    });
  });
});
