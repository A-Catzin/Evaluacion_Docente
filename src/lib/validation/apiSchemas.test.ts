import { describe, expect, it } from "vitest";
import {
  VersionedInstrumentSubmissionSchema,
  EstudianteEvaluacionSchema,
  Cd07EvaluacionSchema,
} from "./apiSchemas";
import { SaveDraftSchema } from "../../pages/api/instrumentos/draft";

describe("EstudianteEvaluacionSchema", () => {
  it("accepts exactly nineteen integer answers from one through five", () => {
    expect(
      EstudianteEvaluacionSchema.safeParse({
        grupo_id: 1,
        respuestas: Array.from({ length: 19 }, () => 5),
      }).success,
    ).toBe(true);
  });

  it("rejects legacy scale values and incomplete answers", () => {
    expect(
      EstudianteEvaluacionSchema.safeParse({
        grupo_id: 1,
        respuestas: [6, ...Array.from({ length: 18 }, () => 5)],
      }).success,
    ).toBe(false);
    expect(
      EstudianteEvaluacionSchema.safeParse({
        grupo_id: 1,
        respuestas: Array.from({ length: 18 }, () => 5),
      }).success,
    ).toBe(false);
  });
});

describe("detached CD-07 payload", () => {
  const valid = {
    grupo_id: 1,
    instrument_code: "SED-360-INST-EST-CD-07-V1.1",
    assignment_revision: "revision-1",
    respuestas: Array.from({ length: 20 }, () => 5),
  };

  it("requires the exact instrument identity and a bounded nonblank opaque revision", () => {
    expect(Cd07EvaluacionSchema.safeParse(valid).success).toBe(true);
    for (const payload of [
      { ...valid, instrument_code: undefined },
      { ...valid, instrument_code: "SED-360-INST-EST-CD-07-V1.0" },
      { ...valid, instrument_code: "SED-360-INST-EST-CD-07-V1.1", instrument_version: "V1.1" },
      { ...valid, assignment_revision: undefined },
      { ...valid, assignment_revision: "  " },
      { ...valid, assignment_revision: "x".repeat(121) },
    ]) expect(Cd07EvaluacionSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts an opaque revision at its boundary without granting any extra identity field", () => {
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, assignment_revision: "x".repeat(120) }).success).toBe(true);
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, assignment_revision: "rev:opaque / 1" }).success).toBe(true);
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, cuatrimestre_id: 11 }).success).toBe(false);
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, respuestas: valid.respuestas.slice(1) }).success).toBe(false);
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, respuestas: ["N/A", ...valid.respuestas.slice(1)] }).success).toBe(false);
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, comentario: "x".repeat(2001) }).success).toBe(false);
    expect(EstudianteEvaluacionSchema.safeParse({ grupo_id: 1, respuestas: valid.respuestas.slice(1) }).success).toBe(true);
  });

      it("accepts twenty numeric answers and an optional comment", () => {
    expect(Cd07EvaluacionSchema.safeParse(valid).success).toBe(true);
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, comentario: null }).success).toBe(true);
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, comentario: "x".repeat(2000) }).success).toBe(true);
    expect(Cd07EvaluacionSchema.safeParse({ ...valid, comentario: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects missing, surplus, noninteger, out-of-range and N/A answers", () => {
    for (const answers of [
      valid.respuestas.slice(1), [...valid.respuestas, 5],
      [0, ...valid.respuestas.slice(1)], [6, ...valid.respuestas.slice(1)],
      [1.5, ...valid.respuestas.slice(1)],
      ...["N/A", "na", "", "5", null, { value: 5, na_reason: "reason" }]
        .map((answer) => [answer, ...valid.respuestas.slice(1)]),
    ]) {
      expect(Cd07EvaluacionSchema.safeParse({ ...valid, respuestas: answers }).success).toBe(false);
    }
  });

  it("rejects extra fields, na_reason and non-text comments", () => {
    for (const payload of [
      { ...valid, na_reason: "reason" },
      { ...valid, student_id: 1 },
      { ...valid, comentario: 42 },
    ]) expect(Cd07EvaluacionSchema.safeParse(payload).success).toBe(false);
  });

  it("keeps the general 19-answer validator active independently", () => {
    const general = { grupo_id: 1, respuestas: valid.respuestas.slice(0, 19), comentario: null };
    expect(EstudianteEvaluacionSchema.safeParse(general).success).toBe(true);
    expect(EstudianteEvaluacionSchema.safeParse(valid).success).toBe(false);
    expect(Cd07EvaluacionSchema.safeParse(general).success).toBe(false);
  });
});

describe("Versioned observation text limits", () => {
  const itemId = "00000000-0000-4000-8000-000000000001";
  const sectionId = "00000000-0000-4000-8000-000000000002";
  const baseSubmission = {
    version_id: "00000000-0000-4000-8000-000000000003",
    docente_id: 1,
    cuatrimestre_id: 11,
    answers: [
      { item_id: itemId, value: "na" as const, na_reason: "x".repeat(2000) },
    ],
    evidence: [{ section_id: sectionId, evidence: "x".repeat(2000) }],
    metadata: { strengths: "x".repeat(2000) },
  };

  it("accepts the API maximums for final submissions", () => {
    expect(
      VersionedInstrumentSubmissionSchema.safeParse(baseSubmission).success,
    ).toBe(true);
  });

  it("rejects text beyond the API maximums for final submissions", () => {
    expect(
      VersionedInstrumentSubmissionSchema.safeParse({
        ...baseSubmission,
        answers: [
          { ...baseSubmission.answers[0], na_reason: "x".repeat(2001) },
        ],
      }).success,
    ).toBe(false);
    expect(
      VersionedInstrumentSubmissionSchema.safeParse({
        ...baseSubmission,
        evidence: [{ section_id: sectionId, evidence: "x".repeat(2001) }],
      }).success,
    ).toBe(false);
    expect(
      VersionedInstrumentSubmissionSchema.safeParse({
        ...baseSubmission,
        metadata: { strengths: "x".repeat(2001) },
      }).success,
    ).toBe(false);
  });

  it("accepts a partial draft at the same text limits", () => {
    expect(
      SaveDraftSchema.safeParse({
        docente_id: 1,
        cuatrimestre_id: 11,
        version_id: baseSubmission.version_id,
        draft: {
          answers: baseSubmission.answers,
          evidence: baseSubmission.evidence,
          metadata: baseSubmission.metadata,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects over-limit draft text before the RPC", () => {
    expect(
      SaveDraftSchema.safeParse({
        docente_id: 1,
        cuatrimestre_id: 11,
        version_id: baseSubmission.version_id,
        draft: {
          evidence: [{ section_id: sectionId, evidence: "x".repeat(2001) }],
        },
      }).success,
    ).toBe(false);
  });
});
