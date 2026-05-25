#!/usr/bin/env python3
"""Importa evaluaciones_profesores.csv de Saeko → Supabase"""
import csv, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from supabase import create_client

SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL", "https://snavhkdyowjmqojcqmqu.supabase.co")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
if not SERVICE_KEY:
    print("ERROR: Configurá SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SERVICE_KEY)
CSV_PATH = "../docs/base_datos/evaluaciones_profesores.csv"

def esc(t):
    return (t or "").strip()

def main():
    with open(CSV_PATH, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    print(f"📊 {len(rows)} evaluaciones encontradas")
    ofertas = set(); docs = {}; asigs = {}; grupos = set(); evals = []

    for r in rows:
        if esc(r.get("Estado de la evaluación")) != "Completada": continue
        plan = esc(r.get("Plan de estudios"))
        grupo_raw = esc(r.get("Grupo"))
        clave = esc(r.get("Asignatura Clave"))
        clase = esc(r.get("Nombre de la clase"))
        docente_nom = esc(r.get("Nombre del docente"))
        ciclo = esc(r.get("Ciclo escolar"))
        grado = esc(r.get("Grado"))

        ofertas.add(plan)
        docs[docente_nom] = True
        asigs[(clave, clase, plan)] = True
        grupos.add((grupo_raw, docente_nom, clave, ciclo))

        try:
            prom = float(esc(r.get("Promedio", "0")))
            evals.append({
                "docente_nom": docente_nom, "grupo_raw": grupo_raw, "clave": clave,
                "ciclo": ciclo, "promedio_general": prom,
                "prom_asistencia": float(esc(r.get("Asistencia", "0")) or 0),
                "prom_organizacion": float(esc(r.get("Organización", "0")) or 0),
                "prom_actitud": float(esc(r.get("Actitud", "0")) or 0),
                "prom_ensenanza": float(esc(r.get("Enseñanza", "0")) or 0),
                "prom_dominio": float(esc(r.get("Dominio del contenido", "0")) or 0),
                "prom_evaluacion": float(esc(r.get("Evaluación y calificación", "0")) or 0),
                "prom_comunicacion": float(esc(r.get("Participación y comunicación", "0")) or 0),
                "prom_gestion": float(esc(r.get("Gestión del grupo", "0")) or 0),
                "prom_tecnologia": float(esc(r.get("Tecnología", "0")) or 0),
                "prom_satisfaccion": float(esc(r.get("Satisfacción global del estudiante", "0")) or 0),
                "comentarios": esc(r.get("Comentarios")) or None,
            })
        except: pass

    print(f"  Ofertas: {len(ofertas)}, Docentes: {len(docs)}, Asignaturas: {len(asigs)}, Grupos: {len(grupos)}, Eval: {len(evals)}")

    # 1. Ofertas
    for o in ofertas:
        supabase.table("ofertas_academicas").upsert({"nombre": o}, on_conflict="nombre").execute()
    # 2. Docentes (con email del maestro)
    docentes_csv = {}
    with open("../docs/base_datos/docentes_tecplayacar.csv", "r", encoding="utf-8-sig") as f:
        for dr in csv.DictReader(f):
            docentes_csv[esc(dr["Docente"]).upper()] = esc(dr["Correo"])
    for d in docs:
        email = docentes_csv.get(d.upper(), d.lower().replace(" ",".")[:30] + "@tecplayacar.edu.mx")
        partes = d.rsplit(" ", 2)
        ap = " ".join(partes[:-2]) if len(partes) >= 3 else partes[0] if partes else ""
        nom = " ".join(partes[-2:]) if len(partes) >= 3 else " ".join(partes[1:]) if len(partes) > 1 else ""
        supabase.table("docentes").upsert({"nombre": nom, "apellidos": ap, "email": email, "activo": True}, on_conflict="email").execute()
    # 3. Asignaturas
    for (clave, clase, plan) in asigs:
        supabase.table("asignaturas").upsert({"clave": clave, "nombre": clase}, on_conflict="clave").execute()
    # 4. Grupos
    for (grupo_raw, docente_nom, clave, ciclo) in grupos:
        gid = grupo_raw.replace(" ", "_").replace("-", "_")[:50]
        supabase.table("grupos").upsert({"clave": gid}, on_conflict="clave").execute()  # simplified
    # 5. Evaluaciones
    for ev in evals:
        supabase.table("encuesta_estudiantil").insert(ev).execute()

    print("✅ Importación completada")

if __name__ == "__main__":
    main()
