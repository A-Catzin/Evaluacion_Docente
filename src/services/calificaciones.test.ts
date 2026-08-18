import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  obtenerCalificacionDocente,
  obtenerCalificacionesPorCuatrimestre,
  recalcularCalificacionDocente,
  refrescarResultadosAgregados,
} from './calificaciones';
import { OBSERVATION_FIELDS } from './scoring';

type Filter = { method: string; args: unknown[] };

class MockQueryBuilder {
  table: string;
  operation = 'select';
  payload: unknown = null;
  options: unknown = null;
  filters: Filter[] = [];
  selectFields = '*';

  constructor(table: string) {
    this.table = table;
  }

  select(fields = '*') {
    this.selectFields = fields;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ method: 'eq', args: [field, value] });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ method: 'in', args: [field, values] });
    return this;
  }

  order(field: string, options?: { ascending: boolean }) {
    this.filters.push({ method: 'order', args: [field, options] });
    return this;
  }

  limit(n: number) {
    this.filters.push({ method: 'limit', args: [n] });
    return this;
  }

  insert(payload: unknown) {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.operation = 'upsert';
    this.payload = payload;
    this.options = options;
    return this;
  }

  single() {
    return Promise.resolve(resolveTable(this));
  }

  maybeSingle() {
    return Promise.resolve(resolveTable(this));
  }

  then<T>(
    onFulfilled?: ((value: unknown) => T | PromiseLike<T>) | undefined | null,
    onRejected?: ((reason: unknown) => T | PromiseLike<T>) | undefined | null,
  ): Promise<T> {
    return Promise.resolve(resolveTable(this)).then(onFulfilled, onRejected);
  }
}

function matchFilters(builder: MockQueryBuilder, expected: Record<string, unknown>) {
  for (const [field, value] of Object.entries(expected)) {
    const found = builder.filters.some(
      (f) => f.method === 'eq' && f.args[0] === field && f.args[1] === value,
    );
    if (!found) return false;
  }
  return true;
}

function resolveTable(builder: MockQueryBuilder) {
  const { table, operation, payload } = builder;

  if (table === 'docente_modalidad_historica' && operation === 'select') {
    return { data: resolveSnapshot(builder), error: null };
  }

  if (table === 'docente_modalidad_historica' && operation === 'insert') {
    capturedSnapshotInsert = payload;
    return { error: null };
  }

  if (table === 'docentes' && operation === 'select') {
    return { data: { modalidad: 'Escolarizada' }, error: null };
  }

  if (table === 'evaluacion_coordinacion' && operation === 'select') {
    return { data: [{ score_normalizado: 90 }], error: null };
  }

  if (table === 'planeaciones' && operation === 'select') {
    return { data: [{ puntaje_promedio: 70 }], error: null };
  }

  if (table === 'observaciones' && operation === 'select') {
    const row = Object.fromEntries(
      OBSERVATION_FIELDS.map((field) => [field, 4]),
    );
    return { data: [row], error: null };
  }

  if (table === 'autodiagnosticos' && operation === 'select') {
    return { data: [{ puntaje_total: 120 }], error: null };
  }

  if (table === 'calificaciones_finales' && operation === 'upsert') {
    capturedUpsertPayload = payload;
    const p = payload as Record<string, unknown>;
    return {
      data: {
        id: 42,
        docente_id: p.docente_id,
        cuatrimestre_id: p.cuatrimestre_id,
        modalidad_snapshot: p.modalidad_snapshot,
        score_encuesta_estudiantil: p.score_encuesta_estudiantil,
        score_coordinacion: p.score_coordinacion,
        score_planeacion: p.score_planeacion,
        score_observacion: p.score_observacion,
        score_autoevaluacion: p.score_autoevaluacion,
        calificacion_final: p.calificacion_final,
        categoria_final: p.categoria_final,
        num_instrumentos_completados: p.num_instrumentos_completados,
        num_instrumentos_esperados: p.num_instrumentos_esperados,
        version_calculo: p.version_calculo,
        calculada_en: p.calculada_en,
      },
      error: null,
    };
  }

  if (table === 'calificaciones_finales' && operation === 'select') {
    return { data: resolveCalificacionFinal(builder), error: null };
  }

  return { data: null, error: null };
}

let capturedSnapshotInsert: unknown = null;
let capturedUpsertPayload: unknown = null;
let nextSnapshot: Record<string, unknown> | null = null;
let nextCalificacionFinal: Record<string, unknown> | null = null;

function resolveSnapshot(builder: MockQueryBuilder) {
  if (nextSnapshot) return nextSnapshot;
  if (matchFilters(builder, { docente_id: 1, cuatrimestre_id: 10 })) {
    return null;
  }
  return null;
}

function resolveCalificacionFinal(builder: MockQueryBuilder) {
  if (nextCalificacionFinal) return nextCalificacionFinal;
  const isSingle = builder.filters.some(
    (f) => f.method === 'eq' && f.args[0] === 'docente_id',
  );
  if (isSingle) return null;
  if (matchFilters(builder, { cuatrimestre_id: 10 })) {
    return [
      {
        id: 1,
        docente_id: 1,
        cuatrimestre_id: 10,
        modalidad_snapshot: 'Escolarizada',
        score_encuesta_estudiantil: 80,
        score_coordinacion: 90,
        score_planeacion: 70,
        score_observacion: 80,
        score_autoevaluacion: 100,
        calificacion_final: 82,
        categoria_final: 'Distinguido',
        num_instrumentos_completados: 5,
        num_instrumentos_esperados: 5,
        version_calculo: 'v2.1',
        calculada_en: '2025-01-01T00:00:00Z',
      },
    ];
  }
  return null;
}

function createMockClient(): SupabaseClient {
  return {
    from: vi.fn((table: string) => new MockQueryBuilder(table)),
    rpc: vi.fn((fn: string, params: Record<string, unknown>) => {
      if (fn === 'obtener_scores_encuesta_estudiantil_nativa') {
        return Promise.resolve({
          data: [
            {
              docente_id: params.p_cuatrimestre_id === 10 ? 1 : 999,
              asignatura_id: 100,
              grupo_id: 1000,
              cuatrimestre_id: params.p_cuatrimestre_id,
              respuestas_validas: 10,
              score_normalizado: 80,
            },
          ],
          error: null,
        });
      }
      if (fn === 'refrescar_resultados_agregados') {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  } as unknown as SupabaseClient;
}

describe('calificaciones', () => {
  beforeEach(() => {
    capturedSnapshotInsert = null;
    capturedUpsertPayload = null;
    nextSnapshot = null;
    nextCalificacionFinal = null;
  });

  describe('recalcularCalificacionDocente', () => {
    it('toma snapshot del docente si no existe histórico, calcula y persiste vía upsert', async () => {
      const client = createMockClient();
      const result = await recalcularCalificacionDocente(client, 1, 10);

      expect(result.docente_id).toBe(1);
      expect(result.cuatrimestre_id).toBe(10);
      expect(result.modalidad_snapshot).toBe('Escolarizada');
      expect(result.num_instrumentos_esperados).toBe(5);
      expect(result.version_calculo).toBe('v2.1');
      expect(result.calificacion_final).toBe(
        Math.round(80 * 0.35 + 90 * 0.2 + 70 * 0.15 + 80 * 0.25 + 100 * 0.05),
      );
      expect(result.categoria_final).toBe('Distinguido');

      expect(capturedSnapshotInsert).toMatchObject({
        docente_id: 1,
        cuatrimestre_id: 10,
        modalidad_snapshot: 'Escolarizada',
        fuente: 'primer_score',
      });

      expect(capturedUpsertPayload).toMatchObject({
        docente_id: 1,
        cuatrimestre_id: 10,
        modalidad_snapshot: 'Escolarizada',
        score_encuesta_estudiantil: 80,
        score_coordinacion: 90,
        score_planeacion: 70,
        score_observacion: 80,
        score_autoevaluacion: 100,
        num_instrumentos_completados: 5,
        num_instrumentos_esperados: 5,
        version_calculo: 'v2.1',
      });
    });

    it('usa el snapshot histórico cuando ya existe', async () => {
      nextSnapshot = {
        modalidad_snapshot: 'Ejecutivo / Inglés',
      };
      const client = createMockClient();
      const result = await recalcularCalificacionDocente(client, 1, 10);

      expect(result.modalidad_snapshot).toBe('Ejecutivo / Inglés');
      expect(result.num_instrumentos_esperados).toBe(4);
      expect(result.num_instrumentos_completados).toBe(4);
      expect(capturedSnapshotInsert).toBeNull();
    });
  });

  describe('obtenerCalificacionDocente', () => {
    it('lee y mapea la fila existente de calificaciones_finales', async () => {
      nextCalificacionFinal = {
        id: 7,
        docente_id: 2,
        cuatrimestre_id: 20,
        modalidad_snapshot: 'Escolarizada',
        score_encuesta_estudiantil: 75,
        score_coordinacion: 80,
        score_planeacion: null,
        score_observacion: 90,
        score_autoevaluacion: 85,
        calificacion_final: 82,
        categoria_final: 'Distinguido',
        num_instrumentos_completados: 4,
        num_instrumentos_esperados: 5,
        version_calculo: 'v2.1',
        calculada_en: '2025-02-01T12:00:00Z',
      };
      const client = createMockClient();
      const result = await obtenerCalificacionDocente(client, 2, 20);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(7);
      expect(result?.score_planeacion).toBeNull();
      expect(result?.calificacion_final).toBe(82);
      expect(result?.calculada_en).toBe('2025-02-01T12:00:00Z');
    });

    it('devuelve null cuando no hay fila', async () => {
      const client = createMockClient();
      const result = await obtenerCalificacionDocente(client, 99, 99);
      expect(result).toBeNull();
    });
  });

  describe('obtenerCalificacionesPorCuatrimestre', () => {
    it('devuelve las calificaciones del cuatrimestre mapeadas', async () => {
      const client = createMockClient();
      const results = await obtenerCalificacionesPorCuatrimestre(client, 10);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        docente_id: 1,
        cuatrimestre_id: 10,
        calificacion_final: 82,
        categoria_final: 'Distinguido',
      });
    });
  });

  describe('refrescarResultadosAgregados', () => {
    it('llama a la RPC correspondiente', async () => {
      const client = createMockClient();
      await refrescarResultadosAgregados(client);
      expect(client.rpc).toHaveBeenCalledWith('refrescar_resultados_agregados');
    });
  });
});

