import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeAcademicOfferGroup,
  parseAcademicOfferCsv,
  planAcademicOfferImport,
} from "./academicOfferImport";

const group = {
  id: 10,
  cuatrimestre_id: 4,
  asignatura_id: 20,
  plan_normalizado: "LICENCIATURA EN PRUEBAS",
  grupo_normalizado: "1A",
  grado: "1",
};

function plan(overrides: Record<string, unknown> = {}) {
  return planAcademicOfferImport({
    cycleId: 4,
    rows: [
      { row: 2, plan: "Licenciatura en Pruebas", group: "1A - Escolarizado" },
    ],
    offers: [{ id: 3, nombre: "LICENCIATURA EN PRUEBAS" }],
    subjects: [{ id: 20, oferta_academica_id: null }],
    groups: [group],
    ...overrides,
  });
}

describe("academic offer import planning", () => {
  it("parses only Plan de Estudios and Grupo from the class-report contract", () => {
    const parsed = parseAcademicOfferCsv(
      "Plan de Estudios,Grupo,Clave,Clase,Docente\nLicenciatura en Pruebas,1A - Escolarizado,MAT-1,Álgebra,Ana",
    );

    expect(parsed.blockers).toEqual([]);
    expect(parsed.rows).toEqual([
      { row: 2, plan: "Licenciatura en Pruebas", group: "1A - Escolarizado" },
    ]);
  });

  it.each([
    "Escolarizado",
    "Virtual",
    "Ejecutivo",
    "Ingles",
    "Ejecutivo / Ingles",
    "Matutino",
    "Vespertino",
    "Mixto",
    "Nocturno",
    "Sabatino",
    "Dominical",
  ])(
    "strips the known %s modality suffix from a group identity",
    (modality) => {
      expect(normalizeAcademicOfferGroup(`1_A - ${modality}`)).toBe("1 A");
    },
  );

  it("preserves unknown hyphenated group labels", () => {
    expect(normalizeAcademicOfferGroup("A - Laboratorio")).toBe(
      "A - LABORATORIO",
    );
  });

  it.each([
    ["base database group", "27-1 ADEM 11 04A"],
    ["database group with a modality suffix", "27-1 ADEM 11 04A - Matutino"],
  ])("matches a Matutino report group against a %s", (_, databaseGroup) => {
    const result = plan({
      rows: [
        {
          row: 2,
          plan: "Licenciatura en Pruebas",
          group: "27-1 ADEM 11 04A - Matutino",
        },
      ],
      groups: [{ ...group, grupo_normalizado: databaseGroup }],
    });

    expect(result.blockers).toEqual([]);
    expect(result.actions).toMatchObject([
      {
        subjectId: 20,
        groupMatches: [{ groupId: 10, group: "27-1 ADEM 11 04A" }],
      },
    ]);
  });

  it("reuses the normalized offer and links assignment subjects without mutating inputs", () => {
    const groups = [group];
    const result = plan({ groups });

    expect(result.actions).toMatchObject([
      {
        kind: "link",
        offerId: 3,
        subjectId: 20,
        groupMatches: [
          {
            groupId: 10,
            plan: "LICENCIATURA EN PRUEBAS",
            group: "1A",
            grade: "1",
          },
        ],
      },
    ]);
    expect(result.summary).toMatchObject({ offersReused: 1, links: 1 });
    expect(groups).toEqual([group]);
  });

  it("plans one offer creation for repeated normalized plans", () => {
    const result = plan({
      offers: [],
      rows: [
        { row: 2, plan: "Licenciatura en Pruebas", group: "1A - Escolarizado" },
        {
          row: 3,
          plan: " LICENCIATURA EN PRUEBAS ",
          group: "1A - Escolarizado",
        },
      ],
    });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ offerId: null, rows: [2, 3] });
    expect(result.summary.offersToCreate).toBe(1);
  });

  it("warns for malformed rows while retaining safe actions", () => {
    const result = plan({
      rows: [
        { row: 2, plan: "", group: "" },
        { row: 3, plan: "Licenciatura en Pruebas", group: "1A - Escolarizado" },
      ],
    });

    expect(result.warnings).toEqual([
      {
        row: 2,
        reason: "fila_incompleta",
        details: { missingFields: ["plan", "group"] },
      },
    ]);
    expect(result.actions).toHaveLength(1);
    expect(result.blockers).toEqual([]);
  });

  it("reports unsafe catalog, grade, and subject conflicts without proposing their writes", () => {
    expect(
      plan({
        offers: [
          { id: 3, nombre: "Licenciatura en Pruebas" },
          { id: 4, nombre: "LICENCIATURA EN PRUEBAS" },
        ],
      }).blockers[0]?.reason,
    ).toBe("oferta_ambigua");
    expect(
      plan({ groups: [group, { ...group, id: 11, grado: "2" }] }).blockers[0]
        ?.reason,
    ).toBe("grado_ambiguo");
    expect(
      plan({ subjects: [{ id: 20, oferta_academica_id: 99 }] }).blockers[0]
        ?.reason,
    ).toBe("asignatura_en_conflicto");
  });

  it("does not guess when one subject is requested for two offers", () => {
    const result = plan({
      rows: [
        { row: 2, plan: "Licenciatura en Pruebas", group: "1A" },
        { row: 3, plan: "Otra Licenciatura", group: "1B" },
      ],
      offers: [],
      groups: [
        group,
        {
          ...group,
          id: 11,
          plan_normalizado: "OTRA LICENCIATURA",
          grupo_normalizado: "1B",
        },
      ],
    });

    expect(result.actions).toEqual([]);
    expect(result.blockers.map((blocker) => blocker.reason)).toContain(
      "asignatura_en_ofertas_conflictivas",
    );
  });

  it("keeps preview write-free and delegates the safe apply to the atomic RPC", () => {
    const api = readFileSync(
      new URL(
        "../pages/api/admin/importar-ofertas-academicas.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const page = readFileSync(
      new URL(
        "../pages/admin/importar-ofertas-academicas.astro",
        import.meta.url,
      ),
      "utf8",
    );
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/072_academic_offer_import.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(api).toContain('mode === "preview"');
    expect(api).toMatch(/rpc\(\s*"apply_academic_offer_import"/);
    expect(api).toContain('source: "admin.import.ofertas_academicas"');
    expect(api).toContain('formData.get("preview_signature") !== signature');
    expect(page).toContain("Las filas con conflicto no se aplicarán");
    expect(page).toContain("disabled=!actions.length||data.mode==='apply'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain(
      "UPDATE public.asignaturas SET oferta_academica_id",
    );
    expect(migration).not.toContain("INSERT INTO public.inscripciones");
  });
});
