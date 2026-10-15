#!/usr/bin/env python3
"""Isolated synthetic score smoke test; never connects to a host database."""
import pathlib
import subprocess
import sys
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMAGE = 'postgres:17-alpine'
NAME = 'cd07-score-' + uuid.uuid4().hex[:12]
DEADLINE = time.monotonic() + 150


def run(args, *, stage, sql=None, allow_failure=False):
    remaining = DEADLINE - time.monotonic()
    if remaining <= 0:
        raise RuntimeError(f'{stage}: deadline exceeded')
    try:
        result = subprocess.run(args, input=sql, text=True, capture_output=True,
                                timeout=min(remaining, 25), check=False)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f'{stage}: timeout') from None
    except OSError:
        raise RuntimeError(f'{stage}: subprocess unavailable') from None
    if not allow_failure and result.returncode != 0:
        raise RuntimeError(f'{stage}: nonzero exit')
    return result


def psql(sql, *, stage):
    return run(['docker', 'exec', '-i', NAME, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
                    '-U', 'postgres', '-d', 'postgres', '-q'], stage=stage, sql=sql)


SETUP = r"""
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
 AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
 AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE TABLE public.cuatrimestres(id integer PRIMARY KEY, activo boolean, cerrado boolean);
CREATE TABLE public.docentes(id integer PRIMARY KEY);
CREATE TABLE public.asignaturas(id integer PRIMARY KEY);
CREATE TABLE public.grupos(id integer PRIMARY KEY, cuatrimestre_id integer, docente_id integer, asignatura_id integer, activo boolean);
CREATE TABLE public.usuarios(id uuid PRIMARY KEY, rol varchar(20), entidad_id integer, activo boolean);
CREATE TABLE public.inscripciones(id integer PRIMARY KEY, cuatrimestre_id integer, grupo_id integer, estudiante_id integer);
CREATE TABLE public.encuesta_control_envio(id integer PRIMARY KEY, cuatrimestre_id integer, grupo_id integer, estudiante_id integer);
CREATE TABLE public.encuesta_estudiantil_respuestas(
 id integer PRIMARY KEY, cuatrimestre_id integer, grupo_id integer, docente_id integer,
 calidad_general integer, item_plan_estudio integer, item_trato_respeto integer,
 item_asistencia integer, item_puntualidad integer, item_participacion integer,
 item_dominio_materia integer, item_plataforma_moodle integer, item_pensamiento_critico integer,
 item_desafio_intelectual integer, item_claridad_objetivos integer, item_lecturas_aprendizaje integer,
 item_respeto_reglas integer, item_interes_materia integer, item_apoyos_didacticos integer,
 item_actitudes_valores integer, item_retroalimentacion integer, item_criterios_evaluacion integer,
 item_receptividad integer);
CREATE FUNCTION public.can_manage_coordinated_teacher(integer, integer) RETURNS boolean
 LANGUAGE sql STABLE AS 'SELECT false';
INSERT INTO public.cuatrimestres VALUES (1,true,false);
INSERT INTO public.docentes VALUES (1),(99);
INSERT INTO public.asignaturas VALUES (1);
INSERT INTO public.grupos VALUES (1,1,1,1,true),(2,1,1,1,true),(3,1,1,1,true);
INSERT INTO public.student_cd07_fixture_authorization
 (cuatrimestre_id,grupo_id,docente_id,asignatura_id,instrument_code,assignment_revision)
 VALUES (1,2,1,1,'SED-360-INST-EST-CD-07-V1.1','synthetic-r1');
"""
# Registry insert is executed only after 104–109 have been installed.
SETUP_BASE, FIXTURE_ROW = SETUP.split('INSERT INTO public.student_cd07_fixture_authorization', 1)
FIXTURE_ROW = 'INSERT INTO public.student_cd07_fixture_authorization' + FIXTURE_ROW

SCORE_ASSERT = r"""
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $check$
DECLARE n integer; s numeric; v text;
BEGIN
 SELECT count(*), max(score_normalizado), max(version_calculo) INTO n,s,v
 FROM public.obtener_scores_encuesta_estudiantil_nativa(1);
 IF n <> 1 OR s <> 50 OR v IS DISTINCT FROM 'native-19-v2' THEN
   RAISE EXCEPTION 'synthetic score assertion failed';
 END IF;
END $check$;
"""

DISABLE_FIXTURE = 'UPDATE public.student_cd07_fixture_authorization SET docente_id=99 WHERE grupo_id=2;'

STALE_ASSERT = r"""
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $check$
DECLARE caught boolean := false;
BEGIN
 BEGIN
   PERFORM public.obtener_scores_encuesta_estudiantil_nativa(1);
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM IS DISTINCT FROM 'Invalid fixture assignment registration' THEN
     RAISE;
   END IF;
   caught := true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'stale fixture unexpectedly accepted'; END IF;
END $check$;
"""

RESTORE_FIXTURE = 'UPDATE public.student_cd07_fixture_authorization SET docente_id=1 WHERE grupo_id=2;'

ANON_ASSERT = r"""
SELECT set_config('request.jwt.claim.role','anon',false);
DO $check$
DECLARE caught boolean := false; error_state text;
BEGIN
 BEGIN
   PERFORM public.obtener_scores_encuesta_estudiantil_nativa(1);
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS error_state = RETURNED_SQLSTATE;
   IF error_state IS DISTINCT FROM '42501' OR SQLERRM IS DISTINCT FROM 'authorized role required' THEN
     RAISE;
   END IF;
   caught := true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'anonymous request unexpectedly accepted'; END IF;
END $check$;
"""


def main():
    run(['docker', 'image', 'inspect', IMAGE], stage='docker image')  # never pull
    started = False
    try:
        run(['docker', 'run', '-d', '--rm', '--network', 'none', '--name', NAME,
             '-e', 'POSTGRES_PASSWORD=synthetic-local-only', IMAGE], stage='startup')
        started = True
        for _ in range(20):
            if run(['docker', 'exec', NAME, 'pg_isready', '-U', 'postgres'], stage='startup', allow_failure=True).returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('startup: readiness timeout')
        psql(SETUP_BASE, stage='stub setup')
        for number in range(104, 110):
            files = list((ROOT / 'supabase/migrations').glob(f'{number}_cd07_*.sql'))
            if len(files) != 1:
                raise RuntimeError(f'migration {number}: file count mismatch')
            psql(files[0].read_text(), stage=f'migration {number}')  # separate connection for GraphQL event-trigger OIDs
        psql(FIXTURE_ROW, stage='fixture rows')
        psql(r"""
INSERT INTO public.student_cd07_real_assignment_manifest
 (cuatrimestre_id,grupo_id,docente_id,asignatura_id,assignment_revision)
 VALUES (1,3,1,1,'synthetic-r1');
""", stage='fixture rows')
        psql(r"""
INSERT INTO public.encuesta_estudiantil_respuestas
 (id,cuatrimestre_id,grupo_id,docente_id,calidad_general,item_plan_estudio,item_trato_respeto,
 item_asistencia,item_puntualidad,item_participacion,item_dominio_materia,item_plataforma_moodle,
 item_pensamiento_critico,item_desafio_intelectual,item_claridad_objetivos,item_lecturas_aprendizaje,
 item_respeto_reglas,item_interes_materia,item_apoyos_didacticos,item_actitudes_valores,
 item_retroalimentacion,item_criterios_evaluacion,item_receptividad)
 SELECT g,1,g,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3 FROM generate_series(1,3) g;
""", stage='fixture rows')
        psql(SCORE_ASSERT, stage='synthetic score assertions')
        psql(DISABLE_FIXTURE, stage='disable fixture')
        psql(STALE_ASSERT, stage='stale fixture assertions')
        psql(RESTORE_FIXTURE, stage='restore fixture')
        psql(ANON_ASSERT, stage='anonymous role assertions')
        print('PASS: isolated synthetic score fixture')
    finally:
        if started:
            try:
                    run(['docker', 'stop', '-t', '1', NAME], stage='cleanup', allow_failure=True)
                    cleanup_deadline = min(DEADLINE, time.monotonic() + 5)
                    while run(['docker', 'inspect', NAME], stage='cleanup', allow_failure=True).returncode == 0:
                        if time.monotonic() >= cleanup_deadline:
                            raise RuntimeError('cleanup: container still exists')
                        time.sleep(min(0.2, max(0, cleanup_deadline - time.monotonic())))
            except RuntimeError:
                print('CLEANUP FAILED: inspect local Docker container', file=sys.stderr)
                raise


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        sys.exit(1)
