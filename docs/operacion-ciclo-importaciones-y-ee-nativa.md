# Operación del ciclo, importaciones y evaluación estudiantil nativa

Este runbook es la referencia operativa del estado implementado. Permite preparar un ciclo, importar su padrón y carga académica, y verificar la evaluación estudiantil nativa sin exponer respuestas individuales.

## Ruta rápida

1. Confirme que las migraciones 030–036 estén aplicadas en el ambiente correspondiente; que los archivos existan en el repositorio no confirma su aplicación en producción.
2. Seleccione el ciclo en la aplicación.
3. Importe docentes, el padrón completo de estudiantes y las asignaciones grupo-asignatura-docente, en ese orden.
4. Al finalizar la importación de asignaciones, el sistema recalcula automáticamente `calificaciones_finales` de los docentes afectados y refresca `resultados_agregados`.
5. Revise los reportes de importación y `/admin/grupos-asignados` antes de abrir el ciclo a estudiantes.
6. Compruebe el progreso agregado y la columna `Est.` de los docentes; no consulte respuestas ni comentarios individuales.

## Migraciones requeridas después de la línea base

| Migración | Efecto | Verificación operativa |
| --- | --- | --- |
| 030 | Identidad normalizada de grupos e inscripción única por estudiante, grupo y ciclo | El padrón del ciclo no duplica inscripciones y los grupos tienen identidad normalizada. |
| 031 | Bitácora de importaciones, incidencias y normalización de docentes | Cada importación deja `import_runs` e `import_issues` revisables. |
| 032 | Resolver de roles en autenticación | Una identidad de padrón activa y única recibe `docente` o `estudiante`. |
| 033 | Trigger y retrocarga para usuarios pendientes | `usuarios` vincula el UUID de Auth con la identidad de padrón, sin poblarse desde el padrón. |
| 034 | Consulta y envío nativo seguro de evaluación estudiantil | El estudiante sólo ve grupos asignados del ciclo activo y no puede reenviar. |
| 035 | Progreso nativo agregado para personal | Administración y coordinación ven conteos, nunca respuestas, comentarios ni vínculo estudiante-respuesta. |
| 036 | Puntaje nativo inicial y retiro de Saeko | Base histórica del puntaje nativo; la escala vigente queda definida por 043. |
| 037 | Versión de instrumento en observaciones | Las observaciones de clase registran la versión del instrumento usado. |
| 038 | Calificaciones finales precalculadas, snapshot de modalidad y vista materializada | Existen `calificaciones_finales`, `docente_modalidad_historica` y `resultados_agregados`; los dashboards leen de la vista materializada. |
| 039 | RPC de scoring con `SECURITY DEFINER` | El recálculo puede persistir su resultado sin depender de una política RLS de la sesión que capturó el instrumento. |
| 040 | Trazabilidad, manifiestos lógicos y recibos personales | Existen `audit_events`, `change_sets` y `restore_points`; los importadores compatibles crean un conjunto y manifiesto antes de mutar datos, cada envío nativo completado deja un evento protegido y el personal elegible consulta sólo sus propios recibos. |
| 041 | Visibilidad agregada y envíos de planeación | Administración consulta entregas estudiantiles agrupadas; planeaciones conserva el primer y último envío del docente. Requiere 040 antes de aplicarse. |
| 042 | Avisos institucionales | Avisos separados de las notificaciones personales, con alcance por rol/ciclo, RPCs y auditoría segura explícita. Requiere 040 antes de aplicarse. |
| 043 | Escala nativa uniforme 1–5 | Elimina de forma destructiva los datos nativos heredados de prueba, aplica restricciones 1–5 y usa `native-19-v2`. |
| 044 | Corrección de timestamp de entregas | Usa `fecha_envio` en el resumen administrativo de entregas. |
| 045 | Corrección de tipos del resumen | Declara y convierte explícitamente los tipos devueltos por la RPC del resumen. |
| 046 | Borrado duro seguro de ciclos de prueba | Añade `es_prueba`, vista previa, confirmación exacta validada en servidor, eliminación transaccional explícita y limpieza diferida de almacenamiento. Requiere 040–045. |
| 047 | Diagnóstico seguro de borrado de prueba | Conserva los controles de 046 y devuelve códigos distintos para ciclo activo, sin marca, confirmación incorrecta y guardia de dependencias. Requiere 046. |
| 048 | Clausura FK completa de borrado de prueba | Incluye `calificacion_final_docente` heredada, conserva el borrado explícito hijo-padre y restringe la lista aprobada al inventario FK vivo. Requiere 046–047. |
| 049 | Borrado de prueba escalable con auditoría resumida | Agrega el índice de cadena de auditoría y suprime sólo eventos de fila dentro de la transacción validada de `delete_test_cycle`; conserva un resumen seguro al confirmar. Requiere 040 y 046–048. |
| 050 | Acceso a entregas de planeación | Agrega ventana manual o programada por cuatrimestre, cerrada por defecto, con protección de escritura en base de datos y rutas de carga. Requiere 040, 041 y 049. |
| 051 | Asignaciones separadas de coordinación y observación | Reemplaza `coordinador_docentes` como fuente de autorización por relaciones con historial, backfill revisable y RPCs de mínimo privilegio. Requiere 050. |
| 052 | Administración y sorteo de asignaciones de observación | Agrega búsqueda de docentes por ciclo, revocación masiva, preferencias por evaluador, vista previa con semilla y confirmación transaccional. Requiere 051. |
| 053 | Reparación de evaluadores de observación | Requiere cuenta Auth y perfil activos, muestra diagnósticos agregados de perfiles no resueltos y evita que un error de RPC aparezca como lista vacía. Requiere 052. |
| 054 | Contrato del RPC de evaluadores | Fuerza los tipos declarados de retorno de `admin_observation_allocation_evaluators`, preserva el acceso sólo para `authenticated` y recarga PostgREST. Requiere 052–053. |

Después de aplicar en un ambiente una migración que agregue o cambie RPC, recargue la caché de esquema de PostgREST:

```sql
NOTIFY pgrst, 'reload schema';
```

## Eliminar un ciclo de prueba

El borrado duro no es una acción normal de administración. Sólo existe para datos de prueba y es permanente: elimina el ciclo y sus filas operativas asociadas. No hay restauración desde la aplicación.

### Condiciones obligatorias

1. Aplique las migraciones en orden, incluido `049_optimize_test_cycle_delete_audit.sql`. Nunca edite las migraciones ya aplicadas para incorporar este comportamiento.
2. Inicie sesión como `superadmin` y cierre o desactive el ciclo. Un ciclo activo no se puede marcar ni eliminar como prueba.
3. En `/admin/cuatrimestres`, use **Marcar como prueba** y escriba exactamente la etiqueta mostrada, por ejemplo `26-1 - Pruebas`.
4. Use **Eliminar ciclo de prueba**, revise los conteos previos y escriba de nuevo esa misma etiqueta. La coincidencia se compara dentro de la RPC con la identidad actual guardada en la base; el cuadro de diálogo del navegador no autoriza por sí solo.

### Dependencias revisadas

`049` conserva el borrado explícito de `048`; no usa `ON DELETE CASCADE`. Antes de borrar, recorre las FK reales de `pg_constraint` desde `cuatrimestres`. Si aparece una relación que no está en la lista revisada o cuya condición de alcance no está definida, la transacción falla sin cambios.

| Alcance | Filas operativas eliminadas cuando pertenecen al ciclo |
| --- | --- |
| Grupos y matrícula | `grupos`, `inscripciones`, `coordinador_docentes`, `import_runs`, `import_issues` |
| Evaluación estudiantil | `encuesta_control_envio`, `encuesta_estudiantil_respuestas`, `encuesta_estudiantil` heredada |
| Instrumentos y capturas | `evaluacion_coordinacion`, `evaluacion_planeacion`, `observacion_clase`, `autoevaluacion_docente`, `planeaciones`, `observaciones`, `autodiagnosticos` |
| Resultados y comunicación | `docente_360_feedback`, `docente_modalidad_historica`, `calificacion_final_docente` heredada, `calificaciones_finales`, `institutional_notices` |
| Configuración de entregas | `planning_submission_windows` |
| Auditoría y recuperación | `audit_events`, `change_sets` y `restore_points` se conservan. `change_sets.cuatrimestre_id` no es FK y `restore_points`/`audit_events` dependen de `change_sets`, no del ciclo. |

Los catálogos compartidos (`docentes`, `estudiantes`, `asignaturas`, `instrumento_preguntas`, ofertas y usuarios) no se eliminan: pueden pertenecer a otros ciclos. La eliminación de las inscripciones, controles y respuestas del ciclo elimina los datos estudiantiles operativos de prueba sin borrar identidades reutilizables.

### Auditoría y almacenamiento

Antes de eliminar filas, la RPC escribe un único resumen seguro `test_cycle.deleted`: contiene ID y etiqueta del ciclo, conteos por tabla y que la auditoría fue retenida. No incluye respuestas, comentarios, identidades de estudiantes, correos ni rutas de archivo. `049` omite los eventos de fila sólo mientras borra el alcance validado de ese ciclo: usa un contexto privado de la transacción, vinculado al superadmin y al backend, que se elimina antes de retornar y expira al terminar la transacción. Los eventos append-only existentes tampoco se eliminan ni se modifican; esa retención es la evidencia mínima de que hubo una eliminación permanente.

Los PDF de `planeaciones` y las imágenes de `institutional_notices` se registran como tareas de limpieza dentro de la misma transacción. El endpoint elimina únicamente referencias que coinciden exactamente con el prefijo R2 o Supabase Storage configurado. Si el proveedor falla o una URL no puede verificarse como propia, la base ya fue eliminada pero la tarea queda con estado pendiente o fallido para limpieza manual; no se borran objetos de rutas externas o ambiguas. Un superadmin puede reintentar sin exponer las rutas mediante `POST /api/admin/cuatrimestres` con `{"action":"retry_test_storage_cleanup","id":<id_del_ciclo_eliminado>}`.

### Verificación funcional

1. Cree un ciclo de prueba inactivo con grupos, una inscripción, una evaluación y, si corresponde, una planeación o aviso.
2. Intente eliminarlo sin marcarlo: debe fallar. Intente marcarlo mientras está activo: debe fallar.
3. Márquelo como prueba con una confirmación distinta: debe fallar. Repita con la etiqueta exacta: debe mostrarse como `Prueba`.
4. Abra la eliminación: los conteos deben corresponder al ciclo elegido e incluir `Calificaciones finales heredadas` cuando exista `calificacion_final_docente`. Una confirmación distinta debe fallar aunque el cliente la envíe manualmente.
5. Confirme con la etiqueta exacta y compruebe que el ciclo, grupos, matrícula, respuestas, instrumentos, resultados y filas heredadas del ciclo ya no existen.
6. En `/admin/trazabilidad`, compruebe que permanece el evento seguro de resumen y que no se borraron eventos ni conjuntos de cambio previos.
7. Revise `test_cycle_storage_cleanup` sólo mediante las RPC de superadmin si el endpoint informó archivos pendientes; resuelva los fallos sin asumir que una URL externa pertenece al bucket.

### Diagnóstico de errores de eliminación

La respuesta JSON de `POST /api/admin/cuatrimestres` conserva un mensaje seguro para la interfaz y un código estable para soporte. No muestra detalles de relaciones, datos operativos ni rutas de archivos.

| Código | Acción segura |
| --- | --- |
| `test_cycle_active` | Cierre o desactive el ciclo y vuelva a cargar la página. |
| `test_cycle_unmarked` | Márquelo como prueba usando la etiqueta exacta antes de intentar eliminarlo. |
| `test_cycle_confirmation_mismatch` | Copie la etiqueta actual mostrada por la UI, incluidos espacios y nombre. |
| `test_cycle_rpc_missing` | Aplique las migraciones pendientes, en especial 046–049, y recargue la caché de PostgREST. |
| `test_cycle_dependency_guard` | No reintente ni elimine manualmente. Revise la clausura de FK y agregue una migración explícita para cualquier dependencia nueva. |
| `test_cycle_retryable` (`503`) | Espere y reintente una sola vez. Un timeout, bloqueo temporal o conflicto de serialización revierte toda la transacción: no hubo eliminación parcial ni resumen durable. |
| `test_cycle_failed` | Revise los logs protegidos del servidor con el momento de la solicitud; la transacción no debe haber eliminado parcialmente el ciclo. |

### Despliegue compatible

1. Verifique en el historial de migraciones del proyecto Supabase que 040–048 estén registradas. Si falta alguna, detenga el despliegue y reconcilie las migraciones en orden; no publique la UI contra una base sin esas RPC.
2. Aplique solamente `049_optimize_test_cycle_delete_audit.sql` en la base de destino. No aplique 043 sin confirmar que su limpieza destructiva ya fue autorizada y ejecutada.
3. Confirme que existe `idx_audit_events_integrity_order` sobre `(occurred_at DESC, event_id DESC)`, que `delete_test_cycle(integer,text)` fue reemplazada y que `NOTIFY pgrst, 'reload schema'` se ejecutó.
4. Despliegue el código de aplicación que devuelve `test_cycle_retryable` con `503`. La base debe actualizarse antes o junto con la UI, nunca después.
5. Como superadmin, abra el preview del ciclo grande restante, registre sus conteos y confirme la etiqueta exacta una sola vez. Si devuelve `503`, espere y vuelva a abrir el preview antes de reintentar; no ejecute `DELETE` manual ni aumente el timeout.
6. Tras éxito, confirme que el ciclo y sus filas con alcance ya no existen, que `/admin/trazabilidad` contiene exactamente un nuevo `test_cycle.deleted` con el mismo ID y conteos, y que las tareas de `test_cycle_storage_cleanup` quedan visibles para procesar. Verifique que no se añadieron eventos por fila de ese borrado.

## Importar un ciclo

## Ventana de entrega de planeaciones

La recepción de planeaciones se controla por cuatrimestre desde `/admin/planeaciones/acceso`. Un superadmin elige una sola modalidad: apertura manual, cierre manual o ventana programada con inicio y cierre. La ausencia de registro equivale a cierre. Coordinación y superadministración pueden evaluar planeaciones ya existentes aunque la recepción esté cerrada.

1. Aplique `050_teacher_planning_access_window.sql` después de `049` y recargue la caché de PostgREST.
2. Abra `/admin/planeaciones/acceso?cuatrimestre=<id>` y seleccione el cuatrimestre correcto.
3. Para una ventana programada, capture ambos campos como hora local de `America/Cancun`; por ejemplo, del día 16 a las 00:00 al día 30 a las 23:59. El sistema abre al inicio y cierra al llegar al fin.
4. Verifique con una cuenta docente que, al cierre, siga visible el historial, PDF y retroalimentación, pero no aparezcan formularios ni reenvíos. Un intento directo de escritura debe responder `planning_submissions_closed`.
5. Verifique con una cuenta de coordinación o superadministración que una evaluación de planeación existente siga siendo posible durante el cierre.

La protección no depende de la interfaz: los tres endpoints docentes revisan el estado antes de leer bytes del archivo y la base de datos valida identidad docente, grupo, asignatura y ciclo en cada inserción, actualización o eliminación. Las rutas de los PDF se generan en el servidor; no se aceptan rutas de almacenamiento enviadas por el cliente.

Al borrar un ciclo de prueba, el preview incluye `planning_submission_windows` y la RPC la elimina explícitamente antes de `cuatrimestres`. El evento de cambio de ventana sólo registra el ciclo, modalidad y presencia de límites; no registra texto libre, rutas ni datos personales.

## Asignaciones de coordinación y observación

La migración `051_split_coordinator_teacher_relationships.sql` separa los dos propósitos por ciclo. Aplíquela antes de desplegar la interfaz que usa las nuevas RPC; no se deben editar ni reaplicar migraciones anteriores.

1. Aplique `051` después de `050` y ejecute `NOTIFY pgrst, 'reload schema';`.
2. Como superadmin, abra `/admin/asignaciones?cuatrimestre=<id>`. Revise el bloque de estado del backfill antes de cambiar asignaciones.
3. En **Docentes coordinados**, asigne únicamente coordinadores activos. Esta relación permite información, resultados, planeación, evaluación de coordinación, notificaciones y reportes del docente en ese ciclo.
4. En **Docentes para observación**, asigne coordinadores u observadores activos. Esta relación permite sólo la captura de observación y los datos mínimos de docente/grupo; no habilita resultados, planeaciones ni reportes.
5. Pruebe con una cuenta coordinadora asignada sólo para coordinación: debe poder gestionar planeación/coordinación, pero la observación debe rechazarla. Pruebe con una cuenta observadora: debe listar sólo sus docentes de observación y no ver resultados ni PDF de planeación.

En `/coordinador/dashboard?cuatrimestre=<id>`, la cuenta coordinadora ve dos portafolios independientes: **Docentes coordinados** incluye únicamente evaluación de coordinación, planeaciones y resultados; **Docentes para observar** incluye únicamente la acción de observación. Un docente sólo aparece en ambos cuando tiene ambas asignaciones activas para ese ciclo.

La migración conserva `coordinador_docentes` como historial compatible. Para cada fila legada con ciclo, registra una revisión: coordinadores activos se migran a `coordinated_teacher_assignments`, observadores activos a `observation_teacher_assignments`; actores, docentes o roles no elegibles quedan como `needs_review`. Una fila coordinada legada nunca crea una asignación de observación. Las asignaciones se revocan con fecha y actor, no se eliminan, y el evento de auditoría sólo incluye tipo, ciclo y conteos.

El preview y la eliminación de ciclos de prueba incluyen `coordinated_teacher_assignments`, `observation_teacher_assignments`, `teacher_assignment_backfill_review`, `observation_allocation_preferences`, `observation_allocation_previews` y `observation_allocation_runs`. Si la guardia de dependencias falla, no ejecute `DELETE` manual: agregue una migración forward que actualice la clausura explícita.

### Administración y distribución de observaciones

`052_admin_assignment_allocation.sql` se aplica después de `051`. `053_fix_observation_allocation_evaluators.sql` corrige la detección de evaluadores y `054_fix_observation_evaluator_rpc_return_contract.sql` corrige el contrato de retorno de su RPC; se aplican después de 052 y en ese orden. No se renumera ni edita una migración ya aplicada.

No hay backfill automático de observaciones en 052: las asignaciones existentes permanecen manuales e inalteradas, y la ausencia de una preferencia equivale a incluir al evaluador elegible sin meta. Sólo una confirmación explícita crea filas con origen `automatic_allocation`.

1. Aplique `052`, `053` y `054`, recargue la caché de PostgREST y despliegue la interfaz de `/admin/asignaciones` en la misma ventana. La interfaz nueva no debe publicarse contra una base sin las RPC de las tres migraciones.
2. En ambos bloques manuales, **Docentes del cuatrimestre** es el filtro inicial: incluye sólo docentes activos con al menos un grupo activo asignado en el ciclo seleccionado. Use **Todos los docentes activos** únicamente para localizar una asignación fuera de actividad actual o completar una revisión.
3. **Asignar selección** sólo agrega o reactiva las filas elegidas. **Quitar selección** exige confirmación y revoca sólo las asignaciones activas seleccionadas de ese ciclo. Nunca borra docentes, usuarios, grupos, instrumentos ni capturas; la revocación conserva fecha y actor.
4. En la asignación automática, los evaluadores elegibles son cuentas activas con rol `superadmin` (mostrado como **Administrador**), `coordinador` u `observador`. Excluir una cuenta impide nuevas asignaciones automáticas, pero conserva la cuenta y sus asignaciones manuales.
5. Guarde las preferencias antes de crear la vista previa. Una meta vacía participa en el reparto del remanente; una meta explícita se cubre primero sin revocar una carga previa que ya la supere. La confirmación acepta sólo el identificador, huella y ciclo emitidos por el servidor; si cambian las preferencias, los candidatos o las asignaciones actuales, genere otra vista previa.

### Verificación manual de 052

1. En un ciclo de prueba, prepare 24 docentes activos con al menos un grupo activo cada uno y tres o más evaluadores elegibles activos.
2. Configure metas explícitas que sumen 10, por ejemplo 4 y 6, y deje al menos dos evaluadores incluidos sin meta. Guarde la configuración y genere la vista previa.
3. Compruebe que las metas reciben exactamente 10 propuestas antes del remanente y que los 14 docentes restantes se reparten entre los evaluadores sin meta con diferencia máxima de una asignación cuando sus cargas previas lo permiten.
4. Excluya un evaluador con asignaciones manuales, genere otra vista previa y compruebe que recibe cero propuestas, conserva sus asignaciones y no se desactiva.
5. Confirme una vista previa y repita la misma confirmación: debe devolver el mismo recibo de ejecución sin insertar asignaciones duplicadas. Cambie una preferencia o agregue una asignación manual antes de confirmar otra vista previa: debe rechazarse como vencida o desactualizada.
6. Seleccione varias asignaciones coordinadas y varias de observación, confirme **Quitar selección** y compruebe los conteos devueltos. Verifique que docentes, usuarios, grupos y capturas históricas sigan intactos.
7. Verifique que un `coordinador` activo y resuelto sin asignaciones previas aparezca en la tabla de distribución. Si la carga de evaluadores falla, la pantalla debe mostrar la incompatibilidad de migración en lugar de una tabla vacía. Si no existen elegibles, el diagnóstico sólo muestra conteos de perfiles/cuentas, no nombres ni correos.

### Diagnóstico seguro del RPC de evaluadores

La pantalla no muestra datos parciales cuando el RPC falla. Para un superadmin autenticado muestra sólo un código seguro `EVAL_RPC_*` y una causa accionable. `EVAL_RPC_42804` confirma un contrato de retorno incompatible y requiere `054`.

Ejecute estas consultas de sólo lectura en Supabase SQL Editor. No requieren correo, UUID, nombre ni datos de cuenta:

```sql
-- Debe devolver una sola firma, el resultado declarado y execute_for_authenticated = true.
SELECT
  p.oid::regprocedure AS signature,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_contract,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS execute_for_authenticated
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_observation_allocation_evaluators';
```

```sql
-- Confirma que no existe una sobrecarga inesperada y que PostgREST ve exactamente integer.
SELECT p.oid::regprocedure AS signature
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_observation_allocation_evaluators'
ORDER BY p.oid::regprocedure::TEXT;
```

```sql
-- Verifica el contrato almacenado de 054 sin mostrar cuerpos, usuarios ni secretos.
SELECT
  position('u.email::TEXT' IN pg_get_functiondef(p.oid)) > 0 AS email_cast_present,
  position('u.rol::TEXT' IN pg_get_functiondef(p.oid)) > 0 AS role_cast_present,
  position('count(a.id)::BIGINT' IN pg_get_functiondef(p.oid)) > 0 AS count_cast_present
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_observation_allocation_evaluators'
  AND pg_get_function_identity_arguments(p.oid) = 'p_cuatrimestre_id integer';
```

Una llamada desde SQL Editor no reproduce la identidad de una solicitud PostgREST: `auth.uid()` no contiene la sesión del superadmin. Para ejecutar la ruta real, inicie sesión como superadmin y use un token de acceso vigente sólo en una terminal segura:

```bash
curl --fail-with-body --request POST "$SUPABASE_URL/rest/v1/rpc/admin_observation_allocation_evaluators" \
  --header "apikey: $SUPABASE_ANON_KEY" \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"p_cuatrimestre_id":1}'
```

Use un identificador de ciclo existente en lugar de `1`. La respuesta esperada es una lista de evaluadores o un error HTTP con código PostgreSQL/PostgREST; no comparta el token, las cabeceras ni la respuesta si incluye datos de cuenta.

El ciclo se elige en la aplicación. Ningún CSV crea ni selecciona ciclos; su columna `CICLO`, si existe, sólo sirve para detectar diferencias o mezclas.

| Orden | Importación | Resultado esperado |
| --- | --- | --- |
| 1 | Docentes | Catálogo de docentes actualizado mediante correo o número de empleado estable. |
| 2 | Padrón completo de estudiantes | Estudiantes e inscripciones del ciclo seleccionado; el CSV requiere `NOMBRE COMPLETO`. |
| 3 | Asignaciones | Grupos, asignaturas y docentes conciliados de forma normalizada y segura. |
| 4 | Revisión | Reportes de ejecución, incidencias y `/admin/grupos-asignados` sin pendientes críticos. El sistema ya recalculó `calificaciones_finales` y refrescó `resultados_agregados`. |

### Recálculo automático de calificaciones

La importación de asignaciones ejecuta `recalcularCalificacionesCuatrimestre` al concluir, con `refrescarAgregados: true`. Esto genera o actualiza las filas de `calificaciones_finales` para los docentes con grupos en el ciclo y refresca `resultados_agregados`. Si el proceso reporta errores, revise los logs del endpoint y vuelva a ejecutar la importación o invoque manualmente el refresh (ver siguiente sección).

### Controles de conciliación

- Use el padrón completo, no una muestra, para conservar las inscripciones del ciclo.
- Revise `import_runs` e `import_issues` después de cada archivo. Las incidencias son datos por resolver, no coincidencias que el sistema deba adivinar.
- En `/admin/grupos-asignados`, revise las pestañas de asignados, incidencias de conciliación y grupos sin información de carga académica.
- La asignación compara identidades normalizadas; no usa coincidencias difusas para vincular estudiantes, grupos, materias o docentes.

## Trazabilidad y recuperación de Fase 1

`/admin/trazabilidad` es de sólo lectura y está disponible únicamente para superadmin. Permite filtrar eventos seguros, conjuntos de cambios, envíos nativos protegidos y metadatos de los puntos lógicos creados antes de importar docentes, padrón de alumnos o asignaciones.

El personal consulta sus propios recibos, también de sólo lectura, en `/docente/mi-actividad`, `/coordinador/mi-actividad` y `/observador/mi-actividad`. Cada recibo confirma que una acción fue registrada, no que una calificación o resultado posterior permanezca sin cambios. No hay reversiones disponibles en la Fase 1.

| Concepto | Alcance en Fase 1 |
| --- | --- |
| Auditoría | `audit_events` es append-only y tiene cadena de integridad. Registra operación, origen, actor autenticado cuando la sesión lo provee, identidad segura del registro y campos seguros. Los UUID de actores estudiantes se conservan sólo en la tabla de auditoría y la RPC del panel los sustituye por `Actor protegido`. |
| Recibos personales | `audit_list_my_activity` fija el actor en `auth.uid()` y valida el rol activo en `usuarios`; no acepta un actor como parámetro. Docente, coordinador y observador ven únicamente los eventos de captura definidos para su rol, con fecha UTC, acción, instrumento, metadatos seguros, rol, UUID del evento y hash de integridad. Superadmin conserva el panel global en lugar de una vista personal duplicada. |
| Conjunto de cambios | `change_sets` registra el estado solicitado, en ejecución, completado o fallido de cada importación compatible. El hash y metadatos del archivo se guardan, no el archivo. Las importaciones ejecutadas con `service_role` se registran mediante este resumen y su punto lógico; no se presentan como correlación autenticada por fila. |
| Punto lógico | `restore_points` guarda un manifiesto acotado y sanitizado con alcance, conteos y hashes criptográficos previos a la mutación. No almacena respuestas, comentarios ni copias completas de la base. `execution_available` permanece en `false`. |
| Restauración | No hay botón de deshacer ni restauración automática. Cualquier reversión posterior debe verificar dependencias y concurrencia, tener aprobación explícita y crear eventos compensatorios. |
| PITR | Point-in-time recovery de Supabase es recuperación externa ante desastre, depende del plan y no es una acción del dashboard. No se configuró ni ejecutó en esta fase. |

Los objetos de Cloudflare R2 y Supabase Storage no se restauran con snapshots de la base. Requieren una estrategia separada de versionado, retención y prueba de recuperación antes de ofrecer una restauración completa.

### Matriz de cobertura de actividad

La cobertura se instala sólo sobre las tablas que existen al aplicar la migración. No reconstruye actividad histórica ni afirma cobertura universal de operaciones fuera de esta matriz.

| Actividad | Tabla o mecanismo | Acciones auditadas | Datos visibles en el panel |
| --- | --- | --- | --- |
| Catálogos, usuarios, docentes, estudiantes, grupos, inscripciones y asignaciones | `docentes`, `estudiantes`, `grupos`, `inscripciones`, `asignaturas`, `cuatrimestres`, `ofertas_academicas`, `coordinador_docentes`, `usuarios` | Inserción, actualización y eliminación | Actor no estudiantil cuando exista, operación, identidad segura y campos operativos permitidos. |
| Instrumentos y capturas de personal | `instrumento_preguntas`, `planeaciones`, `evaluacion_coordinacion`, `observaciones`, `autodiagnosticos`, `evaluacion_planeacion`, `observacion_clase`, `autoevaluacion_docente`, `calificaciones_finales` | Inserción, actualización y eliminación | Estado, relaciones y métricas operativas permitidas; no texto libre ni respuestas detalladas. |
| Retroalimentación global | `docente_360_feedback` | Inserción y actualización | Presencia de feedback o áreas de mejora, docente, ciclo y fecha; nunca el texto. |
| Notificaciones internas | `notificaciones` | Inserción y actualización de lectura | Tipo, fecha y estado de lectura; nunca título, mensaje, URL ni UUID de la persona destinataria. |
| Importaciones compatibles | `change_sets` y `restore_points` | Solicitud, captura, finalización o falla | Resumen seguro, hash del archivo y manifiesto acotado. No es una bitácora con actor autenticado por fila si interviene `service_role`. |
| Envío nativo de evaluación estudiantil | `encuesta_control_envio` mediante trigger especializado | Sólo inserción de un estudiante autenticado | `student_evaluation.submitted`, fecha/hora, ciclo, grupo y destino con hash. El panel muestra `Actor protegido`; nunca su UUID. |
| Recibo docente | `autodiagnosticos` y `planeaciones` mediante trigger de fila | Envío de autodiagnóstico, entrega o reenvío de planeación | Sólo el docente actor recibe su propio comprobante; ciclo, grupo o asignatura sólo cuando el campo seguro existe. La evaluación posterior de la planeación no modifica este comprobante. |
| Recibo de coordinación | `evaluacion_coordinacion`, `planeaciones` y `observaciones` mediante trigger de fila | Evaluación de coordinación, evaluación de planeación y observación enviada | Sólo el coordinador actor recibe su comprobante, con destino seguro mínimo. Los endpoints de captura usan un cliente de Supabase por solicitud con la sesión autenticada. |
| Recibo de observación | `observaciones` mediante trigger de fila | Observación de clase enviada | Sólo el observador actor recibe su comprobante, con ciclo, grupo o docente únicamente cuando el evento los contiene como metadatos seguros. |
| Feedback global | `docente_360_feedback` mediante trigger de fila | Alta o actualización del feedback | Se muestra en la trazabilidad global de superadmin. El formulario se guarda con la sesión autenticada del superadmin, no con `service_role`, para conservar la atribución. No crea un recibo personal duplicado. |

### Límites de privacidad de la encuesta

`encuesta_estudiantil_respuestas` queda excluida de los triggers de auditoría. No se registran valores de reactivos, comentario abierto, nombres, correos, matrícula, `estudiante_id` ni una relación directa entre un control de envío y una respuesta. El trigger especializado es diferido y se ejecuta al final de la transacción que crea el control de envío: el evento sólo es durable si el envío nativo confirma; si falla o se revierte, no queda evento de completado.

La identidad del actor de un trigger procede exclusivamente de `auth.uid()` en la base de datos. La aplicación no puede proporcionar ni sustituir actor, origen o destino para estos eventos.

### Exclusiones de los recibos personales

- No exponen eventos de otros actores, aunque compartan ciclo, grupo o docente.
- No incluyen actividad estudiantil ni eventos con semántica de actor protegido.
- No incluyen comentarios privados, respuestas, identidad estudiantil, credenciales, rutas de archivos ni los payloads de auditoría antes/después.
- No convierten operaciones históricas ejecutadas con `service_role` en actividad atribuida; sólo los resúmenes globales de importación permanecen disponibles para superadmin.

## Roles y resolución de identidad

Los roles de aplicación son `superadmin`, `coordinador`, `docente`, `estudiante` y `observador`. `pendiente` es un estado de acceso no resuelto, no un sexto rol operativo.

| Caso de inicio de sesión | Resultado |
| --- | --- |
| Coincidencia exacta, única y activa sólo en `estudiantes` | `estudiante`, con `entidad_id` del estudiante. |
| Coincidencia exacta, única y activa sólo en `docentes` | `docente`, con `entidad_id` del docente. |
| Coincidencia explícita de personal | Conserva `superadmin`, `coordinador` u `observador`. |
| Sin coincidencia, coincidencia múltiple o coincidencia simultánea de estudiante y docente | `pendiente`; no se infiere un rol. |

`usuarios` registra el UUID de Supabase Auth y su vínculo con la identidad de padrón. No es una copia prellenada de `estudiantes` ni `docentes`; se crea o revisa al autenticarse.

## Evaluación estudiantil nativa

El portal está disponible en `/estudiante/dashboard` y el formulario en `/estudiante/evaluar/[grupoId]`.

| Regla | Contrato implementado |
| --- | --- |
| Ventana | Sólo el ciclo activo. |
| Elegibilidad | Inscripción exacta del estudiante en el grupo de asignación activo, con docente y asignatura. Una inscripción sólo en el grupo base no habilita evaluación. |
| Envío | Máximo un envío completado por estudiante, grupo y ciclo. |
| Reactivos | 19 obligatorios, todos enteros de 1 a 5. |
| Comentario | Opcional, máximo 500 caracteres. |
| Seguridad | El servidor y las RPC derivan estudiante, docente, asignatura y ciclo; el cliente no decide esas identidades. |
| Trazabilidad | Al confirmar la transacción se audita el control de envío con fecha/hora, actor estudiante protegido, ciclo, grupo y destino con hash. No se auditan respuestas, comentario ni vínculo control-respuesta. |

## Puntaje y progreso

`native-19-v2` es la única fuente de `Est.` en todos los ciclos posteriores a 043. Cada uno de los 19 reactivos usa la misma escala 1–5 y se normaliza a 0–100. El puntaje del docente o materia es el promedio ponderado por cantidad de respuestas válidas.

- El puntaje aparece desde la primera respuesta válida.
- Sin respuesta nativa válida, `Est.` no está disponible y el avance es parcial; nunca se muestra como `0` ni se usa Saeko como respaldo.
- Los resúmenes de docentes mantienen el avance de los cinco instrumentos estándar y muestran el puntaje nativo como `Est.`.
- El progreso administrativo es agregado: inscripciones elegibles, controles enviados y respuestas nativas. Las respuestas, comentarios y enlaces a estudiantes no son datos de interfaz para personal.
- En administración, `Ver` dirige a la ruta de detalle. El modal individual y el control de visibilidad anterior fueron retirados.
- Los dashboards de admin y coordinador leen de `resultados_agregados`. Si la vista materializada está desactualizada, los scores no reflejarán la última captura hasta el próximo refresco. El recálculo por importación de asignaciones refresca la vista; las capturas individuales actualizan `calificaciones_finales` pero no la vista automáticamente.

## Actualizar `resultados_agregados` manualmente

Si se capturan evaluaciones individuales después de una importación y los dashboards no reflejan los cambios, el superadmin puede refrescar la vista materializada mediante el endpoint:

```
GET /api/admin/refrescar-resultados?periodo=<opcional>
```

El endpoint ejecuta `REFRESH MATERIALIZED VIEW` sobre `resultados_agregados` y redirige de vuelta al dashboard. Úsese cuando se requiera consistencia inmediata entre `calificaciones_finales` y los dashboards.

## Backfill y datos de prueba

La migración 043 elimina deliberadamente todas las filas de `encuesta_estudiantil_respuestas` y `encuesta_control_envio` antes de imponer la escala 1–5. Esta operación es irreversible y fue autorizada sólo porque esas filas nativas eran datos de prueba inutilizables; no la aplique sin respaldo en un ambiente que contenga datos válidos. También elimina de `calificaciones_finales` la contribución obsoleta de encuesta y refresca la vista agregada. Las nuevas capturas vuelven a calcular el resultado.

## Avisos institucionales y exportación

`/admin/avisos` administra avisos institucionales separados de `notificaciones`. Los avisos publicados sólo aparecen en `/avisos` cuando están activos, no vencieron y coinciden con el rol y, cuando aplica, el ciclo seleccionado. Las imágenes usan una ruta generada por servidor bajo `avisos/` en R2; cuando `R2_PUBLIC_URL` está configurada, esa URL es pública y no debe contener información sensible.

El botón **Descargar CSV para Excel** en `/admin/resultados-docentes` llama al export de superadmin. Incluye exclusivamente docentes activos que ya tienen una fila de `calificaciones_finales` con al menos un instrumento completado para el ciclo elegido. El CSV usa BOM UTF-8, escape de comillas y neutraliza fórmulas de hojas de cálculo.

## Saeko retirado

La importación Saeko ya no es un flujo operativo. `POST /api/admin/importar-saeko` responde `410 Gone` con el código `SAEKO_IMPORT_RETIRED`.

`encuesta_estudiantil` se conserva como archivo histórico accesible sólo para superadmin. No debe eliminarse ni utilizarse para puntuación, progreso, reportes o pantallas activas, excepto durante el borrado explícito de un ciclo inactivo marcado como prueba.

## Checklist de despliegue

- [ ] Migraciones 030–040 aplicadas en el ambiente objetivo y registradas por el proceso de despliegue.
- [ ] Migraciones 041–054 aplicadas y versionadas junto con el código que las consume.
- [ ] Caché de esquema recargada después de nuevas RPC.
- [ ] Ciclo seleccionado antes de cada importación.
- [ ] Reportes e incidencias de importación revisados.
- [ ] `/admin/grupos-asignados` validado para el ciclo.
- [ ] `/admin/trazabilidad` accesible sólo para superadmin y sin datos sensibles en la lista.
- [ ] Cada ruta `mi-actividad` permite sólo su rol correspondiente y muestra únicamente recibos con el `actor_id` de la sesión actual.
- [ ] Un envío de autodiagnóstico, planeación, evaluación de coordinación u observación crea un recibo atribuido al actor; una operación con `service_role` no se presenta como recibo personal.
- [ ] El estado de backfill de 051 está revisado en `/admin/asignaciones` y coordinación/observación se validan con cuentas distintas antes de abrir el ciclo.
- [ ] La verificación manual de 052 cubre 24 docentes, metas explícitas por 10 y reparto equilibrado de los 14 restantes antes de operar el ciclo.
- [ ] Un envío nativo exitoso muestra `student_evaluation.submitted` como actividad protegida; un envío fallido no deja ese evento.
- [ ] El portal de estudiante muestra sólo asignaciones elegibles.
- [ ] `Est.` y progreso se validan con agregados nativos, sin consultar Saeko ni datos individuales.

## Validación del repositorio

La convención de verificación actual ejecuta comprobación de Astro, compilación y revisión de espacios del diff:

```bash
npx astro check
npx astro build
npm run test:run
git diff --check
```

Consulte también [la especificación nativa](documentacion/11-evaluacion-estudiantil-nativa.md) y [el resumen de implementación](documentacion/08-resumen-implementacion.md).
