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
│   ├── layouts/               # 4 layouts (Admin, Coordinador, Docente, Base)
│   ├── lib/                   # supabaseClient, auth, sesion
│   ├── pages/                 # Páginas Astro
│   │   ├── admin/             # dashboard, docentes, coordinadores, usuarios, importar, catálogos
│   │   ├── coordinador/       # dashboard, captura, planeaciones
│   │   ├── docente/           # dashboard, autodiagnostico, planeaciones
│   │   ├── api/               # Endpoints (importar-saeko, crear-usuario, docentes-evaluados, etc.)
│   │   ├── auth/              # login, callback
│   │   └── index.astro
│   ├── services/              # 10 servicios
│   └── types/                 # supabase.ts (25+ interfaces)
├── supabase/
│   └── migrations/            # 9 archivos SQL (001-004 consolidados + 005-009 fixes)
├── tailwind.config.mjs
├── astro.config.mjs
├── tsconfig.json
└── package.json
```

> ⚠️ Eliminado: `estudiante/` (páginas), `LayoutEstudiante.astro`, `sync/sql_generado/` (reemplazado por API de importación).
> Las migraciones pasaron de 28+ a 9 archivos consolidados.
