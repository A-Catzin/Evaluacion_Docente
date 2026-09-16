import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseHorariosGrupoCsv,
  planHorariosGrupoImport,
  validateHorarioGrupoInput,
} from "./importHorariosGrupo";

const headers = "GRUPO_ID,DIA_SEMANA,HORA_INICIO,HORA_FIN,AULA";

describe("group schedule CSV import", () => {
  it("parses the exact CSV contract and normalizes valid times", () => {
    const result = parseHorariosGrupoCsv(`${headers}\n12,1,08:00,09:30,A-101`);

    expect(result.blockers).toEqual([]);
    expect(result.rows).toEqual([
      {
        row: 2,
        grupoId: 12,
        diaSemana: 1,
        horaInicio: "08:00:00",
        horaFin: "09:30:00",
        aula: "A-101",
      },
    ]);
  });

  it("rejects a changed header contract and malformed schedule rows", () => {
    expect(
      parseHorariosGrupoCsv(
        "GRUPO_ID,DIA,HORA_INICIO,HORA_FIN,AULA\n12,1,08:00,09:00,A-101",
      ).blockers[0]?.reason,
    ).toBe("invalid_contract");
    const result = parseHorariosGrupoCsv(
      `${headers}\n12,8,10:00,09:00,\n12,1,08:00,09:00,A-101\n12,1,08:00,09:00,A-101`,
    );
    expect(result.blockers).toMatchObject([
      { row: 2, reason: "invalid_row" },
      { row: 4, reason: "duplicate_row" },
    ]);
  });

  it("plans only active groups in the selected cycle and makes existing schedules no-ops", () => {
    const parsed = parseHorariosGrupoCsv(
      `${headers}\n12,1,08:00,09:30,A-101\n13,2,10:00,11:00,B-201`,
    );
    const result = planHorariosGrupoImport({
      cycleId: 4,
      rows: parsed.rows,
      groups: [
        { id: 12, cuatrimestre_id: 4, activo: true, label: "MAT-101 · 1A" },
        { id: 13, cuatrimestre_id: 5, activo: true },
      ],
      existing: [
        {
          grupo_id: 12,
          dia_semana: 1,
          hora_inicio: "08:00:00",
          hora_fin: "09:30:00",
          aula: "A-101",
          activo: true,
        },
      ],
    });

    expect(result.actions).toMatchObject([
      { grupoId: 12, kind: "no-op", groupLabel: "MAT-101 · 1A" },
    ]);
    expect(result.blockers).toMatchObject([
      { row: 3, reason: "group_not_available" },
    ]);
  });

  it("treats aula as optional and blocks duplicate group slots regardless of aula", () => {
    const result = parseHorariosGrupoCsv(
      `${headers}\n12,1,08:00,09:30,\n12,1,08:00,09:30,A-101`,
    );

    expect(result.rows[0]?.aula).toBeNull();
    expect(result.blockers).toMatchObject([
      { row: 3, reason: "duplicate_row" },
    ]);
  });

  it("shares strict manual validation with CSV constraints", () => {
    expect(
      validateHorarioGrupoInput({
        grupo_id: 12,
        dia_semana: 7,
        hora_inicio: "18:00",
        hora_fin: "19:00",
        aula: "Lab 1",
      }).ok,
    ).toBe(true);
    expect(
      validateHorarioGrupoInput({
        grupo_id: 12,
        dia_semana: 0,
        hora_inicio: "19:00",
        hora_fin: "18:00",
        aula: "",
      }),
    ).toMatchObject({ ok: false });
  });

  it("keeps group schedules normalized, secured, and explicitly covered by test-cycle deletion", () => {
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/088_horarios_grupo.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toContain(
      "REFERENCES public.grupos(id) ON DELETE CASCADE",
    );
    expect(migration).toContain("CHECK (dia_semana BETWEEN 1 AND 7)");
    expect(migration).toContain("CHECK (hora_inicio < hora_fin)");
    expect(migration).toContain("horarios_grupo_active_duplicate_idx");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("admin_apply_horarios_grupo");
    expect(migration).toContain("'horarios_grupo', 'grupos'");
  });
});
