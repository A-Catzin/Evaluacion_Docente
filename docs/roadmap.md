# Roadmap de Implementación — SED-360 v2

> Agosto 2026

## Fase completada — MVP

- [x] 5 roles operativos: superadmin, coordinador, docente, estudiante y observador; `pendiente` para accesos no resueltos
- [x] 5 instrumentos de evaluación (EE, CA, PD, OC, AD)
- [x] Astro SSR + Tailwind 3 + Supabase + Vercel
- [x] Autenticación Google OAuth con middleware por rol
- [x] Dashboard general con métricas por cuatrimestre
- [x] CRUD de catálogos (ofertas, campus, turnos, asignaturas, cuatrimestres)
- [x] Autodiagnóstico docente (wizard, 24 reactivos, auto-asignación de rol)
- [x] Observación de clase (3 modalidades con reactivos dinámicos)
- [x] Planeaciones didácticas (subida PDF a Cloudflare R2 + rúbrica con estados)
- [x] Coordinación académica (15 preguntas en 5 secciones)
- [x] Importación por ciclo de docentes, padrón completo y asignaciones con reportes de conciliación
- [x] Migraciones 030–036 para identidad de grupos, importaciones, roles y EE nativa

## Fase completada — Dashboards

- [x] **Admin**: KPIs agregados, gráficos, buscador de docentes, progreso nativo agregado y enlaces `Ver` a detalle
- [x] **Docente**: dashboard con feedback detallado por pregunta desde `instrumento_preguntas`, scores por instrumento y materia
- [x] **Coordinador**: lista de docentes asignados + selector de cuatrimestre + paginación de 12 cards, acceso a captura CA/OC/PD
- [x] **Observador**: lista de docentes asignados, acceso directo a captura de observación, selector dinámico

## Fase completada — Asignaciones y reportes

- [x] Panel `/admin/asignaciones` por cuatrimestre: asignación batch coordinador↔docente y observador↔docente
- [x] Tabla `coordinador_docentes` con UNIQUE (coordinador_id, docente_id, cuatrimestre_id)
- [x] Reporte anual con exportación CSV en `/admin/reporte-anual`
- [x] Editor de preguntas en `/admin/instrumentos` — preguntas editables con opciones y tipo de respuesta
- [x] Paginación server-side en tablas principales
- [x] Reporte coordinador con CSV en `/coordinador/reportes`

## Fase completada — Funcionalidades adicionales

- [x] Sistema de notificaciones in-app (tabla `notificaciones`, campana en layouts, API REST)
- [x] Scoring por modalidad (`scoring.ts` con campos dinámicos para cada tipo de observación)
- [x] Páginas de docente: `materias` y `materia/[asignaturaId]` para consulta de materias
- [x] Páginas de admin: `evaluar-docentes` con subpáginas por instrumento (coordinacion, observacion-escolarizado, observacion-virtual, observacion-ejecutivo)
- [x] Storage migrado a Cloudflare R2 para planeaciones
- [x] Portal de estudiante: dashboard, evaluación nativa de 19 reactivos y envío único por grupo/ciclo elegible
- [x] Puntaje `native-19-v1` como única fuente de `Est.` en todos los ciclos
- [x] Retiro de importación Saeko; el archivo histórico queda sólo para auditoría de superadmin

## Mejoras futuras

- [ ] Firma electrónica en evaluaciones
- [ ] Exportación PDF de reportes individuales
- [ ] Modo offline para captura de observaciones
- [ ] Dashboard de visibilidad pública de resultados

## Estadísticas

| Métrica | Valor |
|---------|-------|
| Migraciones | Línea base hasta 026 + 030–036 requeridas para el flujo vigente |
| Usuarios docentes | ~341 |
| Instrumentos activos | 5 |
| Roles operativos | 5 + estado `pendiente` |
| Cuatrimestres configurados | 3 |
| Layouts | 7, incluido `LayoutEstudiante` |
| Services | 11 (autodiagnostico, calificaciones, catalogos, docentes, estudiantes, instrumentos, notificaciones, observaciones, planeaciones, scoring, usuarios) |

La operación de ciclo y las verificaciones de despliegue están en el [runbook](operacion-ciclo-importaciones-y-ee-nativa.md).
