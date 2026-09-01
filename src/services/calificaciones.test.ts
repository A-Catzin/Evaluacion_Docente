import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  obtenerCalificacionDocente,
  obtenerCalificacionesPorCuatrimestre,
  recalcularCalificacionDocente,
  recalcularCalificacionesCuatrimestre,
  refrescarResultadosAgregados,
} from "./calificaciones";
import { OBSERVATION_FIELDS } from "./scoring";

type Filter = { method: string; args: unknown[] };

class MockQueryBuilder {
  table: string;
  operation = "select";
  payload: unknown = null;
  options: unknown = null;
  filters: Filter[] = [];
  selectFields = "*";

  constructor(table: string) {
    this.table = table;
  }

  select(fields = "*") {
    this.selectFields = fields;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ method: "eq", args: [field, value] });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ method: "in", args: [field, values] });
    return this;
  }

  not(field: string, operator: string, value: unknown) {
    this.filters.push({ method: "not", args: [field, operator, value] });
    return this;
  }

  order(field: string, options?: { ascending: boolean }) {
    this.filters.push({ method: "order", args: [field, options] });
    return this;
  }

  limit(n: number) {
    this.filters.push({ method: "limit", args: [n] });
    return this;
  }

  insert(payload: unknown) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.operation = "upsert";
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

function matchFilters(
  builder: MockQueryBuilder,
  expected: Record<string, unknown>,
) {
  for (const [field, value] of Object.entries(expected)) {
    const found = builder.filters.some(
      (f) => f.method === "eq" && f.args[0] === field && f.args[1] === value,
    );
    if (!found) return false;
  }
  return true;
}

function resolveTable(builder: MockQueryBuilder) {
  const { table, operation } = builder;

  if (table === "docente_modalidad_historica" && operation === "select") {
    return { data: resolveSnapshot(builder), error: null };
  }

  if (table === "docentes" && operation === "select") {
    if (builder.selectFields.includes("id")) {
      return {
        data: [
          {
            id: 1,
            nombre: "Juan",
            apellidos: "Pérez",
            email: "juan@tecplayacar.edu.mx",
            campus: "Playa",
          },
        ],
        error: null,
      };
    }
    return { data: { modalidad: "Escolarizado" }, error: null };
  }

  if (table === "grupos" && operation === "select") {
    const ids = nextGrupos.length ? nextGrupos : [1];
    return {
      data: ids.map((id) => ({ docente_id: id })),
      error: null,
    };
  }

  if (table === "evaluacion_coordinacion" && operation === "select") {
    const ids = nextInstrumentos.evaluacion_coordinacion ?? [1];
    return {
      data: ids.map((id) => ({ docente_id: id, score_normalizado: 90 })),
      error: null,
    };
  }

  if (table === "planeaciones" && operation === "select") {
    const ids = nextInstrumentos.planeaciones ?? [1];
    return {
      data: ids.map((id) => ({ docente_id: id, puntaje_promedio: 70 })),
      error: null,
    };
  }

  if (table === "observaciones" && operation === "select") {
    const ids = nextInstrumentos.observaciones ?? [1];
    const obsRow = Object.fromEntries(
      OBSERVATION_FIELDS.map((field) => [field, 4]),
    );
    return {
      data: ids.map((id) => ({ docente_id: id, ...obsRow })),
      error: null,
    };
  }

  if (table === "autodiagnosticos" && operation === "select") {
    const ids = nextInstrumentos.autodiagnosticos ?? [1];
    return {
      data: ids.map((id) => ({ docente_id: id, puntaje_total: 120 })),
      error: null,
    };
  }

  if (table === "encuesta_estudiantil_respuestas" && operation === "select") {
    const ids = nextInstrumentos.encuesta_estudiantil_respuestas ?? [1];
    return {
      data: ids.map((id) => ({ docente_id: id })),
      error: null,
    };
  }

  if (table === "calificaciones_finales" && operation === "select") {
    return { data: resolveCalificacionFinal(builder), error: null };
  }

  return { data: null, error: null };
}

let capturedSnapshotCall: Record<string, unknown> | null = null;
let capturedUpsertPayload: Record<string, unknown> | null = null;
let nextSnapshot: Record<string, unknown> | null = null;
let nextCalificacionFinal: Record<string, unknown> | null = null;

type InstrumentTable =
  | "evaluacion_coordinacion"
  | "observaciones"
  | "planeaciones"
  | "autodiagnosticos"
  | "encuesta_estudiantil_respuestas";

let nextGrupos: number[] = [];
let nextInstrumentos: Partial<Record<InstrumentTable, number[]>> = {};
let nextUpsertErrorForDocenteId: number | null = null;

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
    (f) => f.method === "eq" && f.args[0] === "docente_id",
  );
  if (isSingle) return null;
  if (matchFilters(builder, { cuatrimestre_id: 10 })) {
    return [
      {
        id: 1,
        docente_id: 1,
        cuatrimestre_id: 10,
        modalidad_snapshot: "Escolarizado",
        score_encuesta_estudiantil: 80,
        score_coordinacion: 90,
        score_planeacion: 70,
        score_observacion: 80,
        score_autoevaluacion: 100,
        calificacion_final: 82,
        categoria_final: "Distinguido",
        num_instrumentos_completados: 5,
        num_instrumentos_esperados: 5,
        version_calculo: "v2.2-versioned-instruments",
        calculada_en: "2025-01-01T00:00:00Z",
      },
    ];
  }
  return null;
}

function createUpsertResponse(payload: Record<string, unknown>) {
  return {
    id: 42,
    docente_id: payload.docente_id,
    cuatrimestre_id: payload.cuatrimestre_id,
    modalidad_snapshot: payload.modalidad_snapshot,
    score_encuesta_estudiantil: payload.score_encuesta_estudiantil,
    score_coordinacion: payload.score_coordinacion,
    score_planeacion: payload.score_planeacion,
    score_observacion: payload.score_observacion,
    score_autoevaluacion: payload.score_autoevaluacion,
    calificacion_final: payload.calificacion_final,
    categoria_final: payload.categoria_final,
    num_instrumentos_completados: payload.num_instrumentos_completados,
    num_instrumentos_esperados: payload.num_instrumentos_esperados,
    version_calculo: payload.version_calculo,
    calculada_en: payload.calculada_en,
  };
}

function createMockClient(): SupabaseClient {
  return {
    from: vi.fn((table: string) => new MockQueryBuilder(table)),
    rpc: vi.fn((fn: string, params: Record<string, unknown>) => {
      if (fn === "obtener_scores_encuesta_estudiantil_nativa") {
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
      if (fn === "refrescar_resultados_agregados") {
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === "tomar_snapshot_modalidad") {
        capturedSnapshotCall = params;
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === "upsert_calificacion_final") {
        const payload = params.p_payload as Record<string, unknown>;
        capturedUpsertPayload = payload;
        if (
          nextUpsertErrorForDocenteId != null &&
          payload.docente_id === nextUpsertErrorForDocenteId
        ) {
          return Promise.resolve({
            data: null,
            error: { message: "Upsert simulado fallido", code: "99999" },
          });
        }
        return Promise.resolve({
          data: createUpsertResponse(payload),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  } as unknown as SupabaseClient;
}

describe("calificaciones", () => {
  beforeEach(() => {
    capturedSnapshotCall = null;
    capturedUpsertPayload = null;
    nextSnapshot = null;
    nextCalificacionFinal = null;
    nextGrupos = [];
    nextInstrumentos = {};
    nextUpsertErrorForDocenteId = null;
  });

  describe("recalcularCalificacionDocente", () => {
    it("toma snapshot del docente si no existe histórico, calcula y persiste vía upsert", async () => {
      const client = createMockClient();
      const result = await recalcularCalificacionDocente(client, 1, 10);

      expect(result.docente_id).toBe(1);
      expect(result.cuatrimestre_id).toBe(10);
      expect(result.modalidad_snapshot).toBe("Escolarizado");
      expect(result.num_instrumentos_esperados).toBe(5);
      expect(result.version_calculo).toBe("v2.2-versioned-instruments");
      expect(result.calificacion_final).toBe(
        Math.round(80 * 0.35 + 90 * 0.2 + 70 * 0.15 + 80 * 0.25 + 100 * 0.05),
      );
      expect(result.categoria_final).toBe("Distinguido");

      expect(capturedSnapshotCall).toMatchObject({
        p_docente_id: 1,
        p_cuatrimestre_id: 10,
        p_modalidad: "Escolarizado",
        p_fuente: "primer_score",
      });

      expect(capturedUpsertPayload).toMatchObject({
        docente_id: 1,
        cuatrimestre_id: 10,
        modalidad_snapshot: "Escolarizado",
        score_encuesta_estudiantil: 80,
        score_coordinacion: 90,
        score_planeacion: 70,
        score_observacion: 80,
        score_autoevaluacion: 100,
        num_instrumentos_completados: 5,
        num_instrumentos_esperados: 5,
        version_calculo: "v2.2-versioned-instruments",
      });
    });

    it("usa el snapshot histórico cuando ya existe", async () => {
      nextSnapshot = {
        modalidad_snapshot: "Ejecutivo / Inglés",
      };
      const client = createMockClient();
      const result = await recalcularCalificacionDocente(client, 1, 10);

      expect(result.modalidad_snapshot).toBe("Ejecutivo / Inglés");
      expect(result.num_instrumentos_esperados).toBe(4);
      expect(result.num_instrumentos_completados).toBe(4);
      expect(capturedSnapshotCall).toBeNull();
    });
  });

  describe("obtenerCalificacionDocente", () => {
    it("lee y mapea la fila existente de calificaciones_finales", async () => {
      nextCalificacionFinal = {
        id: 7,
        docente_id: 2,
        cuatrimestre_id: 20,
        modalidad_snapshot: "Escolarizado",
        score_encuesta_estudiantil: 75,
        score_coordinacion: 80,
        score_planeacion: null,
        score_observacion: 90,
        score_autoevaluacion: 85,
        calificacion_final: 82,
        categoria_final: "Distinguido",
        num_instrumentos_completados: 4,
        num_instrumentos_esperados: 5,
        version_calculo: "v2.1",
        calculada_en: "2025-02-01T12:00:00Z",
      };
      const client = createMockClient();
      const result = await obtenerCalificacionDocente(client, 2, 20);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(7);
      expect(result?.score_planeacion).toBeNull();
      expect(result?.calificacion_final).toBe(82);
      expect(result?.calculada_en).toBe("2025-02-01T12:00:00Z");
    });

    it("calcula inline cuando no hay fila precalculada", async () => {
      const client = createMockClient();
      const result = await obtenerCalificacionDocente(client, 1, 10);

      expect(result).not.toBeNull();
      expect(result?.docente_id).toBe(1);
      expect(result?.cuatrimestre_id).toBe(10);
      expect(result?.version_calculo).toBe("v2.2-versioned-instruments-inline");
    });
  });

  describe("obtenerCalificacionesPorCuatrimestre", () => {
    it("devuelve las calificaciones del cuatrimestre mapeadas", async () => {
      const client = createMockClient();
      const results = await obtenerCalificacionesPorCuatrimestre(client, 10);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        docente_id: 1,
        cuatrimestre_id: 10,
        calificacion_final: 82,
        categoria_final: "Distinguido",
      });
    });
  });

  describe("refrescarResultadosAgregados", () => {
    it("llama a la RPC correspondiente", async () => {
      const client = createMockClient();
      await refrescarResultadosAgregados(client);
      expect(client.rpc).toHaveBeenCalledWith("refrescar_resultados_agregados");
    });
  });

  describe("recalcularCalificacionesCuatrimestre", () => {
    it("recalcula todos los docentes con grupos cuando soloDocentesConInstrumentos es false", async () => {
      nextGrupos = [10, 20, 30];
      const client = createMockClient();
      const result = await recalcularCalificacionesCuatrimestre(client, 10, {
        refrescarAgregados: false,
        soloDocentesConInstrumentos: false,
      });

      expect(result.recalculados).toBe(3);
      expect(result.errores).toBe(0);
      expect(client.rpc).not.toHaveBeenCalledWith(
        "refrescar_resultados_agregados",
      );
    });

    it("solo recalcula docentes con instrumentos cuando soloDocentesConInstrumentos es true", async () => {
      nextGrupos = [10, 20, 30];
      nextInstrumentos = {
        evaluacion_coordinacion: [20],
        observaciones: [30],
        planeaciones: [],
        autodiagnosticos: [],
        encuesta_estudiantil_respuestas: [],
      };
      const client = createMockClient();
      const result = await recalcularCalificacionesCuatrimestre(client, 10, {
        refrescarAgregados: false,
        soloDocentesConInstrumentos: true,
      });

      expect(result.recalculados).toBe(2);
      expect(result.errores).toBe(0);
    });

    it("maneja errores individuales sin detener el batch", async () => {
      nextGrupos = [10, 20, 30];
      nextUpsertErrorForDocenteId = 20;
      const client = createMockClient();
      const result = await recalcularCalificacionesCuatrimestre(client, 10);

      expect(result.recalculados).toBe(2);
      expect(result.errores).toBe(1);
    });

    it("refresca resultados agregados cuando refrescarAgregados es true", async () => {
      nextGrupos = [10];
      const client = createMockClient();
      const result = await recalcularCalificacionesCuatrimestre(client, 10, {
        refrescarAgregados: true,
      });

      expect(result.recalculados).toBe(1);
      expect(client.rpc).toHaveBeenCalledWith("refrescar_resultados_agregados");
    });
  });
});
