# Roadmap de Implementación — SED-360 v2

> Mayo 2026

## Fase 1: Setup e Infraestructura ✅
- [x] Astro SSR + Tailwind + TypeScript
- [x] Supabase (PostgreSQL, Auth Google, Storage)
- [x] Esquema SQL v2 (13 migraciones: 4 consolidadas + 6 fixes + 3 extras)
- [x] Middleware 3 roles + dominio
- [x] 5 layouts por rol
- [x] Servicios CRUD
- [x] Dashboards principales (3 roles)
- [x] Sidebar admin colapsable por grupos (Académico, Personal, Configuración)

## Fase 2: Admin Dashboard ✅
- [x] KPIs, ranking docentes con progreso
- [x] Gestión de docentes con buscador y modal por materia
- [x] Gestión de coordinadores con métricas + docentes evaluados
- [x] Gestión de usuarios simplificada
- [x] Catálogos CRUD: ofertas, campus, turnos, asignaturas, cuatrimestres
- [x] Roles: cambio rápido con un clic
- [x] Editor de preguntas con tipo de respuesta y opciones

## Fase 3: Autodiagnóstico Docente ✅
- [x] Wizard 4 pasos (identificación, datos, 24 reactivos, cierre)
- [x] Cálculo automático de nivel de desempeño
- [x] Creación automática de perfil docente
- [x] Modal de resultado con feedback
- [x] Checkboxes de modalidad (Escolarizado, Virtual, Ejecutivo, Mixto)

## Fase 4: Observación de Clase ✅
- [x] 3 formularios por modalidad (45/20/17 reactivos)
- [x] Escol., Virtual, Ejecutivo con secciones colapsables
- [x] Precarga automática desde perfil del docente
- [x] Cálculo Prom. Obs. y alimentación al dashboard

## Fase 5: Planeaciones Didácticas ✅
- [x] Subida de PDFs a Supabase Storage (bucket privado)
- [x] URLs firmadas para acceso seguro
- [x] Rúbrica del coordinador (4 criterios 1-5)
- [x] Cálculo automático → Prom. Plan.
- [x] Estados: Pendiente / Aprobado / Corrección
- [x] Leyenda institucional del buzón de entrega

## Fase 6: Coordinación Académica ✅
- [x] 15 reactivos en 5 categorías (A-E)
- [x] Cálculo Prom. Coord. normalizado a 100
- [x] Categoría automática: excelente/buena/aceptable/deficiente

## Fase 7: Encuesta Estudiantil (Saeko) ✅
- [x] Eliminado rol estudiante y encuesta manual
- [x] Encuesta reemplazada por importación CSV desde Saeko
- [x] Tabla `encuesta_estudiantil` simplificada a 10 promedios por categoría
- [x] `score_normalizado = promedio_general × 20` (GENERATED column)
- [x] UNIQUE en `(docente_id, asignatura_id, ciclo)`
- [x] RLS desactivado (API valida superadmin)

## Fase 8: Evaluación por Materia ✅
- [x] Grupos vinculados a asignaturas con modalidad, turno y clave
- [x] `/admin/docentes` con tabla principal (promedio general)
- [x] Modal "Ver materias" con scores por materia: EE, Obs, Plan, Coord, Auto
- [x] Columna "Grupos" en el modal con la clave del grupo (ej: `26-2 PED 11 02A`)
- [x] Desduplicación de grupos por `(docente_id, asignatura_id, clave_grupo)`
- [x] Migraciones consolidadas: 28+ → 13 (4 base + 9 fixes/extras)

## Fase 9: Importación de Datos ✅
- [x] API `importar-saeko.ts`: agrupa evaluaciones por docente+asignatura+ciclo
- [x] UI `/admin/importar` con barra de progreso
- [x] Batch upsert de ofertas, docentes, asignaturas, grupos, evaluaciones
- [x] Match de emails reales desde `docentes_tecplayacar.csv`
- [x] Grupos creados automáticamente con modalidad y turno desde CSV
- [x] 79-80 docentes importados, 138 asignaturas, 259 grupos, ~4500 evaluaciones

## Fase 10: Reestructuración y Ajustes ✅
- [x] 28+ migraciones consolidadas en 13 (001-004 base + 005-010 extras)
- [x] Eliminados 6 archivos de estudiante
- [x] 341 docentes maestros cargados vía CSV maestro
- [x] `/admin/docentes` filtrado solo a docentes con evaluaciones
- [x] Columna Turno eliminada de tabla principal
- [x] Modal "Agregar Usuario" con vinculación coordinador↔docentes
- [x] Sidebar admin colapsable por grupos
- [x] Columna `ciclo` ampliada a VARCHAR(30)

## Fase 11: Pendientes 🔲
- [ ] Sincronización automática con Saeko API
- [ ] Despliegue en Vercel + Cloudflare WAF
- [ ] Dashboard de coordinador funcional
- [ ] Dashboard de docente funcional
- [ ] Paginación en tablas grandes
- [ ] Exportar CSV/PDF de reportes
- [ ] UNIQUE constraint en `grupos` para evitar duplicados en futuros imports
