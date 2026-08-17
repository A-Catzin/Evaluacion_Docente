# SED-360 — Sistema de Evaluación Docente 360°

Plataforma integral de evaluación docente para el Tecnológico Universitario Playacar. Mide el desempeño docente desde 5 instrumentos evaluados por diferentes actores, generando una calificación final ponderada.

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Astro 4.16.18 SSR |
| Estilos | Tailwind CSS 3.4.17 |
| Base de datos | Supabase PostgreSQL |
| Auth | Google OAuth (`@tecplayacar.edu.mx`) + cookies |
| Storage | Cloudflare R2 (planeaciones PDF) |
| Validación | Zod |
| Deploy | Vercel (`@astrojs/vercel`, Node 20.x) |

## Roles y acceso

| Rol | Acceso |
|-----|--------|
| Superadmin | Total: KPIs, catálogos, usuarios, importación CSV, asignaciones, reportes |
| Coordinador | Evalúa docentes asignados: CA, OC, PD. Reportes de su grupo |
| Docente | Resultados al cierre, autodiagnóstico, planeaciones, feedback |
| Observador | Observaciones de clase a docentes asignados (3 modalidades) |
| Estudiante | Consulta y completa evaluaciones nativas de sus grupos elegibles en el ciclo activo |
| Pendiente | Estado de acceso no resuelto; no habilita un portal operativo |

El acceso se resuelve contra coincidencias exactas, únicas y activas del correo institucional en el padrón. Los roles explícitos de personal se conservan; las coincidencias ambiguas o ausentes permanecen en `pendiente`.

## Estructura del proyecto

```text
src/
├── components/          # Componentes UI reutilizables
├── features/            # Lógica de dominio (moderación, etc.)
├── layouts/             # Layouts por rol, incluido LayoutEstudiante
├── lib/                 # Clientes: db.ts, storage.ts (Cloudflare R2), supabaseClient.ts
├── pages/               # Páginas Astro + endpoints API
│   ├── admin/           # Dashboard, catálogos, importaciones, docentes, instrumentos y reportes
│   ├── coordinador/     # Dashboard, captura, docentes, planeaciones, reportes
│   ├── docente/         # Dashboard, autodiagnóstico, autoevaluación, materias, planeaciones
│   ├── observador/      # Dashboard
│   ├── estudiante/      # Dashboard y evaluación nativa por grupo
│   └── api/             # Endpoints REST (auth, admin, coordinador, docente)
├── services/            # Lógica de negocio: autodiagnostico, calificaciones, catalogos, docentes, estudiantes, instrumentos, notificaciones, observaciones, planeaciones, scoring, usuarios
└── types/               # Tipos TypeScript (supabase.ts)
supabase/
└── migrations/          # Línea base y migraciones 030–036 para ciclos, roles y EE nativa
```

## Comandos

| Comando | Acción |
|---------|--------|
| `npm install` | Instalar dependencias |
| `npm run dev` | Servidor de desarrollo en `localhost:4321` |
| `npm run build` | Build de producción a `./dist/` |
| `npm run preview` | Previsualizar build local |
| `npm run check:r2` | Verificar configuración de Cloudflare R2 |

## Documentación

Empiece por el [runbook operativo](docs/operacion-ciclo-importaciones-y-ee-nativa.md). La visión general está en [docs/contexto.md](docs/contexto.md) y el estado del producto en [docs/roadmap.md](docs/roadmap.md).
