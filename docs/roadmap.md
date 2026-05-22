# Roadmap de Implementación — SED-360 v2

> Mayo 2026

## Fase 1: Setup e Infraestructura ✅
- [x] Astro SSR + Tailwind + TypeScript
- [x] Supabase (PostgreSQL, Auth Google, Storage)
- [x] Esquema SQL v2 (25+ tablas, RLS, triggers)
- [x] Middleware 4 roles + dominio
- [x] 5 layouts por rol
- [x] Servicios CRUD (10 archivos)
- [x] Dashboards principales (4 roles)
- [x] Sidebar admin colapsable por grupos

## Fase 2: Admin Dashboard ✅
- [x] KPIs, ranking docentes con progreso
- [x] Gestión de docentes con buscador (72 activos con materias)
- [x] Gestión de coordinadores con métricas + docentes evaluados
- [x] Gestión de usuarios simplificada (4 roles con conteos)
- [x] Catálogos CRUD: ofertas, campus, turnos, asignaturas, cuatrimestres
- [x] Roles: cambio rápido con un clic
- [x] Editor de preguntas con tipo de respuesta y opciones
- [x] Importación CSV desde admin (docentes/estudiantes)

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

## Fase 7: Encuesta Estudiantil ✅
- [x] 51 reactivos en 10 secciones (A-J)
- [x] Anonimato garantizado (tabla de control separada)
- [x] Dashboard estudiante: pendientes/completadas
- [x] Wizard con secciones colapsables

## Fase 8: Evaluación por Materia ✅
- [x] Grupos vinculados a asignaturas con modalidad y turno
- [x] `/admin/docentes` con desglose por materia en modal
- [x] Migración 028: columnas `asignatura_id` en evaluaciones

## Fase 9: Importación de Datos ✅
- [x] SQL chunks desde CSVs (docentes, estudiantes, grupos, inscripciones)
- [x] Script Python generador de SQL
- [x] Match por email con fallback por apellidos

## Fase 10: Pendientes 🔲
- [ ] Sincronización automática con Saeko API
- [ ] Importar CSV desde panel admin (sin SQL manual)
- [ ] Despliegue en Vercel + Cloudflare WAF
- [ ] Resolver 39 docentes sin grupos (match pendiente)
- [ ] Paginación en tablas grandes
- [ ] Exportar CSV/PDF de reportes
