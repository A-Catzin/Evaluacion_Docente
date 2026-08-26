# Documento de Contexto: Sistema de Evaluación Docente 360° (SED-360)

> Tecnológico Universitario Playacar — estado implementado, agosto de 2026

## 1. Propósito

Plataforma integral de evaluación docente 360° para TecPlayacar. Integra cinco instrumentos y una calificación ponderada. La encuesta estudiantil se captura de forma nativa por estudiantes elegibles; su puntuación es la única fuente activa de `Est.`. La guía operativa está en el [runbook de ciclo e importaciones](operacion-ciclo-importaciones-y-ee-nativa.md).

## 2. Roles y acceso

| Rol | Acceso | Dashboard |
| ----- | -------- | ----------- |
| **Superadmin** | Total. KPIs, ranking, catálogos, usuarios, importación CSV, asignaciones, reporte anual | `/admin/dashboard` |
| **Coordinador** | Evalúa docentes asignados. Captura CA, OC, PD. Visualiza reportes de su grupo | `/coordinador/dashboard` |
| **Docente** | Ve resultados al cierre. Realiza autodiagnóstico, sube planeaciones, consulta feedback | `/docente/dashboard` |
| **Observador** | Realiza observaciones de clase a docentes asignados, 3 modalidades | `/observador/dashboard` |
| **Estudiante** | Consulta y responde una evaluación nativa por grupo elegible del ciclo activo | `/estudiante/dashboard` |
| **Pendiente** | Estado sin identidad de padrón resuelta o con coincidencia ambigua | `/pendiente` |

`usuarios` vincula el UUID de Supabase Auth con una identidad de padrón; no contiene filas precreadas de estudiantes o docentes. Sólo una coincidencia exacta, única y activa del correo asigna automáticamente `estudiante` o `docente`; el resto permanece pendiente salvo roles explícitos de personal.

## 3. Instrumentos de evaluación (5 instrumentos)

### AD — Autodiagnóstico Docente

- **Peso**: 5%
- **Preguntas**: 24 ítems Likert (1-5)
- **Evaluador**: Docente (auto-aplicado)
- **Regla**: Auto-asigna rol docente al completar. Una vez por cuatrimestre.

### CA — Coordinación Académica

- **Peso**: 20%
- **Preguntas**: 15 ítems en 5 secciones (A-E)
- **Evaluador**: Coordinador
- **Escala**: 1-5, score normalizado a 100

### PD — Planeación Didáctica

- **Peso**: 15%
- **Estructura**: 12 categorías con checklist, subida de PDF al bucket privado
- **Evaluador**: Coordinador
- **Estados**: Pendiente, Aprobado, Corrección
- **Regla**: Materias ya enviadas (Aprobado/Pendiente) se bloquean. Corrección permite reenvío.

### OC — Observación de Clase

- **Peso**: 25%
- **Preguntas**: 45 ítems distribuidos en 3 modalidades
- **Tipos**: Presencial (45), Virtual (20), Ejecutiva (17)
- **Evaluador**: Coordinador u Observador
- **Regla**: Modalidad dinámica según registro del grupo. Usa `asignatura_id` + `grupo` (sin `oferta_academica`).

### EE — Encuesta Estudiantil

- **Peso**: 35%
- **Datos**: 19 respuestas nativas, `q1` de 1–6 y `q2`–`q19` de 1–4
- **Evaluador**: Estudiante con inscripción exacta en el grupo asignado
- **Regla**: `native-19-v1`, normalizado a 0–100 y ponderado por respuestas válidas

## 4. Fórmula de calificación

```
Nota Final = EE(35%) + CA(20%) + PD(15%) + OC(25%) + AD(5%)
```

## 5. Modelo de cuatrimestres

| Cuatrimestre | Período | Identificador |
| ------------- | --------- | --------------- |
| 26-1 | Diciembre — Marzo | `c1` |
| 26-2 | Abril — Julio | `c2` |
| 26-3 | Agosto — Noviembre | `c3` |

- **Persistencia**: cookie `cuatrimestre_sel` con el ID del cuatrimestre activo
- **Filtro global**: todas las queries y formularios filtran por cuatrimestre
- **Selector**: presente en todos los layouts (hamburguer responsive)

## 6. Flujos principales

1. **Asignación de evaluadores**: El superadmin asigna coordinadores y observadores a docentes por cuatrimestre desde `/admin/asignaciones`. UNIQUE constraint por (coordinador_id, docente_id, cuatrimestre_id).
2. **Captura de evaluaciones**: Coordinadores y observadores capturan CA, OC y PD. Docentes completan autodiagnóstico. Estudiantes completan EE nativa para sus grupos elegibles.
3. **Dashboards con feedback**: Cada rol ve su dashboard con métricas. El docente recibe feedback detallado por pregunta desde `instrumento_preguntas`.
4. **Reporte anual**: Superadmin genera reporte con desglose por docente y cuatrimestre, exportable a CSV.

## 7. Reglas de negocio

- **Planeaciones**: Materias ya enviadas con estado Aprobado o Pendiente bloquean nueva carga. El estado Corrección permite reenvío de PDF.
- **Autodiagnóstico**: Al completar el wizard, auto-asigna rol docente al usuario si no lo tiene.
- **Observación**: Usa `asignatura_id` + `grupo` como clave compuesta. Ciclo readonly desde cuatrimestre activo. 3 modalidades con reactivos dinámicos. Scoring por modalidad implementado en `scoring.ts`.
- **Importaciones de ciclo**: El superadmin selecciona el ciclo, importa docentes, padrón completo de estudiantes y asignaciones; después revisa reportes y `/admin/grupos-asignados`.
- **Notificaciones**: Sistema de notificaciones in-app implementado. Tabla `notificaciones` con campana en layouts de rol. API en `/api/notificaciones`.
- **Datos estudiantiles**: Las RPC derivan identidad y asignación en servidor. Personal sólo recibe agregados; las respuestas y comentarios no son datos de interfaz.
- **Saeko**: Retirado como importación y fuente activa. Se conserva sólo como auditoría de superadmin.

## 8. Arquitectura de scoring

El scoring de SED-360 se precalcula y persiste para que dashboards y reportes lean datos ya agregados, en lugar de calcular sobre la marcha.

### Tablas y vistas

- **`calificaciones_finales`** — guarda el score de cada instrumento (`score_encuesta_estudiantil`, `score_coordinacion`, `score_planeacion`, `score_observacion`, `score_autoevaluacion`), la calificación final ponderada, la categoría, la versión del cálculo y la marca de tiempo. Es la fuente de verdad para los resultados de un docente en un cuatrimestre.
- **`docente_modalidad_historica`** — congela la modalidad del docente (`Escolarizada`, `Ejecutivo`, etc.) para el par `(docente, cuatrimestre)` en el momento del primer cálculo. Esto evita que cambios posteriores del catálogo de docentes alteren scores históricos.
- **`resultados_agregados`** — vista materializada que une `calificaciones_finales` con el catálogo de `docentes`. Los dashboards de admin y coordinador la usan para listados y KPIs.

### Fuente única de verdad

Los pesos de instrumentos, los perfiles de modalidad (`normal` / `ejecutivo` / `inglés`) y las categorías de desempeño viven en `src/services/scoring.ts`. No se duplican en SQL ni en los dashboards; `src/services/calificaciones.ts` actúa como punto único de entrada para leer y recalcular calificaciones.

### Recálculo

- Los endpoints de escritura de instrumentos (autodiagnóstico, coordinación, planeación, observación y evaluación estudiantil nativa) llaman a `recalcularCalificacionDocente` para actualizar la fila del docente afectado.
- La importación masiva de asignaciones ejecuta `recalcularCalificacionesCuatrimestre` al finalizar, con `refrescarAgregados: true`, para precalcular los scores de todos los docentes con grupos en ese ciclo.
- El endpoint `/api/admin/refrescar-resultados` (accesible para superadmin) expone `refrescarResultadosAgregados`, que ejecuta `REFRESH MATERIALIZED VIEW` sobre `resultados_agregados`.

### Implicaciones operativas

- Si un instrumento se captura pero la vista `resultados_agregados` aún no se refrescó, los dashboards no reflejarán el cambio hasta el próximo refresco.
- No es necesario hacer backfill manual de `calificaciones_finales`; las nuevas capturas y las importaciones la poblan automáticamente.

## 9. Stack técnico

| Capa | Tecnología |
| ------ | ----------- |
| Framework | Astro 4.16.18 SSR |
| Estilos | Tailwind CSS 3 |
| Base de datos | Supabase PostgreSQL |
| Auth | Google OAuth + cookies |
| Storage | Cloudflare R2 (bucket `planeaciones`, URLs firmadas) |
| Validación | Zod |
| Deploy | Vercel (@astrojs/vercel, Node 20.x) |
