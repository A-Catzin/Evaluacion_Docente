import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  fetchBatchScoresPorDocente,
  fetchCuatrimestreScores,
  fetchSubjectAwareCuatrimestreScores,
} from "./scoring";

function resolvedQuery(data: unknown) {
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    in: () => query,
    limit: () => query,
    then: (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data, error: null }).then(onFulfilled, onRejected),
  };
  return query;
}

function createSubjectScopedScoresClient(
  observationCaptures: Array<{
    docente_id: number;
    purpose: "observation";
    validity_status: string;
    normalized_score: number | null;
    submitted_at: string;
    version_id?: string;
  }> = [
    {
      docente_id: 1,
      purpose: "observation",
      validity_status: "valid",
      normalized_score: 65,
      submitted_at: "2025-01-02T00:00:00Z",
    },
  ],
): SupabaseClient {
  const assignments = [
    {
      id: 1,
      clave: "1A",
      asignatura_id: 10,
      modalidad: "Escolarizado",
      asignaturas: { nombre: "Álgebra" },
    },
    {
      id: 2,
      clave: "1B",
      asignatura_id: 11,
      modalidad: "Escolarizado",
      asignaturas: { nombre: "Física" },
    },
    {
      id: 3,
      clave: "1C",
      asignatura_id: 12,
      modalidad: "Escolarizado",
      asignaturas: { nombre: "Química" },
    },
  ];
  const plans = [
    {
      asignatura_id: 10,
      puntaje_promedio: 80,
      estado: "Aprobado",
      asignaturas: { nombre: "Álgebra" },
    },
  ];
  const coordination = [
    { id: 2, asignatura_id: 11, score_normalizado: 90 },
    { id: 1, asignatura_id: 10, score_normalizado: 70 },
  ];
  const observations = [
    { id: 2, asignatura_id: 11, cco1: 3 },
    { id: 1, asignatura_id: 10, cco1: 5 },
  ];

  return {
    from: (table: string) =>
      resolvedQuery(
        table === "grupos"
          ? assignments
          : table === "planeaciones"
            ? plans
            : table === "planning_subject_np"
              ? [
                  { subject_key: "fisica", estado: "NP" },
                  { subject_key: "quimica", estado: "NP" },
                ]
              : table === "evaluacion_coordinacion"
                ? coordination
                : table === "observaciones"
                  ? observations
                  : table === "autodiagnosticos"
                    ? [{ puntaje_total: 120 }]
                    : [],
      ),
    rpc: (fn: string) =>
      Promise.resolve(
        fn === "obtener_scores_encuesta_estudiantil_nativa"
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
                {
                  docente_id: 1,
                  purpose: "coordination",
                  validity_status: "valid",
                  normalized_score: 75,
                  submitted_at: "2025-01-02T00:00:00Z",
                },
                ...observationCaptures,
              ],
              error: null,
            },
      ),
  } as unknown as SupabaseClient;
}

describe("scoring", () => {
  describe("calcObservationScore", () => {
    it("calcula el promedio normalizado a 5 y redondea", () => {
      const row = { cco1: 5, cco2: 5, cco3: 4, cco4: 4, cco5: 3 };
      expect(calcObservationScore(row)).toBe(84);
    });

    it("ignora valores nulos, indefinidos o cero", () => {
      const row = { cco1: 5, cco2: null, cco3: undefined, cco4: 0, cco5: 5 };
      expect(calcObservationScore(row)).toBe(100);
    });

    it("devuelve 0 cuando no hay respuestas", () => {
      expect(calcObservationScore({})).toBe(0);
    });

    it("devuelve 100 cuando todas son 5", () => {
      const row = Object.fromEntries(
        OBSERVATION_FIELDS.map((field) => [field, 5]),
      );
      expect(calcObservationScore(row)).toBe(100);
    });
  });

  describe("normalizarModalidad", () => {
    it("normaliza mayúsculas, acentos y espacios", () => {
      expect(normalizarModalidad("  Ejecutivo / Inglés ")).toBe(
        "ejecutivo / ingles",
      );
      expect(normalizarModalidad("EJECUTIVO")).toBe("ejecutivo");
      expect(normalizarModalidad("inglés")).toBe("ingles");
    });

    it("maneja valores nulos", () => {
      expect(normalizarModalidad(null)).toBe("");
      expect(normalizarModalidad(undefined)).toBe("");
    });
  });

  describe("obtenerPerfilModalidad", () => {
    it("usa pesos normales por defecto", () => {
      const profile = obtenerPerfilModalidad("escolarizado");
      expect(profile.weights).toEqual(WEIGHTS);
      expect(profile.expectedInstrumentCount).toBe(5);
    });

    it("detecta modalidad ejecutiva", () => {
      const profile = obtenerPerfilModalidad("ejecutivo");
      expect(profile.weights.plan).toBe(0);
      expect(profile.weights.obs).toBe(0.3);
      expect(profile.expectedInstrumentCount).toBe(4);
    });

    it("detecta modalidad en inglés como ejecutiva", () => {
      const profile = obtenerPerfilModalidad("Inglés");
      expect(profile.weights.plan).toBe(0);
      expect(profile.expectedInstrumentCount).toBe(4);
    });
  });

  describe("calcFinalScore", () => {
    it("calcula score final con todos los instrumentos", () => {
      const scores: InstrumentScores = {
        ee: 80,
        coord: 90,
        plan: 70,
        obs: 85,
        auto: 100,
      };
      const result = calcFinalScore(scores);
      expect(result.instrumentCount).toBe(5);
      expect(result.expectedInstrumentCount).toBe(5);
      expect(result.final).toBe(82.75);
    });

    it("score 100 con todos los instrumentos al máximo", () => {
      const scores: InstrumentScores = {
        ee: 100,
        coord: 100,
        plan: 100,
        obs: 100,
        auto: 100,
      };
      expect(calcFinalScore(scores)).toMatchObject({
        final: 100,
        instrumentCount: 5,
        expectedInstrumentCount: 5,
        category: "Sobresaliente",
      });
    });

    it("score 0 con todos los instrumentos al mínimo", () => {
      const scores: InstrumentScores = {
        ee: 0,
        coord: 0,
        plan: 0,
        obs: 0,
        auto: 0,
      };
      expect(calcFinalScore(scores)).toMatchObject({
        final: 0,
        instrumentCount: 5,
        category: "Insuficiente",
      });
    });

    it("ejecutivo/inglés excluye planeación y repesa correctamente", () => {
      const scores: InstrumentScores = {
        ee: 80,
        coord: 90,
        obs: 85,
        auto: 100,
      };
      const result = calcFinalScore(scores, "ejecutivo");
      expect(result.instrumentCount).toBe(4);
      expect(result.expectedInstrumentCount).toBe(4);
      expect(result.final).toBe(85);
    });

    it("keeps fixed normal weights for incomplete evaluations", () => {
      const result = calcFinalScore({ ee: 80, auto: 100 });
      expect(result).toMatchObject({
        final: 33,
        instrumentCount: 2,
        expectedInstrumentCount: 5,
        category: "Parcial",
      });
    });

    it("keeps two decimal places instead of integer-rounding final scores", () => {
      expect(calcFinalScore({ ee: 26.94 })).toMatchObject({
        final: 9.43,
        category: "Parcial",
      });
    });

    it("marca no iniciado cuando no hay instrumentos", () => {
      const result = calcFinalScore({});
      expect(result.final).toBe(0);
      expect(result.category).toBe("No iniciado");
    });
  });

  describe("subject-aware planning NP scores", () => {
    const base = { ee: 90, coord: 90, obs: 90, auto: 90, invalidPurposes: [] };

    it("uses latest versioned observation across codes once for every subject and aggregate", async () => {
      const result = await fetchSubjectAwareCuatrimestreScores(
        createSubjectScopedScoresClient(),
        1,
        1,
        "Escolarizado",
      );
      const byKey = new Map(
        result.subjects.map((subject) => [subject.key, subject]),
      );

      expect(byKey.get("algebra")).toMatchObject({
        coord: 70,
        obs: 65,
        planningStatus: "approved",
      });
      expect(byKey.get("fisica")).toMatchObject({
        coord: 90,
        obs: 65,
        planningStatus: "np",
      });
      expect(byKey.get("quimica")).toMatchObject({
        coord: 75,
        obs: 65,
        planningStatus: "np",
      });
      expect(result.aggregate.obs).toBe(65);
      expect(result.final.final).toBe(79.75);
    });

    it("uses the later capture across observation codes, not an average or scoped legacy", async () => {
      const client = createSubjectScopedScoresClient([
        { docente_id: 1, purpose: "observation", version_id: "clinical", validity_status: "valid", normalized_score: 92, submitted_at: "2025-01-01T00:00:00Z" },
        { docente_id: 1, purpose: "observation", version_id: "simulation", validity_status: "valid", normalized_score: 65, submitted_at: "2025-01-03T00:00:00Z" },
      ]);
      const [subjectAware, scalar, batch] = await Promise.all([
        fetchSubjectAwareCuatrimestreScores(client, 1, 1, "Escolarizado"),
        fetchCuatrimestreScores(client, 1, 1),
        fetchBatchScoresPorDocente(client, [1], 1),
      ]);
      expect(subjectAware.subjects.map((subject) => subject.obs)).toEqual([65, 65, 65]);
      expect(subjectAware.aggregate.obs).toBe(65);
      expect(subjectAware.final.final).toBe(79.75);
      expect(scalar.obs).toBe(65);
      expect(batch.get(1)?.obs).toBe(65);
    });

    it("suppresses older valid and legacy observation when latest capture is invalid", async () => {
      const client = createSubjectScopedScoresClient([
        { docente_id: 1, purpose: "observation", version_id: "clinical", validity_status: "valid", normalized_score: 92, submitted_at: "2025-01-01T00:00:00Z" },
        { docente_id: 1, purpose: "observation", version_id: "simulation", validity_status: "invalid_excessive_na", normalized_score: null, submitted_at: "2025-01-03T00:00:00Z" },
      ]);
      const [subjectAware, scalar, batch] = await Promise.all([
        fetchSubjectAwareCuatrimestreScores(client, 1, 1, "Escolarizado"),
        fetchCuatrimestreScores(client, 1, 1),
        fetchBatchScoresPorDocente(client, [1], 1),
      ]);
      expect(subjectAware.subjects.map((subject) => subject.obs)).toEqual([undefined, undefined, undefined]);
      expect(subjectAware.aggregate.obs).toBeUndefined();
      expect(subjectAware.final).toMatchObject({ final: 63.5, category: "Parcial con instrumento inválido" });
      expect(scalar.obs).toBeUndefined();
      expect(batch.get(1)?.obs).toBeUndefined();
    });

    it("preserves subject-scoped legacy observation only when no versioned capture exists", async () => {
      const result = await fetchSubjectAwareCuatrimestreScores(
        createSubjectScopedScoresClient([]), 1, 1, "Escolarizado",
      );
      expect(result.subjects.map((subject) => subject.obs)).toEqual([100, 60, undefined]);
    });

    it("keeps an approved Escolarizado subject on normal weights despite a mixed teacher snapshot", async () => {
      const result = await fetchSubjectAwareCuatrimestreScores(
        createSubjectScopedScoresClient(),
        1,
        1,
        "Escolarizado, Ejecutivo",
      );
      const algebra = result.subjects.find(
        (subject) => subject.key === "algebra",
      );
      expect(algebra?.final).toMatchObject({
        final: 78.75,
        expectedInstrumentCount: 5,
      });
    });

    it("keeps a planned-only subject on all five normal weights", () => {
      const result = calculateSubjectAwareFinal([
        {
          ...base,
          key: "algebra",
          nombre: "Álgebra",
          grupos: ["1A"],
          planningStatus: "approved",
          plan: 90,
        },
      ]);
      expect(result.final).toMatchObject({
        final: 90,
        category: "Sobresaliente",
        expectedInstrumentCount: 5,
      });
      expect(result.aggregate.plan).toBe(90);
    });

    it("uses the redistributed NP weights and stores no planning score", () => {
      const result = calculateSubjectAwareFinal([
        {
          ee: 80,
          coord: 90,
          obs: 85,
          auto: 100,
          invalidPurposes: [],
          key: "fisica",
          nombre: "Física",
          grupos: ["1A"],
          planningStatus: "np",
          plan: undefined,
        },
      ]);
      expect(result.final).toMatchObject({
        final: 85,
        category: "Distinguido",
        expectedInstrumentCount: 4,
      });
      expect(result.aggregate.plan).toBeUndefined();
    });

    it("uses the subject modality instead of a mixed teacher snapshot", () => {
      const result = calculateSubjectAwareFinal(
        [
          {
            ee: undefined,
            coord: undefined,
            plan: 100,
            obs: undefined,
            auto: 100,
            invalidPurposes: [],
            key: "algebra",
            nombre: "Álgebra",
            grupos: ["1A"],
            modalidad: "Escolarizado",
            planningStatus: "approved",
          },
        ],
        "Escolarizado, Ejecutivo",
      );
      expect(result.final).toMatchObject({
        final: 20,
        instrumentCount: 2,
        expectedInstrumentCount: 5,
        category: "Parcial",
      });
    });

    it("uses one teacher-cycle aggregate instead of averaging subject finals", () => {
      const result = calculateSubjectAwareFinal([
        {
          key: "juicio-de-amparo",
          nombre: "JUICIO DE AMPARO",
          grupos: ["11A"],
          planningStatus: "approved",
          plan: 100,
        },
        ...["Civil", "Penal", "Mercantil", "Fiscal", "Laboral"].map(
          (nombre, index) => ({
            key: `np-${index}`,
            nombre,
            grupos: [`11${index}`],
            planningStatus: "np" as const,
          }),
        ),
      ]);
      expect(result.final).toMatchObject({
        final: 15,
        instrumentCount: 1,
        expectedInstrumentCount: 5,
        category: "Parcial",
      });
      expect(result.aggregate.plan).toBe(100);
    });

    it("averages only approved planning subjects and does not dilute them with NP", () => {
      const result = calculateSubjectAwareFinal([
        {
          ee: 80,
          coord: 90,
          obs: 85,
          auto: 100,
          key: "algebra",
          nombre: "Álgebra",
          grupos: ["1A"],
          planningStatus: "approved",
          plan: 90,
        },
        {
          ee: 100,
          coord: 100,
          obs: 100,
          auto: 100,
          key: "fisica",
          nombre: "Física",
          grupos: ["1B"],
          planningStatus: "np",
        },
      ]);
      expect(result.aggregate.plan).toBe(90);
      expect(result.final).toMatchObject({
        final: 85.75,
        expectedInstrumentCount: 5,
      });
    });

    it("averages a scored plan with a missing non-NP plan as zero", () => {
      const result = calculateSubjectAwareFinal([
        {
          key: "algebra",
          nombre: "Álgebra",
          grupos: ["1A"],
          planningStatus: "approved",
          plan: 79,
        },
        {
          key: "fisica",
          nombre: "Física",
          grupos: ["1B"],
          planningStatus: "pending",
        },
      ]);

      expect(result.aggregate.plan).toBe(39.5);
    });

    it("excludes NP subjects while counting missing non-NP planning as zero", () => {
      const result = calculateSubjectAwareFinal([
        {
          key: "algebra",
          nombre: "Álgebra",
          grupos: ["1A"],
          planningStatus: "approved",
          plan: 96,
        },
        {
          key: "fisica",
          nombre: "Física",
          grupos: ["1B"],
          planningStatus: "pending",
        },
        ...["Química", "Biología", "Historia"].map((nombre, index) => ({
          key: `np-${index}`,
          nombre,
          grupos: [`1${index + 2}`],
          planningStatus: "np" as const,
        })),
      ]);

      expect(result.aggregate.plan).toBe(48);
    });

    it("averages multiple approved plans without diluting them with NP", () => {
      const result = calculateSubjectAwareFinal([
        ...["Álgebra", "Física"].map((nombre, index) => ({
          key: `approved-${index}`,
          nombre,
          grupos: [`1${index}`],
          planningStatus: "approved" as const,
          plan: 96,
        })),
        ...["Química", "Biología", "Historia"].map((nombre, index) => ({
          key: `np-${index}`,
          nombre,
          grupos: [`2${index}`],
          planningStatus: "np" as const,
        })),
      ]);

      expect(result.aggregate.plan).toBe(96);
    });

    it("leaves the planning aggregate undefined when every subject is NP", () => {
      const result = calculateSubjectAwareFinal(
        ["Física", "Química"].map((nombre, index) => ({
          key: `np-${index}`,
          nombre,
          grupos: [`1${index}`],
          planningStatus: "np" as const,
        })),
      );

      expect(result.aggregate.plan).toBeUndefined();
    });

    it("does not treat a pending executive plan score as an approved normal plan", () => {
      const result = calculateSubjectAwareFinal(
        [
          {
            ee: 80,
            coord: 90,
            obs: 85,
            auto: 100,
            key: "fisica",
            nombre: "Física",
            grupos: ["1A"],
            modalidad: "Ejecutivo",
            planningStatus: "pending",
          },
        ],
        "Escolarizado",
      );

      expect(result.aggregate.plan).toBe(0);
      expect(result.final).toMatchObject({
        final: 85,
        instrumentCount: 4,
        expectedInstrumentCount: 4,
      });
    });

    it("uses normal weights when pending planning coexists with an NP subject", () => {
      const result = calculateSubjectAwareFinal([
        {
          ee: 80,
          key: "fisica",
          nombre: "Física",
          grupos: ["1A"],
          modalidad: "Escolarizado",
          planningStatus: "pending",
        },
        {
          key: "historia",
          nombre: "Historia",
          grupos: ["1B"],
          modalidad: "Ejecutivo",
          planningStatus: "np",
        },
      ]);

      expect(result.aggregate.plan).toBe(0);
      expect(result.final).toMatchObject({
        final: 28,
        instrumentCount: 1,
        expectedInstrumentCount: 5,
      });
    });

    it("retains two decimal places in the teacher-cycle final", () => {
      const result = calculateSubjectAwareFinal([
        {
          ee: 26.94,
          key: "algebra",
          nombre: "Álgebra",
          grupos: ["1A"],
          planningStatus: "pending",
        },
        {
          ee: 26.96,
          key: "fisica",
          nombre: "Física",
          grupos: ["1B"],
          planningStatus: "pending",
        },
      ]);
      expect(result.subjects.map((subject) => subject.final.final)).toEqual([
        9.43, 9.44,
      ]);
      expect(result.final.final).toBe(9.43);
    });

    it("uses 40/25/30/5 when all planning is NP", () => {
      const result = calculateSubjectAwareFinal([
        {
          ee: 80,
          coord: 90,
          obs: 85,
          auto: 100,
          key: "fisica",
          nombre: "Física",
          grupos: ["1A"],
          planningStatus: "np",
        },
      ]);
      expect(result.final).toMatchObject({
        final: 85,
        instrumentCount: 4,
        expectedInstrumentCount: 4,
        category: "Distinguido",
      });
    });

    it("keeps normal weights for an approved plan with autoevaluation only", () => {
      const result = calculateSubjectAwareFinal([
        {
          plan: 96,
          auto: 100,
          key: "literatura",
          nombre: "Literatura",
          grupos: ["1A"],
          planningStatus: "approved",
        },
      ]);
      expect(result.final).toMatchObject({
        final: 19.4,
        instrumentCount: 2,
        expectedInstrumentCount: 5,
        category: "Parcial",
      });
    });

    it("does not silently convert a pending subject to NP", () => {
      const result = calculateSubjectAwareFinal([
        {
          ...base,
          key: "quimica",
          nombre: "Química",
          grupos: ["1A"],
          planningStatus: "pending",
          plan: undefined,
        },
      ]);
      expect(result.aggregate.plan).toBe(0);
      expect(result.final).toMatchObject({
        final: 76.5,
        category: "Parcial",
        instrumentCount: 4,
        expectedInstrumentCount: 5,
      });
    });

    it("does not let a mixed teacher snapshot override a pending Escolarizado assignment", () => {
      const result = calculateSubjectAwareFinal(
        [
          {
            ee: 80,
            key: "quimica",
            nombre: "Química",
            grupos: ["1A"],
            modalidad: "Escolarizado",
            planningStatus: "pending",
          },
        ],
        "Escolarizado, Ejecutivo",
      );
      expect(result.final).toMatchObject({
        final: 28,
        instrumentCount: 1,
        expectedInstrumentCount: 5,
        category: "Parcial",
      });
    });
  });

  describe("getCategory", () => {
    it("clasifica correctamente con todos los instrumentos", () => {
      expect(getCategory(95, 5)).toBe("Sobresaliente");
      expect(getCategory(85, 5)).toBe("Distinguido");
      expect(getCategory(75, 5)).toBe("Bueno");
      expect(getCategory(65, 5)).toBe("Aprobado");
      expect(getCategory(55, 5)).toBe("A mejorar");
      expect(getCategory(45, 5)).toBe("Insuficiente");
    });

    it("clasifica parcial cuando faltan instrumentos", () => {
      expect(getCategory(85, 3, 5)).toBe("Parcial");
    });
  });

  describe("formatScore", () => {
    it("formatea con separador decimal local", () => {
      const formatter = new Intl.NumberFormat("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      expect(formatScore(85.5)).toBe(formatter.format(85.5));
      expect(formatScore(0)).toBe(formatter.format(0));
      expect(formatScore(9.43)).toBe(formatter.format(9.43));
    });

    it("devuelve guión para valores nulos", () => {
      expect(formatScore(null)).toBe("—");
      expect(formatScore(undefined)).toBe("—");
    });
  });

  describe("formatScoreCsv", () => {
    it("formatea a dos decimales", () => {
      expect(formatScoreCsv(85.5)).toBe("85.50");
      expect(formatScoreCsv(9.43)).toBe("9.43");
      expect(formatScoreCsv(null)).toBe("—");
    });
  });

  describe("aggregateNativeScoresByTeacher", () => {
    it("promedia ponderado por cantidad de respuestas válidas", () => {
      const rows: NativeStudentEvaluationScore[] = [
        {
          docente_id: 1,
          asignatura_id: 10,
          grupo_id: 100,
          cuatrimestre_id: 1,
          respuestas_validas: 10,
          score_normalizado: 80,
          version_calculo: "native-19-v2",
        },
        {
          docente_id: 1,
          asignatura_id: 11,
          grupo_id: 101,
          cuatrimestre_id: 1,
          respuestas_validas: 20,
          score_normalizado: 90,
          version_calculo: "native-19-v2",
        },
      ];
      const map = aggregateNativeScoresByTeacher(rows);
      expect(map.get(1)).toBe((10 * 80 + 20 * 90) / 30);
    });

    it("ignora respuestas inválidas", () => {
      const rows: NativeStudentEvaluationScore[] = [
        {
          docente_id: 2,
          asignatura_id: 10,
          grupo_id: 100,
          cuatrimestre_id: 1,
          respuestas_validas: 0,
          score_normalizado: 80,
          version_calculo: "native-19-v2",
        },
      ];
      expect(aggregateNativeScoresByTeacher(rows).has(2)).toBe(false);
    });
  });

  describe("aggregateNativeScoresByTeacherAndSubject", () => {
    it("agrupa por docente y asignatura", () => {
      const rows: NativeStudentEvaluationScore[] = [
        {
          docente_id: 1,
          asignatura_id: 10,
          grupo_id: 100,
          cuatrimestre_id: 1,
          respuestas_validas: 5,
          score_normalizado: 80,
          version_calculo: "native-19-v2",
        },
        {
          docente_id: 1,
          asignatura_id: 10,
          grupo_id: 101,
          cuatrimestre_id: 1,
          respuestas_validas: 15,
          score_normalizado: 90,
          version_calculo: "native-19-v2",
        },
        {
          docente_id: 1,
          asignatura_id: 11,
          grupo_id: 102,
          cuatrimestre_id: 1,
          respuestas_validas: 10,
          score_normalizado: 70,
          version_calculo: "native-19-v2",
        },
      ];
      const map = aggregateNativeScoresByTeacherAndSubject(rows);
      expect(map.get(1)?.get(10)).toBe((5 * 80 + 15 * 90) / 20);
      expect(map.get(1)?.get(11)).toBe(70);
    });
  });
});
