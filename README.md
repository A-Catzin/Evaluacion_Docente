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

## Roles (4 activos)

| Rol | Acceso |
|-----|--------|
| Superadmin | Total: KPIs, catálogos, usuarios, importación CSV, asignaciones, reportes |
| Coordinador | Evalúa docentes asignados: CA, OC, PD. Reportes de su grupo |
| Docente | Resultados al cierre, autodiagnóstico, planeaciones, feedback |
| Observador | Observaciones de clase a docentes asignados (3 modalidades) |

> El plan es volver a 5 roles en el futuro incluyendo estudiantes, migrando toda la información y procesos estudiantiles dentro de la app. Actualmente los datos de evaluación estudiantil provienen de importación CSV Saeko.

## Estructura del proyecto

```text
src/
├── components/          # Componentes UI reutilizables
├── features/            # Lógica de dominio (moderación, etc.)
├── layouts/             # Layouts por rol (BaseLayout, Layout, LayoutAdmin, LayoutCoordinador, LayoutDocente, LayoutObservador)
├── lib/                 # Clientes: db.ts, storage.ts (Cloudflare R2), supabaseClient.ts
├── pages/               # Páginas Astro + endpoints API
│   ├── admin/           # Dashboard, catálogos, docentes, evaluar-docentes, instrumentos, reportes
│   ├── coordinador/     # Dashboard, captura, docentes, planeaciones, reportes
│   ├── docente/         # Dashboard, autodiagnóstico, autoevaluación, materias, planeaciones
│   ├── observador/      # Dashboard
│   └── api/             # Endpoints REST (auth, admin, coordinador, docente)
├── services/            # Lógica de negocio: autodiagnostico, calificaciones, catalogos, docentes, estudiantes, instrumentos, notificaciones, observaciones, planeaciones, scoring, usuarios
└── types/               # Tipos TypeScript (supabase.ts)
supabase/
└── migrations/          # Migraciones 001–026 (incluye 026_neon y 025_notificaciones)
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

Ver `docs/contexto.md` para la visión general del sistema y `docs/roadmap.md` para el estado actual y plan futuro.
