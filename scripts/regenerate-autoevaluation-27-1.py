#!/usr/bin/env python3
"""Regenerate the 27-1 autoevaluation report from live Supabase SELECT queries.

The legacy CSV backup is used only for historic contract metadata. All teacher
identity, activity, counts, scores, and statuses are fetched for every run.
"""
from __future__ import annotations

import csv
import json
import shutil
import subprocess
import unicodedata
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "docs-privados/REPORTE_AUTOEVALUACIÓN_DOCENTES_27-1.xlsx"
CSV = ROOT / "docs-privados/REPORTE_AUTOEVALUACIÓN_DOCENTES_27-1.xlsx - Cruce Maestro Docentes.csv"
XLSX_BACKUP = Path("/tmp/REPORTE_AUTOEVALUACIÓN_DOCENTES_27-1.xlsx.backup")
CSV_BACKUP = Path("/tmp/REPORTE_AUTOEVALUACIÓN_DOCENTES_27-1.csv.backup")
EXCLUDED_EMAIL = "tup-d1149@tecplayacar.edu.mx"
CYCLE_NAME = "27-1"

# Each query is read-only and scoped to the report cycle where applicable. The
# script intentionally does not persist query output, so a later run cannot reuse
# a stale local snapshot.
LIVE_QUERIES = {
    "teachers": """
        SELECT d.id, d.nombre, d.apellidos, d.email, d.activo, d.campus, d.modalidad,
               u.rol, u.activo AS usuario_activo
        FROM public.docentes d
        LEFT JOIN public.usuarios u ON u.entidad_id = d.id AND u.rol = 'docente'
        ORDER BY d.id
    """,
    "assignments": """
        SELECT g.id, g.docente_id, g.clave AS grupo, g.modalidad,
               a.id AS asignatura_id, a.nombre AS asignatura, a.clave AS asignatura_clave
        FROM public.grupos g
        JOIN public.asignaturas a ON a.id = g.asignatura_id
        WHERE g.cuatrimestre_id = 11 AND g.activo IS TRUE
          AND g.docente_id IS NOT NULL AND g.clave NOT ILIKE '%test%'
        ORDER BY g.id
    """,
    "autodiag": """
        SELECT ad.id, ad.docente_id, ad.fecha_respuesta, ad.puntaje_total, ad.nivel_desempeno
        FROM public.autodiagnosticos ad
        WHERE ad.cuatrimestre_id = 11
        ORDER BY ad.id
    """,
    "planning": """
        SELECT p.id, p.docente_id, p.asignatura_id, p.grupo, p.grupos_cubiertos,
               p.estado, p.fecha_subida, p.puntaje_promedio, a.nombre AS asignatura
        FROM public.planeaciones p
        JOIN public.asignaturas a ON a.id = p.asignatura_id
        WHERE p.cuatrimestre_id = 11
        ORDER BY p.id
    """,
    "subject_np": """
        SELECT psn.docente_id, psn.estado, psn.subject_key
        FROM public.planning_subject_np psn
        WHERE psn.cuatrimestre_id = 11
        ORDER BY psn.id
    """,
    "group_np": """
        SELECT pgn.docente_id, pgn.grupo_id, pgn.estado
        FROM public.planning_group_np pgn
        WHERE pgn.cuatrimestre_id = 11
        ORDER BY pgn.id
    """,
    "scores": """
        SELECT cf.docente_id, cf.calificacion_final, cf.categoria_final,
               cf.num_instrumentos_completados, cf.num_instrumentos_esperados,
               cf.score_autoevaluacion, cf.score_coordinacion, cf.score_encuesta_estudiantil,
               cf.score_observacion, cf.score_planeacion, cf.calculada_en
        FROM public.calificaciones_finales cf
        WHERE cf.cuatrimestre_id = 11
        ORDER BY cf.docente_id
    """,
}

CONTRACT_FIELDS = (
    "Coordinador",
    "Estatus Contrato",
    "Clasificación",
    "Nuevo Ingreso",
    "Curso Taller Inducción",
    "Enlace Contrato",
)
MASTER_HEADERS = [
    "No. Fila", "No. Docente", "Nombre (DB)", "Correo Institucional",
    "Coordinador", "Estatus Contrato (histórico CSV)", "Estatus actual sistema (DB)", "Clasificación", "Nuevo Ingreso",
    "Curso Taller Inducción", "Tiene Resultados", "Estatus Autodiagnóstico",
    "Calificación Autodiag.", "Estatus Planeación", "Materias Asignadas",
    "Planeaciones Entregadas", "Planeaciones Aprobadas", "Planeaciones NP",
    "Calificación Final Provisional", "Instrumentos", "Acción / Observación de Seguimiento",
    "Enlace Contrato", "Docente DB ID", "Rol Plataforma", "Última Autoevaluación",
    "Última Planeación", "Categoría de avance", "Nota de planeación",
]
DETAIL_HEADERS = [
    "Docente ID", "Docente", "Apellidos", "Correo", "Grupo", "Asignatura", "Clave",
    "Asignación activa", "Planeación", "Estado planeación", "Puntaje planeación",
    "NP grupo", "NP materia", "Autodiagnóstico (%)", "Calificación final", "Instrumentos",
]


def normalize(value: object) -> str:
    return " ".join(
        unicodedata.normalize("NFD", str(value or ""))
        .encode("ascii", "ignore").decode("ascii").strip().lower().split()
    )


def query_live(name: str) -> list[dict]:
    """Run one required read-only query and reject any incomplete live data."""
    result = subprocess.run(
        ["supabase", "db", "query", "--linked", "--output", "json", LIVE_QUERIES[name]],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(f"Live Supabase query {name!r} failed: {result.stderr.strip() or result.stdout.strip()}")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Live Supabase query {name!r} returned invalid JSON: {error}") from error
    rows = payload.get("rows") if isinstance(payload, dict) else payload
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise RuntimeError(f"Live Supabase query {name!r} returned an invalid rows payload")
    return rows


def fmt_number(value: object) -> str:
    if value is None or value == "":
        return "—"
    number = float(str(value))
    return f"{number:.2f}".rstrip("0").rstrip(".")


def latest(records: list[dict], date_key: str) -> dict | None:
    return max(records, key=lambda row: str(row.get(date_key) or ""), default=None)


def contract_metadata() -> tuple[dict[str, dict], set[str]]:
    """Return unique historic fields and ambiguous duplicate-email keys from the backup."""
    if not CSV_BACKUP.exists():
        raise RuntimeError(f"Required historic contract backup is missing: {CSV_BACKUP}")
    with open(CSV_BACKUP, encoding="utf-8-sig", newline="") as source:
        legacy = list(csv.DictReader(source))
    by_email: dict[str, list[dict]] = defaultdict(list)
    for row in legacy:
        email = row.get("Correo Institucional", "").strip().lower()
        if email and email != "no":
            by_email[email].append(row)
    duplicates = {email for email, rows in by_email.items() if len(rows) > 1}
    unique = {email: rows[0] for email, rows in by_email.items() if len(rows) == 1}
    return unique, duplicates


def status_for_subject(
    assignments: list[dict], plans: list[dict], subject_np: set[str], group_np: set[int],
) -> str:
    """Mirror getPlanningSubjectStatus: group NP, approved plan, then subject NP."""
    if assignments and all(int(row["id"]) in group_np for row in assignments):
        return "NP"
    if any(row.get("estado") == "Aprobado" for row in plans):
        return "Aprobado"
    return "NP" if normalize(assignments[0]["asignatura"]) in subject_np else "Pendiente"


def cell(value: object, style: int = 0) -> str:
    attr = f' s="{style}"' if style else ""
    if value is None:
        value = ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"<c{attr}><v>{value}</v></c>"
    return f'<c t="inlineStr"{attr}><is><t>{escape(str(value))}</t></is></c>'


def col_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def worksheet(rows: list[list[object]], widths: list[int], title_rows: int = 0) -> str:
    xml_rows = []
    for row_number, row in enumerate(rows, 1):
        style = 1 if row_number <= title_rows else (2 if row_number == title_rows + 1 else 0)
        cells = "".join(
            f'<c r="{col_name(column)}{row_number}"' + cell_xml[2:]
            for column, cell_xml in enumerate((cell(value, style) for value in row), 1)
        )
        xml_rows.append(f'<row r="{row_number}">{cells}</row>')
    cols = "".join(
        f'<col min="{i}" max="{i}" width="{width}" customWidth="1"/>'
        for i, width in enumerate(widths, 1)
    )
    auto_filter = "" if title_rows == 0 else f'<autoFilter ref="A{title_rows + 1}:{col_name(len(rows[title_rows]))}{len(rows)}"/>'
    pane = '<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>' if title_rows else '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane{pane[5:]}</sheetView></sheetViews><cols>{cols}</cols><sheetData>{''.join(xml_rows)}</sheetData>{auto_filter}</worksheet>'''


def workbook_xml(sheet_names: list[str]) -> str:
    sheets = "".join(
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(sheet_names, 1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>{sheets}</sheets></workbook>'''


def write_xlsx(sheets: list[tuple[str, list[list[object]], list[int], int]]) -> None:
    names = [sheet[0] for sheet in sheets]
    content_types = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>', '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>']
    content_types.extend(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(sheets) + 1))
    workbook_rels = ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(sheets) + 1)) + f'<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs></styleSheet>'''
    with zipfile.ZipFile(XLSX, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">{"".join(content_types)}</Types>')
        archive.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr("xl/workbook.xml", workbook_xml(names))
        archive.writestr("xl/_rels/workbook.xml.rels", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{workbook_rels}</Relationships>')
        archive.writestr("xl/styles.xml", styles)
        for index, (_, rows, widths, title_rows) in enumerate(sheets, 1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", worksheet(rows, widths, title_rows))


def main() -> None:
    # The historic CSV backup is the sole contract-metadata source and must never
    # be replaced from a generated report. Preserve the workbook backup if absent.
    if not CSV_BACKUP.exists():
        raise RuntimeError(f"Required historic contract backup is missing: {CSV_BACKUP}")
    if not XLSX_BACKUP.exists():
        shutil.copy2(XLSX, XLSX_BACKUP)

    live_data = {name: query_live(name) for name in LIVE_QUERIES}
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    teachers = [row for row in live_data["teachers"] if row.get("email", "").lower() != EXCLUDED_EMAIL]
    assignments = live_data["assignments"]
    autodiag = live_data["autodiag"]
    planning = live_data["planning"]
    subject_np_rows = live_data["subject_np"]
    group_np_rows = live_data["group_np"]
    scores = live_data["scores"]
    contract, duplicate_contract_emails = contract_metadata()

    teacher_by_id = {row["id"]: row for row in teachers}
    assignments_by_teacher: dict[int, list[dict]] = defaultdict(list)
    for row in assignments:
        if row["docente_id"] in teacher_by_id:
            assignments_by_teacher[row["docente_id"]].append(row)
    plans_by_teacher: dict[int, list[dict]] = defaultdict(list)
    for row in planning:
        if row["docente_id"] in teacher_by_id:
            plans_by_teacher[row["docente_id"]].append(row)
    auto_by_teacher: dict[int, list[dict]] = defaultdict(list)
    for row in autodiag:
        if row["docente_id"] in teacher_by_id:
            auto_by_teacher[row["docente_id"]].append(row)
    score_by_teacher = {row["docente_id"]: row for row in scores if row["docente_id"] in teacher_by_id}
    subject_np_by_teacher: dict[int, set[str]] = defaultdict(set)
    for row in subject_np_rows:
        if row["docente_id"] in teacher_by_id and row.get("estado") == "NP":
            subject_np_by_teacher[row["docente_id"]].add(normalize(row["subject_key"]))
    group_np_by_teacher: dict[int, set[int]] = defaultdict(set)
    for row in group_np_rows:
        if row["docente_id"] in teacher_by_id and row.get("estado") == "NP":
            group_np_by_teacher[row["docente_id"]].add(int(row["grupo_id"]))

    teachers.sort(key=lambda row: (normalize(row.get("apellidos")), normalize(row.get("nombre")), row["id"]))
    master_rows: list[dict] = []
    detail_rows: list[list[object]] = []
    for position, teacher in enumerate(teachers, 1):
        teacher_id = teacher["id"]
        email = str(teacher.get("email") or "").strip()
        email_key = email.lower()
        teacher_assignments = assignments_by_teacher[teacher_id]
        subject_assignments: dict[str, list[dict]] = defaultdict(list)
        for assignment in teacher_assignments:
            subject_assignments[normalize(assignment["asignatura"])].append(assignment)
        teacher_plans = plans_by_teacher[teacher_id]
        plans_by_subject: dict[str, list[dict]] = defaultdict(list)
        for plan in teacher_plans:
            plans_by_subject[normalize(plan["asignatura"])].append(plan)
        statuses = {
            subject: status_for_subject(subject_rows, plans_by_subject[subject], subject_np_by_teacher[teacher_id], group_np_by_teacher[teacher_id])
            for subject, subject_rows in subject_assignments.items()
        }
        subject_count = len(subject_assignments)
        submitted_count = sum(1 for subject in subject_assignments if plans_by_subject[subject])
        approved_count = sum(status == "Aprobado" for status in statuses.values())
        np_count = sum(status == "NP" for status in statuses.values())
        if not subject_count:
            planning_status = "Sin Registro"
        elif approved_count == subject_count:
            planning_status = "Aprobada Total"
        elif np_count == subject_count:
            planning_status = "Sin Entregar (NP)"
        else:
            planning_status = "Parcial"
        auto = latest(auto_by_teacher[teacher_id], "fecha_respuesta")
        score = score_by_teacher.get(teacher_id)
        has_auto = auto is not None
        has_planning_record = bool(teacher_plans)
        has_completed_score = bool(score and int(score.get("num_instrumentos_completados") or 0) > 0)
        auto_score = fmt_number(float(auto["puntaje_total"]) / 1.2) if auto else "—"
        auto_status = "Realizado" if auto else "Sin Registro"
        has_results = "SÍ" if has_auto or has_planning_record or has_completed_score else "NO"
        system_status = "Activo" if bool(teacher.get("activo")) else "Inactivo"
        if not teacher.get("activo"):
            category = "Inactivo"
            action = "Docente inactivo en el sistema; no se clasifica como Maestro sin avance."
        elif not subject_count:
            category = "Sin asignación"
            action = "Docente activo sin asignación escolarizada activa en el ciclo; no se clasifica como Maestro sin avance."
        elif not has_auto and not has_planning_record and not has_completed_score:
            category = "Maestro sin avance"
            action = "MAESTRO SIN AVANCE: docente activo con asignación, sin autodiagnóstico, planeación ni instrumentos completados."
        elif np_count:
            category = "Planeación NP"
            auto_message = "Autodiagnóstico realizado." if has_auto else "Autodiagnóstico pendiente."
            planning_message = " Planeaciones pendientes de aprobar (todas NP)." if np_count == subject_count else " Planeaciones parciales pendientes."
            action = auto_message + planning_message
        else:
            category = "Con avance"
            action = "Evaluaciones al corriente (Autodiagnóstico y Planeación aprobadas)" if has_auto and planning_status == "Aprobada Total" else "Seguimiento de instrumentos y planeaciones pendiente."
        note = (
            "Este docente no presenta planeación para las asignaturas marcadas NP."
            if 0 < np_count < subject_count
            else "Este docente no presenta planeación." if subject_count and np_count == subject_count else ""
        )
        if note:
            action = f"{action} {note}"
        metadata = dict.fromkeys(CONTRACT_FIELDS, "")
        if email_key in duplicate_contract_emails:
            metadata["Estatus Contrato"] = "Contrato por revisar"
        elif email_key in contract:
            metadata.update({field: contract[email_key].get(field, "") for field in CONTRACT_FIELDS})
        name = " ".join(part for part in (teacher.get("nombre"), teacher.get("apellidos")) if part)
        last_plan = latest(teacher_plans, "fecha_subida")
        master = {
            "No. Fila": position, "No. Docente": teacher_id, "Nombre (DB)": name,
            "Correo Institucional": email, "Coordinador": metadata["Coordinador"],
            "Estatus Contrato (histórico CSV)": metadata["Estatus Contrato"],
            "Estatus actual sistema (DB)": system_status,
            "Clasificación": metadata["Clasificación"], "Nuevo Ingreso": metadata["Nuevo Ingreso"],
            "Curso Taller Inducción": metadata["Curso Taller Inducción"], "Tiene Resultados": has_results,
            "Estatus Autodiagnóstico": auto_status, "Calificación Autodiag.": auto_score,
            "Estatus Planeación": planning_status, "Materias Asignadas": subject_count,
            "Planeaciones Entregadas": submitted_count, "Planeaciones Aprobadas": approved_count,
            "Planeaciones NP": np_count,
            "Calificación Final Provisional": fmt_number(score.get("calificacion_final")) if score else "—",
            "Instrumentos": f"{score['num_instrumentos_completados']} / {score['num_instrumentos_esperados']}" if score else "—",
            "Acción / Observación de Seguimiento": action, "Enlace Contrato": metadata["Enlace Contrato"], "Docente DB ID": teacher_id,
            "Rol Plataforma": teacher.get("rol") or "", "Última Autoevaluación": auto.get("fecha_respuesta") if auto else "—",
            "Última Planeación": last_plan.get("fecha_subida") if last_plan else "—",
            "Categoría de avance": category, "Nota de planeación": note,
        }
        master_rows.append(master)
        for assignment in sorted(teacher_assignments, key=lambda row: (row["grupo"], row["asignatura"], row["id"])):
            subject = normalize(assignment["asignatura"])
            assignment_plans = plans_by_subject[subject]
            plan = latest(assignment_plans, "fecha_subida")
            group_np = int(assignment["id"]) in group_np_by_teacher[teacher_id]
            subject_np = subject in subject_np_by_teacher[teacher_id]
            detail_rows.append([
                teacher_id, teacher.get("nombre") or "", teacher.get("apellidos") or "", email,
                assignment["grupo"], assignment["asignatura"], assignment.get("asignatura_clave") or "",
                "Sí", "Sí" if plan else "No", statuses[subject],
                fmt_number(plan.get("puntaje_promedio")) if plan else "—",
                "Sí" if group_np else "No", "Sí" if subject_np else "No", auto_score if auto else "",
                fmt_number(score.get("calificacion_final")) if score else "—", master["Instrumentos"],
            ])

    csv_rows = [[row[header] for header in MASTER_HEADERS] for row in master_rows]
    with open(CSV, "w", encoding="utf-8-sig", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(MASTER_HEADERS)
        writer.writerows(csv_rows)

    category_counts = Counter(row["Categoría de avance"] for row in master_rows)
    summary_rows = [
        ["REPORTE DE DOCENTES Y EVALUACIONES — CICLO 27-1", ""],
        ["Fuente", "Supabase vinculado en vivo (siete SELECT; sin escrituras a base de datos)"],
        ["Generado (UTC)", generated_at],
        ["Cuatrimestre", CYCLE_NAME],
        [],
        ["INDICADOR", "VALOR"],
        ["Docentes incluidos", len(master_rows)],
        ["Docentes activos", sum(bool(row.get("activo")) for row in teachers)],
        ["Autodiagnósticos realizados", sum(row["docente_id"] in teacher_by_id for row in autodiag)],
        ["Docentes con autodiagnóstico", sum(row["Estatus Autodiagnóstico"] == "Realizado" for row in master_rows)],
        ["Planeaciones entregadas", sum(row["docente_id"] in teacher_by_id for row in planning)],
        ["Planeaciones aprobadas", sum(row["docente_id"] in teacher_by_id and row.get("estado") == "Aprobado" for row in planning)],
        ["Planeaciones en corrección", sum(row["docente_id"] in teacher_by_id and row.get("estado") == "Corrección" for row in planning)],
        ["Marcaciones NP de materia/grupo", sum(row["docente_id"] in teacher_by_id for row in subject_np_rows + group_np_rows)],
        ["Asignaciones/grupos activos", len(detail_rows)],
        ["Resultados finales precalculados", len(score_by_teacher)],

        [],
        ["SEGUIMIENTO DE AVANCE", "VALOR"],
        ["Maestros sin avance", category_counts["Maestro sin avance"]],
        ["Docentes con planeación NP", category_counts["Planeación NP"]],
    ]
    master_sheet = [["Cruce Maestro Docentes"], [f"Fuente: Supabase en vivo | Ciclo: {CYCLE_NAME} | UTC: {generated_at}"], [], MASTER_HEADERS] + csv_rows
    detail_sheet = [["Detalle Asignaturas"], [f"Fuente: Supabase en vivo | Ciclo: {CYCLE_NAME} | UTC: {generated_at}"], [], DETAIL_HEADERS] + detail_rows
    no_progress_headers = ["No. Docente", "Nombre (DB)", "Correo Institucional", "Coordinador", "Estatus Contrato (histórico CSV)", "Estatus actual sistema (DB)", "Autodiagnóstico", "Planeación", "Materias Asignadas", "Categoría de avance", "Nota"]
    no_progress = [
        [
            row["No. Docente"], row["Nombre (DB)"], row["Correo Institucional"],
            row["Coordinador"], row["Estatus Contrato (histórico CSV)"], row["Estatus actual sistema (DB)"],
            row["Estatus Autodiagnóstico"], row["Estatus Planeación"], row["Materias Asignadas"],
            row["Categoría de avance"], row["Acción / Observación de Seguimiento"],
        ]
        for row in master_rows if row["Categoría de avance"] == "Maestro sin avance"
    ]
    sheets = [
        ("Resumen Ejecutivo", summary_rows, [42, 62], 5),
        ("Cruce Maestro Docentes", master_sheet, [10, 12, 32, 34, 18, 24, 22, 18, 16, 28, 14, 22, 18, 22, 16, 20, 20, 16, 22, 15, 55, 55, 14, 18, 24, 24, 22, 40], 3),
        ("Detalle Asignaturas", detail_sheet, [12, 22, 24, 34, 28, 42, 18, 18, 14, 20, 20, 12, 14, 20, 18, 16], 3),
        ("Maestros Sin Avance", [no_progress_headers] + no_progress, [12, 34, 34, 18, 24, 22, 20, 20, 18, 24, 62], 0),
    ]
    write_xlsx(sheets)

    # Strict postconditions required for this report regeneration.
    expected_sheets = ["Resumen Ejecutivo", "Cruce Maestro Docentes", "Detalle Asignaturas", "Maestros Sin Avance"]
    with zipfile.ZipFile(XLSX) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("Generated XLSX has corrupt ZIP members")
        workbook = archive.read("xl/workbook.xml").decode("utf-8")
    if [f'name="{name}"' in workbook for name in expected_sheets] != [True] * len(expected_sheets):
        raise RuntimeError("Generated XLSX is missing an expected worksheet")
    try:
        with open(CSV, encoding="utf-8-sig", newline="") as source:
            csv_output = list(csv.DictReader(source))
    except (OSError, csv.Error) as error:
        raise RuntimeError(f"Could not validate generated CSV: {error}") from error
    if len(csv_output) != len(master_rows):
        raise RuntimeError("CSV total does not match the live-derived master total")
    if len(master_rows) != len(live_data["teachers"]) - 1 or any(row["Correo Institucional"].lower() == EXCLUDED_EMAIL for row in master_rows):
        raise RuntimeError("Teacher inclusion/exclusion postcondition failed")
    farith = next((row for row in master_rows if row["Correo Institucional"].lower() == "tup-d1670@tecplayacar.edu.mx"), None)
    if farith is None or [farith[key] for key in ("Materias Asignadas", "Planeaciones Aprobadas", "Planeaciones NP")] != [4, 3, 1]:
        raise RuntimeError(f"Farith planning postcondition failed: {farith}")
    if sum(1 for row in detail_rows if row[0] == farith["Docente DB ID"]) != 5:
        raise RuntimeError("Farith group assignment postcondition failed")
    garcia = next((row for row in master_rows if row["Docente DB ID"] == 250), None)
    if garcia is None or garcia["Estatus actual sistema (DB)"] != "Activo":
        raise RuntimeError(f"Garcia Mayra current-system status postcondition failed: {garcia}")
    print(json.dumps({"generated_at": generated_at, "teachers": len(master_rows), "categories": dict(sorted(category_counts.items())), "detail_rows": len(detail_rows), "no_progress": len(no_progress), "farith": {key: farith[key] for key in ("Estatus Contrato (histórico CSV)", "Materias Asignadas", "Planeaciones Aprobadas", "Planeaciones NP", "Estatus Planeación")}, "garcia_mayra_status": garcia["Estatus actual sistema (DB)"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
