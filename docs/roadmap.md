# Roadmap de Implementación — SED-360 v2

> Agosto 2026

## Fase 0 — Limpieza de infra y `.gitignore` ✅

- Limpieza de archivos de infraestructura no utilizados.
- Actualización de `.gitignore` para ignorar datos sensibles, artefactos locales y documentación no pública, manteniendo en el repositorio únicamente las migraciones de schema 036, 037 y 038.
- Vercel consolidado como único proveedor de deploy; sin Firebase.

## Fase 1 — Fundamentos de calidad ✅

- **Tests**: suite con Vitest para `scoring`, `calificaciones`, validación, moderación, rate limiting, autenticación e importación CSV.
- **Autorización**: middleware de Astro con validación de sesión, dominio `@tecplayacar.edu.mx` y roles por prefijo de ruta; helper `requireRole` para endpoints.
- **Validación**: esquemas Zod centralizados en `src/lib/validation/apiSchemas.ts` y formateo uniforme de errores.
- **Moderación**: módulo de blacklist para comentarios de texto libre en evaluaciones estudiantiles, autodiagnóstico, planeaciones y observaciones.
- **Rate limiting**: control de frecuencia por base de datos para endpoints críticos (por ejemplo, envío de evaluación estudiantil).

## Fase 2 — Scoring histórico, precálculo y refactor de dashboards/reportes ✅

### Scoring y persistencia

- Tabla `calificaciones_finales` con scores precalculados por docente y cuatrimestre.
- Tabla `docente_modalidad_historica` que congela la modalidad al momento del primer cálculo.
- Vista materializada `resultados_agregados` para lectura rápida en dashboards.
- Fuente única de verdad en TypeScript: pesos, perfiles de modalidad y categorías en `src/services/scoring.ts`.
- Punto único de entrada en `src/services/calificaciones.ts` para leer y recalcular calificaciones.
- Recálculo automático desde endpoints de escritura de instrumentos.
- Recálculo masivo al finalizar la importación de asignaciones.
- Endpoint `/api/admin/refrescar-resultados` para refrescar `resultados_agregados` manualmente.

### Dashboards y reportes

- Dashboard de admin con KPIs agregados, gráficos, buscador de docentes y progreso nativo agregado.
- Dashboard de docente con feedback detallado por pregunta y scores por instrumento.
- Dashboard de coordinador con docentes asignados, selector de cuatrimestre y acceso a captura CA/OC/PD.
- Dashboard de observador con docentes asignados y acceso directo a captura de observación.
- Reporte anual exportable a CSV en `/admin/reporte-anual`.
- Reporte de coordinador con CSV en `/coordinador/reportes`.
- Páginas de docente `materias` y `materia/[asignaturaId]`.
- Páginas de admin `evaluar-docentes` con subpáginas por instrumento.

### Funcionalidades operativas

- Panel `/admin/asignaciones` por cuatrimestre: asignación batch coordinador↔docente y observador↔docente.
- Importación por ciclo de docentes, padrón completo de estudiantes y asignaciones con reportes de conciliación.
- Editor de preguntas en `/admin/instrumentos`.
- Paginación server-side en tablas principales.
- Sistema de notificaciones in-app (`notificaciones`, campana en layouts, API REST).
- Storage de planeaciones en Cloudflare R2 con URLs firmadas.
- Portal de estudiante con evaluación nativa de 19 reactivos y envío único por grupo/ciclo elegible.
- Puntaje `native-19-v1` como única fuente de `Est.` en todos los ciclos.
- Retiro de importación Saeko; el archivo histórico queda sólo para auditoría de superadmin.
- Migraciones 030–038 requeridas para el flujo vigente.

## Fase 3 — Alineación modelo-UI ⏳

- [ ] Alinear modelos de datos con los componentes de UI para reducir transformaciones ad-hoc en páginas y endpoints.
- [ ] Unificar contratos de tipos entre servicios, stores y componentes.
- [ ] Mejorar la experiencia de selección de cuatrimestre y persistencia de filtros.

## Fase 4 — DX y deuda técnica ⏳

- [ ] Revisar y consolidar endpoints duplicados o con lógica similar.
- [ ] Documentar convenciones de API, tests y patrones de Astro SSR.
- [ ] Optimizar consultas a la base de datos y tiempos de build.
- [ ] Evaluar firma electrónica en evaluaciones, exportación PDF de reportes individuales y modo offline para captura de observaciones como mejoras futuras opcionales.

## Estadísticas

| Métrica | Valor |
|---------|-------|
| Migraciones | Línea base hasta 026 + 030–038 requeridas para el flujo vigente |
| Usuarios docentes | ~341 |
| Instrumentos activos | 5 |
| Roles operativos | 5 + estado `pendiente` |
| Cuatrimestres configurados | 3 |
| Layouts | 7, incluido `LayoutEstudiante` |
| Services | 11 (autodiagnostico, calificaciones, catalogos, docentes, estudiantes, instrumentos, notificaciones, observaciones, planeaciones, scoring, usuarios) |

La operación de ciclo y las verificaciones de despliegue están en el [runbook](operacion-ciclo-importaciones-y-ee-nativa.md).
