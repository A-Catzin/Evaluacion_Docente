# Blueprint Técnico: SED-360 v2 — Mayo 2026

## 1. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | Astro SSR | 4.16.18 |
| CSS | Tailwind CSS | 3.4.17 |
| Backend/DB | Supabase (PostgreSQL) | — |
| Storage | Supabase Storage (bucket `planeaciones`) | — |
| Auth | Supabase Auth + Google OAuth | — |
| Importación | Scripts Python + SQL chunked | — |
| Despliegue | Vercel | — |

## 2. Autenticación

- **Google OAuth**: Login exclusivo con cuentas del dominio `@tecplayacar.edu.mx`
- **Flujo implícito**: Tokens en hash → cookies → redirect por rol
- **Middleware**: Validación de dominio + autorización por prefijo de ruta
- **Roles**: `superadmin`, `coordinador`, `docente`, `estudiante`

## 3. Base de Datos (25+ tablas)

### Catálogo (normalizado)
`cuatrimestres`, `ofertas_academicas`, `campus`, `turnos`, `asignaturas`

### Entidades
`docentes` (341, con saeko_id), `estudiantes` (1010, con saeko_id), `grupos` (47, con modalidad y turno), `inscripciones`

### Auth
`usuarios` — Sincronizado con `auth.users`, 4 roles, auto-creación al login

### Evaluaciones (5 instrumentos)
`autodiagnosticos` (24 ítems), `planeaciones` (PDF + rúbrica), `observaciones` (43 ítems, 8 secciones), `evaluacion_coordinacion` (15 ítems, 5 categorías), `encuesta_estudiantil` (51 ítems, 10 secciones)

### Control
`encuesta_control_envio` (anonimato), `calificacion_final_docente` (GENERATED)

### Editor
`instrumento_preguntas` — Preguntas editables con tipo de respuesta y opciones

## 4. Supabase Storage

| Bucket | Uso | Tamaño |
|--------|-----|--------|
| `planeaciones` | PDFs de planeaciones (privado) | 5 MB/archivo |

URLs firmadas para acceso seguro. Limpieza al cerrar cuatrimestre.

## 5. Migraciones (28 archivos)

`001` a `028` en `supabase/migrations/`. Cubren esquema completo, RLS, catálogos, 5 instrumentos, fórmulas, seed data, limpieza.

## 6. Importación de Datos

27 archivos SQL en `sync/sql_generado/` generados desde CSVs en `docs/base_datos/`. Orden: `00_limpiar` → `01_ofertas` → `02_docentes` → `03_asignaturas` → `04_estudiantes_*` → `05_grupos` → `06_inscripciones_*`.
