# Documentación Técnica — SED-360 v2

> Plataforma de Evaluación Docente 360° — Tecnológico Universitario Playacar

## Índice de Módulos

| # | Módulo | Archivo | Estado |
|---|--------|---------|--------|
| 01 | [Esquema Core SQL v1](01-esquema-core.md) | Legacy | ⚠️ No vigente |
| 02 | [Tipos del Sistema v1](02-tipos-sistema.md) | Legacy | ⚠️ No vigente |
| 08 | [Resumen de Implementación v2](08-resumen-implementacion.md) | Completo | ✅ Fuente vigente |
| 09 | [Importación CSV Saeko](09-importacion-saeko.md) | Completo | ✅ Fuente vigente |
| 10 | [Página Admin Docentes](10-admin-docentes.md) | Completo | ✅ Fuente vigente |

> **Documentos vigentes**: `docs/contexto.md`, `docs/requerimientos.md`, `docs/architecture_patterns.md`, `docs/roadmap.md`, `docs/estructura_de_carpetas.md`, `docs/documentacion/08-resumen-implementacion.md`, `docs/documentacion/09-importacion-saeko.md`, `docs/documentacion/10-admin-docentes.md`
>
> Los documentos 01-07 son **legacy v1** y no deben usarse como referencia para la implementación actual.

## Convenciones v2

- **Idioma**: Español (variables, funciones, comentarios)
- **Naming**: `camelCase` (funciones), `PascalCase` (componentes), `snake_case` (SQL)
- **Tipado**: TypeScript estricto, prohibido `any`
- **Seguridad**: RLS en tablas sensibles, API valida superadmin para escritura
- **Auth**: Google OAuth, flujo implícito con cookies
- **Fórmula**: `EE(35%) + CA(20%) + PD(15%) + OC(25%) + AE(5%)`
- **Roles**: 3 (superadmin, coordinador, docente) — sin estudiante

## Stack v2

| Capa | Tecnología | Estado |
|------|-----------|--------|
| Frontend | Astro 4.16.18 SSR + Tailwind CSS 3.4.17 | ✅ Implementado |
| Backend | Supabase (PostgreSQL + Auth + RLS) | ✅ Implementado |
| Storage | Supabase Storage (bucket privado `planeaciones`) | ✅ Implementado |
| Validación | Zod | ✅ Implementado |
| Gráficos | Chart.js (CDN) | ✅ Implementado |
| Importación | API Astro + CSV Saeko | ✅ Implementado |
| Despliegue | Vercel + Cloudflare WAF | 🔲 Pendiente |
