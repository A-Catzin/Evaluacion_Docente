# Cambio reemplazado: las migraciones 104–109 no se aplican

**Estado:** Reemplazado el 2026-10-15. No continuar este cambio ni aplicar sus migraciones.
**Reemplazado por:** migraciones `110`, `111` y `112` (ya aplicadas en la base de datos de producción).

## Qué se eliminó

| Archivo | Propósito original |
|---|---|
| `supabase/migrations/104_cd07_response_storage.sql` | Tabla separada `encuesta_estudiantil_cd07_respuestas` con columna de origen `real`/`fixture` |
| `supabase/migrations/105_cd07_real_assignment_manifest.sql` | Manifiesto privado de asignaciones reales con aprobación firmada |
| `supabase/migrations/106_cd07_fixture_authorization.sql` | Autorización del grupo de prueba TEST-CD como *fixture* |
| `supabase/migrations/107_cd07_assignment_origin.sql` | Clasificador `cd07_verified_assignment_origin` (general / real / fixture / unavailable) |
| `supabase/migrations/108_cd07_progress_fixture_guard.sql` | Reemplazo de `obtener_progreso_encuesta_estudiantil_nativa` |
| `supabase/migrations/109_cd07_native_score_fixture_guard.sql` | Reemplazo de `obtener_scores_encuesta_estudiantil_nativa` |
| `src/lib/cd07*Migration.test.ts` (6) y `tests/db/cd07_native_score_fixture.py` | Pruebas estáticas y arnés local de esas migraciones |

Se quitaron sus excepciones en `.gitignore`. Nunca se aplicaron en la base de datos: el registro de migraciones no tiene ninguna, ni existen sus tablas o funciones.

## Por qué no se aplican

1. **Romperían las funciones en producción.** Las migraciones 108 y 109 reescriben las funciones de avance y de calificación copiando su versión anterior al 2026-10-15. Si se aplicaran, borrarían lo que agregaron 110–112:
   - el filtro `encuesta_estudiantil_habilitada` (grupos con encuesta deshabilitada);
   - la suma de las respuestas CD-07, PP-04, SIM-05 y CC-06 a la calificación estudiantil.
2. **El modelo de datos es incompatible.** La 104 guarda CD-07 en una tabla aparte. La solución aplicada guarda los cuatro instrumentos en `encuesta_estudiantil_respuestas` (columnas `instrumento` y `respuestas_instrumento`). Así siguen funcionando sin cambios el avance, los comentarios, el recálculo y el borrado de ciclos de prueba. Con dos tablas, estos consumidores tendrían que leer de ambas.
3. **Solo cubría CD-07.** El diseño (manifiesto, *fixture*, clasificador) era exclusivo de CD-07. La solución aplicada usa una columna por grupo, `grupos.instrumento_encuesta`, que sirve para los cuatro instrumentos.
4. **Su modelo de activación no se adoptó.** El plan dejaba la activación bloqueada por un manifiesto con aprobación firmada y un registro *fixture* aparte para TEST-CD. Se decidió una versión simple: el responsable indica los grupos con un CSV, se validan contra la base de datos y se marcan en `grupos`. Los grupos de prueba (TEST-CD, TEST-PP, TEST-SIM, TEST-CC) son grupos normales del docente de prueba.

## Lo que sí se conserva de este cambio

- Las preguntas de los instrumentos en `src/lib/studentEvaluationDraftForms.ts` (verificadas contra los PDF de `docs-privados/Nuevas_Evaluaciones_Est`).
- El validador del envío, ahora `InstrumentoEspecializadoSchema` en `src/lib/validation/apiSchemas.ts`.

## Diferencias con los PDF oficiales (decididas por el responsable)

- Escala **1–5**, igual que la encuesta general. Los PDF usan 4 opciones.
- Pregunta 21: **comentario opcional**. En los PDF es una valoración global de opción múltiple.
- Puntaje: **(promedio − 1) × 25**, sobre 0–100. Los PDF usan suma ÷ 80 × 100.

## Solución aplicada

| Migración | Contenido |
|---|---|
| `110_student_survey_group_opt_out.sql` | `grupos.encuesta_estudiantil_habilitada`: deshabilita la encuesta por grupo y conserva las respuestas previas |
| `111_cd07_student_survey.sql` | `grupos.instrumento_encuesta`, columnas de instrumento en las respuestas, envío y calificación de CD-07 |
| `112_specialized_student_surveys.sql` | Generaliza a PP-04, SIM-05 y CC-06: `enviar_encuesta_estudiante_instrumento` y calificación con (promedio − 1) × 25 |

Cualquier cambio futuro a `obtener_progreso_encuesta_estudiantil_nativa` u `obtener_scores_encuesta_estudiantil_nativa` debe partir de la versión que está en producción (después de 112), no de las migraciones de este cambio.
