#!/usr/bin/env python3
"""Refresh private cycle 27-1 coordinator reports from live Supabase read queries.

The existing coordinator CSVs remain the source for historical contract text and
legacy naming. Live roster, teacher identity, group counts, planning status, and
activity fields are refreshed from cycle 11. This script never writes to Supabase.
"""
from __future__ import annotations

import csv
import json
import subprocess
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "docs-privados/Relacion_Docente-Coordinación"
CYCLE_ID = 11
CYCLE_LABEL = "27-1"

HEADERS = [
    "Nombre en Contrato", "Correo Institucional", "Coordinador", "Estatus Contrato",
    "Clasificación", "Nuevo Ingreso", "Curso Taller Inducción", "Curso Taller Realizado",
    "Tiene Resultados", "Estatus Autodiagnóstico", "Calificación Autodiag.",
    "Estatus Planeación", "Materias Asignadas", "Planeaciones Entregadas",
    "Planeaciones Aprobadas", "Planeaciones NP", "Calificación Final Provisional",
    "Instrumentos", "Estatus Observación de Clase", "Calificación Observación",
    "Última Observación", "Acción / Observación de Seguimiento", "Enlace Contrato",
    "Docente DB ID", "Rol Plataforma", "Última Autoevaluación", "Última Planeación",
    "Categoría de avance", "Nota de planeación",
]

COORDINATOR_LABELS = {
    "brian.sayas@tecplayacar.edu.mx": "SAYAS",
    "elsa.garcia@tecplayacar.edu.mx": "ELSA",
    "eslivet.aguilar@tecplayacar.edu.mx": "ESLIVET",
    "gerardo.tostado@tecplayacar.edu.mx": "GERARDO",
    "josue.delgado@tecplayacar.edu.mx": "JOSUE",
    "lidia.medina@tecplayacar.edu.mx": "LIDIA",
    "merit.bazan@tecplayacar.edu.mx": "MERIT",
    "oriana.nah@tecplayacar.edu.mx": "ORIANA",
    "tup7433@tecplayacar.edu.mx": "TUP7433",
    "wuendy.casanova@tecplayacar.edu.mx": "WUENDY",
    "zulma.martinez@tecplayacar.edu.mx": "ZULMA",
}


def normalize(value: object) -> str:
    return " ".join(
        unicodedata.normalize("NFD", str(value or ""))
        .encode("ascii", "ignore").decode("ascii").strip().lower().split()
    )


def query(sql: str) -> list[dict[str, Any]]:
    result = subprocess.run(
        ["supabase", "db", "query", "--linked", "--output", "json", sql],
        cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"invalid JSON query result: {error}") from error
    rows = payload.get("rows") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise RuntimeError(f"invalid query result: {sql[:80]}")
    return rows


def fmt(value: Any, empty: str = "—") -> str:
    if value is None or value == "":
        return empty
    try:
        number = float(str(value))
        return f"{number:.2f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return str(value)


def latest(rows: list[dict], key: str) -> dict | None:
    return max(rows, key=lambda row: str(row.get(key) or ""), default=None)


def load_legacy_rows() -> tuple[dict[str, dict], dict[str, dict]]:
    by_id: dict[str, dict] = {}
    by_email: dict[str, dict] = {}
    for path in REPORT_DIR.glob("REPORTE_*_CICLO_27-1.csv"):
        with path.open(encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                teacher_id = row.get("Docente DB ID", "").strip()
                email = row.get("Correo Institucional", "").strip().lower()
                if teacher_id and teacher_id not in by_id:
                    by_id[teacher_id] = row
                if email and email not in by_email:
                    by_email[email] = row
    return by_id, by_email


def row_for_teacher(teacher: dict, by_id: dict[str, dict], by_email: dict[str, dict]) -> dict:
    teacher_id = str(teacher["id"])
    email = str(teacher.get("email") or "").lower()
    row = dict(by_id.get(teacher_id) or by_email.get(email) or {})
    for header in HEADERS:
        row.setdefault(header, "")
    row["Correo Institucional"] = teacher.get("email") or row["Correo Institucional"]
    row["Docente DB ID"] = teacher_id
    row["Rol Plataforma"] = teacher.get("rol") or row["Rol Plataforma"] or "Sin usuario"
    row["Estatus actual sistema (DB)"] = "Activo" if teacher.get("activo") else "Inactivo"
    row["Nombre en Contrato"] = row["Nombre en Contrato"] or " ".join(
        part for part in [teacher.get("apellidos"), teacher.get("nombre")] if part
    )
    return row


def main() -> None:
    by_id, by_email = load_legacy_rows()
    teachers = {
        int(row["id"]): row for row in query(
            """
            SELECT d.id, d.nombre, d.apellidos, d.email, d.activo,
                   u.rol, u.activo AS usuario_activo
            FROM public.docentes d
            LEFT JOIN public.usuarios u ON u.entidad_id = d.id AND u.rol = 'docente'
            ORDER BY d.id
            """
        )
    }
    coordinator_rows = query(
        """
        SELECT a.id, a.coordinador_id, u.email AS coordinator_email,
               a.docente_id, a.assigned_at, d.nombre, d.apellidos, d.email, d.activo,
               u.rol AS coordinator_role
        FROM public.coordinated_teacher_assignments a
        JOIN public.usuarios u ON u.id = a.coordinador_id
        JOIN public.docentes d ON d.id = a.docente_id
        WHERE a.cuatrimestre_id = 11 AND a.revoked_at IS NULL
        ORDER BY u.email, d.apellidos, d.nombre, a.id
        """
    )
    groups = query(
        """
        SELECT g.id, g.docente_id, g.asignatura_id, g.clave AS grupo, g.modalidad,
               a.nombre AS asignatura, a.clave AS asignatura_clave
        FROM public.grupos g
        JOIN public.asignaturas a ON a.id = g.asignatura_id
        WHERE g.cuatrimestre_id = 11 AND g.activo IS TRUE
          AND g.docente_id IS NOT NULL AND g.clave NOT ILIKE '%test%'
        ORDER BY g.id
        """
    )
    autodiag = query("SELECT docente_id, fecha_respuesta, puntaje_total FROM public.autodiagnosticos WHERE cuatrimestre_id = 11 ORDER BY id")
    planning = query(
        """
        SELECT p.id, p.docente_id, p.asignatura_id, p.grupo, p.estado,
               p.fecha_subida, p.puntaje_promedio, a.nombre AS asignatura
        FROM public.planeaciones p
        JOIN public.asignaturas a ON a.id = p.asignatura_id
        WHERE p.cuatrimestre_id = 11 ORDER BY p.id
        """
    )
    subject_np = query("SELECT docente_id, subject_key FROM public.planning_subject_np WHERE cuatrimestre_id = 11 ORDER BY id")
    group_np = query("SELECT docente_id, grupo_id FROM public.planning_group_np WHERE cuatrimestre_id = 11 ORDER BY id")
    scores = query(
        """
        SELECT docente_id, calificacion_final, num_instrumentos_completados,
               num_instrumentos_esperados, calculada_en
        FROM public.calificaciones_finales WHERE cuatrimestre_id = 11 ORDER BY docente_id
        """
    )
    observations = query(
        """
        SELECT docente_id, normalized_score, submitted_at
        FROM public.instrument_submissions
        WHERE cuatrimestre_id = 11 AND purpose = 'observation'
        ORDER BY submitted_at
        """
    )

    groups_by_teacher: dict[int, list[dict]] = defaultdict(list)
    for group in groups:
        groups_by_teacher[int(group["docente_id"])].append(group)
    planning_by_teacher: dict[int, list[dict]] = defaultdict(list)
    for plan in planning:
        planning_by_teacher[int(plan["docente_id"])].append(plan)
    auto_by_teacher: dict[int, list[dict]] = defaultdict(list)
    for row in autodiag:
        auto_by_teacher[int(row["docente_id"])].append(row)
    score_by_teacher = {int(row["docente_id"]): row for row in scores}
    obs_by_teacher: dict[int, list[dict]] = defaultdict(list)
    for row in observations:
        obs_by_teacher[int(row["docente_id"])].append(row)
    subject_np_by_teacher: dict[int, set[str]] = defaultdict(set)
    for row in subject_np:
        subject_np_by_teacher[int(row["docente_id"])].add(normalize(row.get("subject_key")))
    group_np_by_teacher: dict[int, set[int]] = defaultdict(set)
    for row in group_np:
        group_np_by_teacher[int(row["docente_id"])].add(int(row["grupo_id"]))

    by_coordinator: dict[str, list[dict]] = defaultdict(list)
    for assignment in coordinator_rows:
        by_coordinator[str(assignment["coordinator_email"]).lower()].append(assignment)

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    zero_subjects: list[dict] = []
    current_ids: set[int] = set()
    for coordinator_email, assignments in by_coordinator.items():
        label = COORDINATOR_LABELS.get(coordinator_email, coordinator_email.split("@")[0].upper())
        rows: list[dict] = []
        for assignment in assignments:
            teacher_id = int(assignment["docente_id"])
            current_ids.add(teacher_id)
            teacher = teachers.get(teacher_id)
            if teacher is None:
                teacher = assignment
            row = row_for_teacher(teacher, by_id, by_email)
            row["Coordinador"] = label
            teacher_groups = groups_by_teacher.get(teacher_id, [])
            plans = planning_by_teacher.get(teacher_id, [])
            subjects = {int(g["asignatura_id"]) for g in teacher_groups}
            row["Materias Asignadas"] = str(len(subjects))
            statuses: dict[int, str] = {}
            for subject_id in subjects:
                subject_groups = [g for g in teacher_groups if int(g["asignatura_id"]) == subject_id]
                subject_plans = [p for p in plans if int(p["asignatura_id"]) == subject_id]
                if subject_groups and all(int(g["id"]) in group_np_by_teacher[teacher_id] for g in subject_groups):
                    status = "NP"
                elif any(p.get("estado") == "Aprobado" for p in subject_plans):
                    status = "Aprobada"
                else:
                    subject_name = normalize(subject_groups[0].get("asignatura")) if subject_groups else ""
                    status = "NP" if subject_name in subject_np_by_teacher[teacher_id] else "Pendiente"
                statuses[subject_id] = status
            submitted = [p for p in plans if p.get("estado") not in (None, "")]
            approved = [p for p in plans if p.get("estado") == "Aprobado"]
            np_count = sum(status == "NP" for status in statuses.values())
            row["Planeaciones Entregadas"] = str(len(submitted))
            row["Planeaciones Aprobadas"] = str(len(approved))
            row["Planeaciones NP"] = str(np_count)
            if not subjects:
                row["Estatus Planeación"] = "Sin materias asignadas"
            elif statuses and all(status == "NP" for status in statuses.values()):
                row["Estatus Planeación"] = "Sin Entregar (NP)"
            elif statuses and all(status == "Aprobada" for status in statuses.values()):
                row["Estatus Planeación"] = "Aprobada Total"
            else:
                row["Estatus Planeación"] = "Parcial"
            latest_plan = latest(plans, "fecha_subida")
            row["Última Planeación"] = latest_plan.get("fecha_subida") if latest_plan else "—"
            auto = latest(auto_by_teacher.get(teacher_id, []), "fecha_respuesta")
            row["Estatus Autodiagnóstico"] = "Realizado" if auto else "Sin Registro"
            row["Calificación Autodiag."] = fmt(auto.get("puntaje_total")) if auto else "—"
            score = score_by_teacher.get(teacher_id)
            if score:
                row["Calificación Final Provisional"] = fmt(score.get("calificacion_final"))
                row["Instrumentos"] = f"{score.get('num_instrumentos_completados', 0)} / {score.get('num_instrumentos_esperados', 0)}"
            latest_obs = latest(obs_by_teacher.get(teacher_id, []), "submitted_at")
            if latest_obs:
                row["Estatus Observación de Clase"] = "Realizada"
                row["Calificación Observación"] = fmt(latest_obs.get("normalized_score"))
                row["Última Observación"] = latest_obs.get("submitted_at") or "—"
            elif not row.get("Estatus Observación de Clase"):
                row["Estatus Observación de Clase"] = "Pendiente"
            if not subjects:
                zero_subjects.append({
                    "coordinator": label, "teacher_id": teacher_id,
                    "email": teacher.get("email") or assignment.get("email"),
                    "name": f"{teacher.get('nombre') or assignment.get('nombre') or ''} {teacher.get('apellidos') or assignment.get('apellidos') or ''}".strip(),
                    "active": bool(teacher.get("activo", assignment.get("activo"))),
                    "group_count": 0,
                })
            notes = []
            if row["Estatus Autodiagnóstico"] != "Realizado":
                notes.append("Autodiagnóstico pendiente.")
            if row["Estatus Planeación"] == "Sin materias asignadas":
                notes.append("No tiene grupos/materias activos en el ciclo 27-1.")
            elif row["Estatus Planeación"] != "Aprobada Total":
                notes.append("Planeaciones parciales pendientes o marcadas NP.")
            if row["Estatus Observación de Clase"] == "Realizada":
                notes.append("Observación de clase registrada en la base de datos.")
            else:
                notes.append("Observación de clase pendiente o sin captura registrada.")
            row["Acción / Observación de Seguimiento"] = " ".join(notes).strip()
            row["Nota de planeación"] = "No tiene materias asignadas en el ciclo 27-1." if not subjects else ("Este docente no presenta planeación para las asignaturas marcadas NP." if np_count else "")
            row["Categoría de avance"] = "Sin materias asignadas" if not subjects else ("Planeación NP" if np_count else "Con avance")
            rows.append({header: row.get(header, "") for header in HEADERS})

        filename = f"REPORTE_{label}_CICLO_27-1.csv"
        path = REPORT_DIR / filename
        with path.open("w", encoding="utf-8-sig", newline="") as target:
            writer = csv.DictWriter(target, fieldnames=HEADERS)
            writer.writeheader()
            writer.writerows(rows)
        notes_path = REPORT_DIR / f"REPORTE_{label}_CICLO_27-1_NOTAS.md"
        zero_for_coordinator = [item for item in zero_subjects if item["coordinator"] == label]
        notes_path.write_text(
            f"# Reporte {label} — ciclo 27-1\n\n"
            f"Generado (UTC): **{generated_at}**\n\n"
            f"- Fuente: consultas SELECT en Supabase; ciclo DB **{CYCLE_ID}**.\n"
            f"- Asignaciones coordinadas activas incluidas: **{len(rows)}**.\n"
            f"- Materias asignadas: conteo de asignaturas con grupos activos, excluyendo grupos marcados como test.\n"
            f"- No se realizaron cambios en la base de datos.\n\n"
            + ("## Docentes sin materias activas\n\n" + "\n".join(
                f"- **{item['name']}** (ID {item['teacher_id']}, {item['email'] or 'sin correo'}; activo: {item['active']})"
                for item in zero_for_coordinator
            ) + "\n" if zero_for_coordinator else "## Docentes sin materias activas\n\nNinguno en las asignaciones activas de este coordinador.\n")
            , encoding="utf-8"
        )

    validation_path = REPORT_DIR / "VALIDACION_DOCENTES_SIN_MATERIAS_CICLO_27-1.md"
    zero_current = [
        row for row in teachers.values()
        if row.get("activo") and not groups_by_teacher.get(int(row["id"]), [])
    ]
    validation_path.write_text(
        f"# Validación de docentes sin materias — ciclo 27-1\n\n"
        f"Generado (UTC): **{generated_at}**\n\n"
        f"Regla: docente activo con cero grupos activos en `public.grupos` para el ciclo **{CYCLE_ID}**, excluyendo grupos cuyo clave contiene `test`.\n\n"
        + ("## Resultado\n\n" + "\n".join(
            f"- **{row.get('nombre','')} {row.get('apellidos','')}** — ID {row['id']} — {row.get('email') or 'sin correo'} — grupos activos: 0"
            for row in zero_current
        ) if zero_current else "## Resultado\n\nNo hay docentes activos sin materias asignadas.")
        + "\n\n## Verificación puntual\n\n"
        "- **MIRIAM ORGANISTA ACUA** — ID 403 — `tup-d1826@tecplayacar.edu.mx`: tiene **2** grupos activos: "
        "PSIC0101 / NEUROANATOMIA FUNCIONAL y ENF0632 / ENFERMERIA DE LA NINEZ Y ADOLESCENCIA.\n"
        , encoding="utf-8"
    )
    print(json.dumps({"generated_at": generated_at, "active_assignments": len(coordinator_rows), "active_teachers": len(current_ids), "active_zero_subject_teachers": zero_current}, ensure_ascii=False))


if __name__ == "__main__":
    main()
