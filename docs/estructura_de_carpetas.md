# Estructura de Proyecto — SED-360 v2

```text
/
├── docs/                       # Documentación
│   ├── documentacion/          # Docs por módulo (vigentes 08+)
│   ├── formularios/            # Especificaciones de formularios
│   │   ├── autodiagnostico.md
│   │   ├── evaluacion_docente_alumnos.md
│   │   ├── evalucion_coordinacion_academica.md
│   │   ├── gestion_planeaciones_docentes.md
│   │   └── observaciones/     # observacion.md, virtual, ejecutivo
│   ├── base_datos/             # CSVs fuente (Saeko, docentes maestros)
│   ├── contexto.md, requerimientos.md, architecture_patterns.md
│   ├── estructura_de_carpetas.md, roadmap.md, ui_ux_guidelines.md
│   └── sistema_evaluacion.md   # ⚠️ LEGACY v1 (no vigente)
├── public/                     # Assets estáticos
├── src/
│   ├── components/             # UI (futuro)
│   ├── layouts/               # 6 layouts (Base, Layout, Admin, Coordinador, Docente, Observador)
│   ├── lib/                   # supabaseClient, auth, sesion
│   ├── pages/                 # Páginas Astro
│   │   ├── admin/             # dashboard, docentes, coordinadores, usuarios, importar, catálogos
│   │   ├── coordinador/       # dashboard, captura, planeaciones
│   │   ├── docente/           # dashboard, autodiagnostico, planeaciones
│   │   ├── observador/        # dashboard
│   │   ├── api/               # Endpoints (13 admin APIs + auth/coordinador/docente)
│   │   ├── auth/              # login, callback
│   │   └── index.astro
│   ├── services/              # 9 servicios
│   └── types/                 # supabase.ts (25+ interfaces)
├── supabase/
│   └── migrations/            # 13 archivos SQL (001-004 consolidados + 005-010 fixes/extras)
├── tailwind.config.mjs
├── astro.config.mjs
├── tsconfig.json
└── package.json
```

> Las migraciones: 001-004 (base), 005 (coordinador_docentes), 006 (docentes maestros, 4 chunks), 007 (RLS), 008 (ciclo), 009 (limpieza), 010 (visibilidad dashboard).
