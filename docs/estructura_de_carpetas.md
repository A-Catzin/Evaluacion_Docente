# Estructura de Proyecto — SED-360 v2

```text
/
├── docs/                       # Documentación
│   ├── documentacion/          # Docs por módulo
│   ├── formularios/            # Especificaciones de formularios
│   │   ├── autodiagnostico.md
│   │   ├── evaluacion_docente_alumnos.md
│   │   ├── evalucion_coordinacion_academica.md
│   │   ├── gestion_planeaciones_docentes.md
│   │   └── observaciones/     # observacion.md, virtual, ejecutivo
│   ├── base_datos/             # CSVs fuente
│   ├── contexto.md, requerimientos.md, architecture_patterns.md
│   ├── estructura_de_carpetas.md, roadmap.md, ui_ux_guidelines.md
│   └── sistema_evaluacion.md
├── public/                     # Assets estáticos
├── src/
│   ├── components/             # UI (futuro)
│   ├── layouts/               # 5 layouts
│   ├── lib/                   # supabaseClient, auth, sesion
│   ├── pages/                 # 30+ páginas Astro
│   │   ├── admin/             # dashboard, docentes, coordinadores, usuarios, instrumentos, catálogos
│   │   ├── coordinador/       # dashboard, captura, planeaciones
│   │   ├── docente/           # dashboard, autodiagnostico, planeaciones
│   │   ├── estudiante/        # dashboard, encuesta
│   │   ├── api/               # 15+ endpoints
│   │   ├── auth/              # login, callback, test
│   │   └── index.astro
│   ├── services/              # 10 servicios
│   └── types/                 # supabase.ts (25+ interfaces)
├── sync/                      # Sincronización
│   ├── sql_generado/          # 27 SQL chunks para importar
│   └── .env.example
├── supabase/
│   └── migrations/            # 028 archivos SQL
├── tailwind.config.mjs
├── astro.config.mjs
├── tsconfig.json
└── package.json
```
