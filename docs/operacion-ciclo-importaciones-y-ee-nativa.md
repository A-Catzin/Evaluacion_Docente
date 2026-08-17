# Operación del ciclo, importaciones y evaluación estudiantil nativa

Este runbook es la referencia operativa del estado implementado. Permite preparar un ciclo, importar su padrón y carga académica, y verificar la evaluación estudiantil nativa sin exponer respuestas individuales.

## Ruta rápida

1. Confirme que las migraciones 030–036 estén aplicadas en el ambiente correspondiente; que los archivos existan en el repositorio no confirma su aplicación en producción.
2. Seleccione el ciclo en la aplicación.
3. Importe docentes, el padrón completo de estudiantes y las asignaciones grupo-asignatura-docente, en ese orden.
4. Revise los reportes de importación y `/admin/grupos-asignados` antes de abrir el ciclo a estudiantes.
5. Compruebe el progreso agregado y la columna `Est.` de los docentes; no consulte respuestas ni comentarios individuales.

## Migraciones requeridas después de la línea base

| Migración | Efecto | Verificación operativa |
|---|---|---|
| 030 | Identidad normalizada de grupos e inscripción única por estudiante, grupo y ciclo | El padrón del ciclo no duplica inscripciones y los grupos tienen identidad normalizada. |
| 031 | Bitácora de importaciones, incidencias y normalización de docentes | Cada importación deja `import_runs` e `import_issues` revisables. |
| 032 | Resolver de roles en autenticación | Una identidad de padrón activa y única recibe `docente` o `estudiante`. |
| 033 | Trigger y retrocarga para usuarios pendientes | `usuarios` vincula el UUID de Auth con la identidad de padrón, sin poblarse desde el padrón. |
| 034 | Consulta y envío nativo seguro de evaluación estudiantil | El estudiante sólo ve grupos asignados del ciclo activo y no puede reenviar. |
| 035 | Progreso nativo agregado para personal | Administración y coordinación ven conteos, nunca respuestas, comentarios ni vínculo estudiante-respuesta. |
| 036 | Puntaje nativo `native-19-v1` y retiro de Saeko | `Est.` se obtiene de respuestas nativas válidas; Saeko queda sólo para auditoría de superadmin. |

Después de aplicar en un ambiente una migración que agregue o cambie RPC, recargue la caché de esquema de PostgREST:

```sql
NOTIFY pgrst, 'reload schema';
```

## Importar un ciclo

El ciclo se elige en la aplicación. Ningún CSV crea ni selecciona ciclos; su columna `CICLO`, si existe, sólo sirve para detectar diferencias o mezclas.

| Orden | Importación | Resultado esperado |
|---|---|---|
| 1 | Docentes | Catálogo de docentes actualizado mediante correo o número de empleado estable. |
| 2 | Padrón completo de estudiantes | Estudiantes e inscripciones del ciclo seleccionado; el CSV requiere `NOMBRE COMPLETO`. |
| 3 | Asignaciones | Grupos, asignaturas y docentes conciliados de forma normalizada y segura. |
| 4 | Revisión | Reportes de ejecución, incidencias y `/admin/grupos-asignados` sin pendientes críticos. |

### Controles de conciliación

- Use el padrón completo, no una muestra, para conservar las inscripciones del ciclo.
- Revise `import_runs` e `import_issues` después de cada archivo. Las incidencias son datos por resolver, no coincidencias que el sistema deba adivinar.
- En `/admin/grupos-asignados`, revise las pestañas de asignados, incidencias de conciliación y grupos sin información de carga académica.
- La asignación compara identidades normalizadas; no usa coincidencias difusas para vincular estudiantes, grupos, materias o docentes.

## Roles y resolución de identidad

Los roles de aplicación son `superadmin`, `coordinador`, `docente`, `estudiante` y `observador`. `pendiente` es un estado de acceso no resuelto, no un sexto rol operativo.

| Caso de inicio de sesión | Resultado |
|---|---|
| Coincidencia exacta, única y activa sólo en `estudiantes` | `estudiante`, con `entidad_id` del estudiante. |
| Coincidencia exacta, única y activa sólo en `docentes` | `docente`, con `entidad_id` del docente. |
| Coincidencia explícita de personal | Conserva `superadmin`, `coordinador` u `observador`. |
| Sin coincidencia, coincidencia múltiple o coincidencia simultánea de estudiante y docente | `pendiente`; no se infiere un rol. |

`usuarios` registra el UUID de Supabase Auth y su vínculo con la identidad de padrón. No es una copia prellenada de `estudiantes` ni `docentes`; se crea o revisa al autenticarse.

## Evaluación estudiantil nativa

El portal está disponible en `/estudiante/dashboard` y el formulario en `/estudiante/evaluar/[grupoId]`.

| Regla | Contrato implementado |
|---|---|
| Ventana | Sólo el ciclo activo. |
| Elegibilidad | Inscripción exacta del estudiante en el grupo de asignación activo, con docente y asignatura. Una inscripción sólo en el grupo base no habilita evaluación. |
| Envío | Máximo un envío completado por estudiante, grupo y ciclo. |
| Reactivos | 19 obligatorios: `q1` de 1 a 6; `q2` a `q19` de 1 a 4. |
| Comentario | Opcional, máximo 2000 caracteres. |
| Seguridad | El servidor y las RPC derivan estudiante, docente, asignatura y ciclo; el cliente no decide esas identidades. |

## Puntaje y progreso

`native-19-v1` es la única fuente de `Est.` en todos los ciclos. Cada respuesta válida se normaliza a 0–100: `q1` desde la escala 1–6 y `q2`–`q19` desde la escala 1–4. El puntaje del docente o materia es el promedio ponderado por cantidad de respuestas válidas.

- El puntaje aparece desde la primera respuesta válida.
- Sin respuesta nativa válida, `Est.` no está disponible y el avance es parcial; nunca se muestra como `0` ni se usa Saeko como respaldo.
- Los resúmenes de docentes mantienen el avance de los cinco instrumentos estándar y muestran el puntaje nativo como `Est.`.
- El progreso administrativo es agregado: inscripciones elegibles, controles enviados y respuestas nativas. Las respuestas, comentarios y enlaces a estudiantes no son datos de interfaz para personal.
- En administración, `Ver` dirige a la ruta de detalle. El modal individual y el control de visibilidad anterior fueron retirados.

## Saeko retirado

La importación Saeko ya no es un flujo operativo. `POST /api/admin/importar-saeko` responde `410 Gone` con el código `SAEKO_IMPORT_RETIRED`.

`encuesta_estudiantil` se conserva como archivo de auditoría accesible sólo para superadmin. No debe eliminarse ni utilizarse para puntuación, progreso, reportes o pantallas activas.

## Checklist de despliegue

- [ ] Migraciones 030–036 aplicadas en el ambiente objetivo y registradas por el proceso de despliegue.
- [ ] Caché de esquema recargada después de nuevas RPC.
- [ ] Ciclo seleccionado antes de cada importación.
- [ ] Reportes e incidencias de importación revisados.
- [ ] `/admin/grupos-asignados` validado para el ciclo.
- [ ] El portal de estudiante muestra sólo asignaciones elegibles.
- [ ] `Est.` y progreso se validan con agregados nativos, sin consultar Saeko ni datos individuales.

## Validación del repositorio

La convención de verificación actual ejecuta comprobación de Astro, compilación y revisión de espacios del diff:

```bash
npx astro check
npm run build
```

Consulte también [la especificación nativa](documentacion/11-evaluacion-estudiantil-nativa.md) y [el resumen de implementación](documentacion/08-resumen-implementacion.md).
