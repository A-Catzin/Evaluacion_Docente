import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  calculateSubjectAwareFinal,
  fetchSubjectAwareCuatrimestreScores,
} from './scoring';

function resolvedQuery(data: unknown) {
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(onFulfilled, onRejected),
  };
  return query;
}

function createSubjectScopedScoresClient(): SupabaseClient {
  const assignments = [
    { id: 1, clave: '1A', asignatura_id: 10, modalidad: 'Escolarizado', asignaturas: { nombre: 'Álgebra' } },
    { id: 2, clave: '1B', asignatura_id: 11, modalidad: 'Escolarizado', asignaturas: { nombre: 'Física' } },
    { id: 3, clave: '1C', asignatura_id: 12, modalidad: 'Escolarizado', asignaturas: { nombre: 'Química' } },
  ];
  const plans = [{ asignatura_id: 10, puntaje_promedio: 80, estado: 'Aprobado', asignaturas: { nombre: 'Álgebra' } }];
  const coordination = [
    { id: 2, asignatura_id: 11, score_normalizado: 90 },
    { id: 1, asignatura_id: 10, score_normalizado: 70 },
  ];
  const observations = [
    { id: 2, asignatura_id: 11, cco1: 3 },
    { id: 1, asignatura_id: 10, cco1: 5 },
  ];

  return {
    from: (table: string) => resolvedQuery(
      table === 'grupos' ? assignments
        : table === 'planeaciones' ? plans
        : table === 'planning_subject_np' ? [{ subject_key: 'fisica', estado: 'NP' }, { subject_key: 'quimica', estado: 'NP' }]
        : table === 'evaluacion_coordinacion' ? coordination
        : table === 'observaciones' ? observations
        : table === 'autodiagnosticos' ? [{ puntaje_total: 120 }]
        : [],
    ),
    rpc: (fn: string) => Promise.resolve(
      fn === 'obtener_scores_encuesta_estudiantil_nativa'
        ? {
          data: [10, 11, 12].map((asignatura_id) => ({
            docente_id: 1,
            asignatura_id,
            grupo_id: asignatura_id,
            cuatrimestre_id: 1,
            respuestas_validas: 1,
            score_normalizado: 90,
          })),
          error: null,
        }
        : {
          data: [
            { docente_id: 1, purpose: 'coordination', validity_status: 'valid', normalized_score: 75, submitted_at: '2025-01-02T00:00:00Z' },
            { docente_id: 1, purpose: 'observation', validity_status: 'valid', normalized_score: 65, submitted_at: '2025-01-02T00:00:00Z' },
          ],
          error: null,
        },
    ),
  } as unknown as SupabaseClient;
}

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

      describe('subject-aware planning NP scores', () => {
        const base = { ee: 90, coord: 90, obs: 90, auto: 90, invalidPurposes: [] };

        it('uses subject-specific coordination and observation scores before global versioned fallbacks', async () => {
          const result = await fetchSubjectAwareCuatrimestreScores(createSubjectScopedScoresClient(), 1, 1, 'Escolarizado');
          const byKey = new Map(result.subjects.map((subject) => [subject.key, subject]));

          expect(byKey.get('algebra')).toMatchObject({ coord: 70, obs: 100, planningStatus: 'approved' });
          expect(byKey.get('fisica')).toMatchObject({ coord: 90, obs: 60, planningStatus: 'np' });
          expect(byKey.get('quimica')).toMatchObject({ coord: 75, obs: 65, planningStatus: 'np' });
        });

        it('keeps a planned-only subject on all five normal weights', () => {
      const result = calculateSubjectAwareFinal([{ ...base, key: 'algebra', nombre: 'Álgebra', grupos: ['1A'], planningStatus: 'approved', plan: 90 }]);
      expect(result.final).toMatchObject({ final: 90, category: 'Sobresaliente', expectedInstrumentCount: 5 });
      expect(result.aggregate.plan).toBe(90);
    });

    it('uses four NP weights and stores no planning score', () => {
      const result = calculateSubjectAwareFinal([{ ...base, key: 'fisica', nombre: 'Física', grupos: ['1A'], planningStatus: 'np', plan: undefined }]);
      expect(result.final).toMatchObject({ final: 90, category: 'Sobresaliente', expectedInstrumentCount: 4 });
      expect(result.aggregate.plan).toBeUndefined();
    });

    it('simple-averages planned and NP subject finals without treating NP as zero', () => {
      const result = calculateSubjectAwareFinal([
        { ...base, key: 'algebra', nombre: 'Álgebra', grupos: ['1A'], planningStatus: 'approved', plan: 90 },
        { ee: 100, coord: 100, obs: 100, auto: 100, key: 'fisica', nombre: 'Física', grupos: ['1B'], planningStatus: 'np', plan: undefined },
      ]);
      expect(result.final).toMatchObject({ final: 95, category: 'Sobresaliente', expectedInstrumentCount: 5 });
      expect(result.aggregate.plan).toBe(90);
    });

    it('does not silently convert a pending subject to NP', () => {
      const result = calculateSubjectAwareFinal([{ ...base, key: 'quimica', nombre: 'Química', grupos: ['1A'], planningStatus: 'pending', plan: undefined }]);
      expect(result.final.category).toBe('Parcial');
      expect(result.final.expectedInstrumentCount).toBe(5);
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
