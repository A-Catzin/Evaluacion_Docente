# Remediación del flujo de planeaciones docentes

Esta implementación alinea la pantalla docente, la API y la base de datos para que las planeaciones se validen con la modalidad del grupo, con exclusiones NP explícitas y sin modificar históricos. También retira las rutas de carga duplicadas, evita que una asignación ambigua sea resuelta arbitrariamente y permite cargar PDF de hasta 30 MiB directamente a R2 sin pasar el cuerpo por Vercel.

## Ruta rápida

1. Aplicar las migraciones requeridas en orden mediante SQL controlado; no usar `supabase db push`.
2. Confirmar que exista `public.planning_group_np`, que R2 esté habilitado con CORS y que la ventana de entrega esté abierta.
3. Usar la secuencia directa de `/api/docente/planeacion-upload-url` → PUT a R2 → `/api/docente/planeacion-upload-complete`.
4. Usar el multipart de `/api/docente/subir-archivo` sólo como fallback para archivos de hasta 4 MiB cuando R2 no esté disponible.
5. Verificar con una cuenta docente que los grupos escolarizados elegibles aparecen, los grupos NP muestran un aviso y los errores de consulta no aparecen como listas vacías.
6. Ejecutar las pruebas enfocadas antes de desplegar.

## Decisiones funcionales

| Área | Comportamiento implementado |
| --- | --- |
| Modalidad | `grupos.modalidad` es la única fuente de verdad. `docentes.modalidad` no bloquea una carga. |
| Grupos elegibles | Sólo grupos activos del cuatrimestre con modalidad `Escolarizado` y asignación vigente del docente. |
| NP por asignatura | Una materia marcada NP no aparece como disponible para carga, pero se muestra como aviso informativo. |
| NP por grupo | Un grupo marcado NP no admite carga; la API responde con un código específico y no modifica planeaciones existentes. |
| Históricos | No se eliminan planeaciones, evaluaciones, inscripciones, grupos ni registros históricos. |
| Errores de datos | Un fallo de Supabase se distingue de una ausencia real de resultados y se informa como indisponibilidad. |
| Aislamiento SSR | `db()` crea un cliente de usuario por solicitud; el cliente con sesión no se comparte entre solicitudes concurrentes. |
| Duplicados | Una coincidencia exacta con más de un grupo se bloquea para revisión administrativa; nunca se elige el primer registro. |
| PDF grandes | El navegador carga hasta 30 MiB directamente a R2; Vercel sólo recibe JSON pequeño durante la preparación y confirmación. |

## Autoevaluación docente: ventana de acceso por cuatrimestre

La autoevaluación docente activa usa `public.autodiagnosticos`; la tabla legacy `autoevaluacion_docente` no forma parte de este control y no debe modificarse para este flujo.

La migración `078_autodiagnostico_submission_access_window.sql` agrega `public.autodiagnostico_submission_windows`, con una configuración por cuatrimestre. Sin una fila de configuración, la recepción de **nuevas** autoevaluaciones docentes queda cerrada. Los modos son:

- `manual_open`: permite nuevas entregas.
- `manual_closed`: bloquea nuevas entregas.
- `scheduled`: permite entregas únicamente desde `opens_at` hasta antes de `closes_at`.

Las horas de la pantalla y de la validación de entrada se interpretan como `America/Cancun`. Los registros de `autodiagnosticos` ya completados permanecen visibles y en consulta aun cuando la ventana esté cerrada.

La protección existe en dos capas:

1. `POST /api/docente/autodiagnostico` valida el JSON y el cuatrimestre, y consulta la ventana antes de actualizar el perfil docente, asignar un rol o insertar filas.
2. El trigger `BEFORE INSERT` de `public.autodiagnosticos` rechaza únicamente nuevas inserciones autenticadas de rol `docente` cuando la ventana no está abierta. No actualiza ni elimina históricos y no modifica las escrituras administrativas/no docentes.

El control superadministrativo está en:

- pantalla: `/admin/autodiagnostico/acceso?cuatrimestre=<id>`;
- endpoint: `POST /api/admin/autodiagnostico/acceso`;
- RPCs: `autodiagnostico_submission_window_state`, `autodiagnostico_submission_window_admin_list` y `autodiagnostico_submission_window_save`.

La tarjeta **Autoevaluación Docente** de `/admin/instrumentos` enlaza el control para el cuatrimestre activo. La configuración, la tabla y sus RPCs están restringidas por RLS, revocación de acceso directo, roles y `SECURITY DEFINER` con `search_path` fijo. El cambio de configuración queda auditado sin almacenar los valores de fecha completos.

La migración también incorpora explícitamente `autodiagnostico_submission_windows` al allowlist, la vista previa de conteos y la eliminación de ciclos de prueba. Esto conserva las protecciones de auditoría y no cambia la limpieza existente de la tabla legacy.

### Checklist de aplicación y despliegue

1. Confirmar con consultas de sólo lectura que la migración previa de ciclo de prueba está presente y que `public.autodiagnosticos` es la tabla usada por el flujo LIVE.
2. Aplicar `078_autodiagnostico_submission_access_window.sql` mediante SQL controlado; no ejecutar `supabase db push` ni aplicar SQL remoto sin aprobación.
3. Recargar el esquema de PostgREST (la migración emite `NOTIFY pgrst, 'reload schema'`) y verificar los grants de las RPCs.
4. Como superadmin, abrir `/admin/autodiagnostico/acceso?cuatrimestre=<id>` y guardar cada modo; confirmar que las fechas programadas se muestran en horario de Cancún.
5. Como docente, comprobar que una ventana ausente, cerrada, pendiente y finalizada muestra el aviso y no permite editar; una autoevaluación histórica debe seguir visible.
6. Con la ventana abierta, enviar una nueva autoevaluación válida y confirmar que se inserta en `public.autodiagnosticos`, no en `autoevaluacion_docente`.
7. Ejecutar las pruebas enfocadas y la validación de diff antes de desplegar la UI y las rutas API.

## Pantalla docente

Archivo principal: `src/pages/docente/planeaciones.astro`.

La página ahora:

- protege la sesión, el perfil y la resolución de identidad docente frente a rechazos de red o Supabase;
- carga ciclos, ventana, grupos, perfil, historial, NP por materia, NP por grupo y catálogo de asignaturas mediante consultas protegidas;
- conserva advertencias separadas para errores de consulta y para una ventana cerrada;
- oculta el formulario cuando los datos necesarios no están disponibles;
- muestra los avisos NP sin presentarlos como errores técnicos;
- filtra la disponibilidad por la modalidad persistida del grupo.

Un error de consulta no debe producir una lista vacía que parezca indicar que el docente no tiene asignaciones. La pantalla debe mostrar una advertencia accionable y evitar acciones de carga con datos incompletos.

## API canónica y rutas retiradas

### Rutas activas

El flujo oficial de carga usa tres pasos:

1. `POST /api/docente/planeacion-upload-url` autentica al docente, valida ventana y metadatos, y devuelve una URL PUT firmada de R2 con una ruta generada por el servidor.
2. El navegador ejecuta `PUT` directamente contra R2 con `Content-Type: application/pdf` e `If-None-Match: *`.
3. `POST /api/docente/planeacion-upload-complete` verifica la ruta, el objeto y sus metadatos, repite las validaciones de autorización y persiste la planeación.

`POST /api/docente/subir-archivo` continúa disponible como fallback multipart para archivos de hasta 4 MiB. Conserva las validaciones de:

- rol e identidad del docente;
- ventana de entrega;
- PDF y ruta de almacenamiento generada en servidor;
- ciclo, asignatura, grupo y modalidad;
- NP por materia y por grupo;
- propietario y estado de la planeación durante una corrección;
- duplicidad de la planeación;
- persistencia y recálculo de calificación.

El límite funcional es de **30 MiB** (`30 * 1024 * 1024`). El límite de entrada de una función serverless de Vercel es aproximadamente 4.5 MB y no se puede aumentar desde `vercel.json`; por eso un PDF grande nunca debe enviarse como multipart a `/api/docente/subir-archivo`.

### Rutas retiradas

Las siguientes rutas responden `410 Gone` con JSON y código `planning_endpoint_retired`:

- `POST /api/docente/planeacion`
- `POST /api/docente/planeacion-subir`

La respuesta indica usar `/api/docente/subir-archivo`. Las rutas retiradas no leen el cuerpo, no autentican, no acceden a Storage y no escriben en la base.

El servicio `src/services/planeaciones.ts` se conserva porque la pantalla administrativa de evaluación todavía consume `obtenerPlaneacion`; no es una ruta adicional de carga.

### Configuración CORS de R2

La configuración del bucket no vive en este repositorio. Para producción, el bucket R2 debe permitir como mínimo:

```json
[
  {
    "AllowedOrigins": ["https://sed-360.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 600
  }
]
```

Agregue el origen local únicamente si se probará desde desarrollo. No se firma `Content-Length`: los navegadores no permiten que JavaScript lo establezca de forma confiable. El servidor valida `file_size` antes de firmar y vuelve a verificar `ContentLength` mediante `HEAD` antes de persistir; un objeto sobredimensionado no se guarda en `planeaciones`, aunque puede requerir limpieza del objeto huérfano.

El PUT usa una clave opaca generada por servidor y `If-None-Match: *` para evitar sobrescrituras de una clave ya existente. Si R2 o CORS rechazan esa condición, el flujo directo debe considerarse no operativo hasta corregir la configuración.

## Resolución de asignaciones ambiguas

La función `resolveTeacherPlanningGroup` consulta como máximo dos coincidencias exactas por docente, ciclo, asignatura y clave de grupo.

| Resultado | Respuesta de carga |
| --- | --- |
| `ok` | Continúa sólo si el grupo es `Escolarizado`. |
| `not_found` | `403`; la asignación no corresponde al alcance del docente. |
| `non_escolarizado` | `403`; el grupo no admite planeación docente. |
| `ambiguous` | `409`, código `planning_assignment_ambiguous`; requiere revisión administrativa. |
| `query_error` | `503`, código `planning_assignment_unavailable`; no expone el mensaje de la base. |

### Incidencia conocida: grupos 921 y 922

Existe una colisión para:

- docente `126`;
- cuatrimestre `11`;
- asignatura `150` (`LECTURA Y ORATORIA T`);
- claves coincidentes en los grupos `921` y `922`.

La implementación bloquea esa carga de forma segura. La corrección de los datos requiere confirmar administrativamente cuál es la identidad correcta de cada grupo; no se debe borrar ni renombrar automáticamente.

## Migraciones

Las migraciones anteriores se conservan como historial inmutable. La limpieza se realiza sólo mediante una migración posterior.

| Migración | Propósito |
| --- | --- |
| `050` | Ventana de acceso a entregas de planeación. |
| `056` | Normalización de modalidad `Escolarizado`. |
| `061` | Corrección de la lógica de ventana y modalidad. |
| `063` | Alcance de materias y grupos cubiertos por una planeación. |
| `065`–`066` | NP por asignatura y operación bulk. |
| `073` | Auditoría de importación de ofertas académicas. |
| `074` | Diseño anterior de estado de documento por grupo; supersedido. |
| `075` | NP por grupo (`public.planning_group_np`). |
| `076` | Límite bulk de hasta 1000 grupos. |
| `077` | Retiro protegido de `planning_group_document_status` y su RPC anterior. |
| `078` | Ventana de acceso por cuatrimestre para nuevas autoevaluaciones docentes. |

### Migración 077

`supabase/migrations/077_retire_unused_planning_group_document_status.sql`:

- termina sin cambios si la tabla ya no existe;
- toma un bloqueo `ACCESS EXCLUSIVE` antes de inspeccionar la tabla;
- falla si encuentra filas, en lugar de eliminarlas silenciosamente;
- elimina la función legacy y la tabla sólo cuando está vacía;
- solicita recarga del esquema de PostgREST.

La migración 077 fue preparada, pero todavía no fue aplicada remotamente. Su aplicación requiere SQL controlado y verificación posterior.

### Proveniencia pendiente

El `.gitignore` histórico todavía oculta varias migraciones posteriores a la línea base, incluyendo 074 y 075. Por eso un checkout limpio no reproduce aún toda la secuencia local. Antes de publicar un cambio dependiente de esas migraciones, se debe decidir si se incorporan al control de versiones o si se entrega un paquete de migraciones auditado para aplicación manual.

No ejecutar `supabase db push` mientras el historial remoto continúe desincronizado.

## Resiliencia ante Supabase

- `db()` ya no conserva un cliente de usuario mutable entre solicitudes SSR.
- El middleware reutiliza el cliente que validó la sesión para resolver el rol.
- Un `fetch failed`, timeout o error upstream reconocido devuelve `503` con código `upstream_unavailable`.
- Las rutas API reciben JSON sin caché; las páginas reciben una respuesta `503` breve. Las sesiones inválidas siguen redirigiendo a `/auth`.
- La pantalla docente captura rechazos de consultas individuales y evita mostrar datos incompletos como si fueran listas vacías.
- El dashboard administrativo usa filas precalculadas sin ejecutar el fallback inline masivo durante una solicitud; esto evita ráfagas de conexiones a Supabase.
- El perfil administrativo consulta sólo `usuarios.email`; no depende de una columna `nombre_completo` inexistente.

## Notificaciones

El endpoint `/api/notificaciones` no está sin uso: las cargas de planeación y las evaluaciones generan avisos, y el componente `NotificationBell.astro` permite leerlos y marcarlos como leídos.

Para reducir consumo, se eliminó la consulta GET automática que ocurría en cada carga de página sólo para pintar el badge. Ahora:

- no se consulta `/api/notificaciones` al abrir una página;
- se ejecuta un único GET cuando el usuario abre la campana;
- las acciones de marcar una notificación o todas como leídas conservan su POST y refrescan la lista;
- no existe polling con `setInterval`.

El costo esperado es que el badge de no leídas se actualice al abrir la campana, no antes.

## Verificación

Verificación realizada sobre el estado actual:

```bash
git diff --check
npm run test:run -- \
  src/lib/dbResilience.test.ts \
  src/lib/planningCorrectionReason.test.ts \
  src/lib/planningEvaluationStatusControl.test.ts \
  src/lib/planningGroupResolution.test.ts \
  src/lib/planningSubjectScope.test.ts \
  src/lib/planningSubmissionWindow.test.ts \
  src/lib/planningSubmissionWindowEndpoints.test.ts \
  src/lib/planningSubmissionWindowMigration.test.ts \
  src/lib/planningSubmissionWindowModalityFixMigration.test.ts \
  src/lib/planningUploadDirect.test.ts
npm run build
```

Resultado: las pruebas enfocadas y el build deben ejecutarse nuevamente después de configurar CORS; la última verificación local reportó **39/39 pruebas** del conjunto de resiliencia y carga directa, `git diff --check` correcto y build exitoso. No se ha ejecutado una prueba PUT real contra R2 ni un despliegue de producción.

El build conserva advertencias conocidas del adaptador Vercel con Node local 22 y módulos opcionales (`bufferutil`, `utf-8-validate` y Sharp); no bloquearon la compilación.

## Contratos JSON del flujo directo

### Solicitar URL de carga

`POST /api/docente/planeacion-upload-url`

Encabezado:

```http
Content-Type: application/json
```

Cuerpo mínimo:

```json
{
  "cuatrimestre_id": 11,
  "file_name": "planeacion.pdf",
  "content_type": "application/pdf",
  "file_size": 5242880
}
```

La respuesta exitosa (`201`) contiene una ruta opaca creada por el servidor, una URL firmada de R2, los headers exactos para el `PUT` y su fecha de expiración. El cliente nunca envía una ruta de Storage propia.

### Confirmar carga

El cliente envía la ruta recibida y los datos de la planeación. El endpoint vuelve a validar la sesión, docente, ciclo, ventana, grupo, modalidad, NP, alcance, corrección y duplicidad. Luego consulta los metadatos del objeto en R2 y sólo entonces escribe en `planeaciones`.

Códigos relevantes:

| Código | Significado |
| --- | --- |
| `upstream_unavailable` | Supabase/R2 no respondió de forma utilizable. Reintentar más tarde. |
| `r2_direct_upload_unavailable` | No se pudo preparar la carga directa; sólo archivos de hasta 4 MiB pueden usar fallback. |
| `planning_upload_object_missing` | El PUT no creó el objeto esperado. |
| `planning_upload_object_invalid` | El tamaño o MIME real no coincide con la solicitud. |
| `planning_multipart_pdf_too_large` | Se intentó enviar más de 4 MiB por multipart. |
| `planning_assignment_ambiguous` | Hay más de un grupo coincidente; requiere revisión administrativa. |
| `planning_group_marked_np` / `planning_subject_marked_np` | La carga está excluida por NP. |

## Despliegue y prueba de humo

El cambio requiere publicar la UI y las nuevas rutas API; el despliegue anterior no las contiene.

```bash
npm run test:run -- \
  src/lib/dbResilience.test.ts \
  src/lib/planningSubmissionWindow.test.ts \
  src/lib/planningUploadDirect.test.ts \
  src/lib/planningSubmissionWindowEndpoints.test.ts
npm run build
git diff --check
vercel --prod
```

Antes de publicar, confirme en Vercel para **Production** las variables `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` y `R2_PUBLIC_URL`. El nombre de `R2_BUCKET` debe ser el bucket donde se configuró CORS.

Después del despliegue:

1. Inicie sesión como docente y abra `/docente/planeaciones`.
2. Pruebe un PDF menor a 4 MiB y otro mayor a 4 MiB pero menor a 30 MiB.
3. En Network confirme la secuencia URL firmada → `PUT` R2 → confirmación `201`.
4. Compruebe que una carga inválida no crea una fila en `planeaciones`.
5. Pruebe una ventana cerrada, una materia/grupo NP y el duplicado conocido; cada caso debe mostrar un error estable.
6. Revise los logs de Vercel: fallos upstream deben identificarse como `upstream_unavailable`, sin mensajes ni secretos de Supabase.

Si el `PUT` devuelve un error CORS, no se debe aumentar el límite multipart ni reenviar el PDF a Vercel. Revise el bucket, el origen exacto y los headers permitidos.

## Inventario de implementación

| Archivo | Responsabilidad |
| --- | --- |
| `src/lib/db.ts` | Cliente Supabase de usuario aislado por solicitud y resolución de rol con cliente autenticado. |
| `src/middleware.ts` | Fallback `503` para fallos upstream en API y páginas. |
| `src/lib/planningSubmissionWindow.ts` | Límite de 30 MiB, validación de metadatos, modalidad, ventana y ruta opaca. |
| `src/lib/storage.ts` | URL PUT firmada, condición de no sobrescritura y consulta `HEAD` de R2. |
| `src/pages/api/docente/planeacion-upload-url.ts` | Preparación autenticada de la carga directa. |
| `src/pages/api/docente/planeacion-upload-complete.ts` | Confirmación server-side y persistencia autorizada. |
| `src/pages/api/docente/subir-archivo.ts` | Fallback multipart limitado a 4 MiB. |
| `src/pages/docente/planeaciones.astro` | Prevalidación, secuencia directa, fallback y mensajes al docente. |
| `src/lib/*Resilience*.test.ts`, `*UploadDirect*.test.ts` | Contratos de resiliencia, límites y flujo directo. |
| `docs/remediacion-planeaciones-docentes.md` | Runbook operativo y checklist de producción. |

## Checklist operativo antes de producción

- [ ] Confirmar la proveniencia/versionado de las migraciones 067–078.
- [ ] Confirmar remotamente 073, 075, 076 y los prerrequisitos de la 078 con consultas de sólo lectura.
- [ ] Configurar y probar CORS de R2 para `PUT`, `Content-Type` e `If-None-Match` desde producción.
- [ ] Decidir y corregir administrativamente la colisión 921/922.
- [ ] Aplicar 077 sólo después de confirmar que `planning_group_document_status` está vacía.
- [ ] Aplicar 078 mediante SQL controlado y configurar la ventana de autoevaluación del cuatrimestre.
- [ ] Desplegar la UI y la API mediante el procedimiento manual aprobado.
- [ ] Probar carga válida menor a 4 MiB, carga directa de 30 MiB, materia NP, grupo NP, ventana cerrada, error de consulta y duplicado.
- [ ] Confirmar que no se modificaron históricos ni planeaciones existentes.
- [ ] Revisar objetos R2 huérfanos si una carga se abandona después del PUT directo.
