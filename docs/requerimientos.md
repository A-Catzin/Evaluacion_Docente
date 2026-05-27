# Blueprint Técnico: SED-360 v2 — Mayo 2026

## 1. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | Astro SSR | 4.16.18 |
| CSS | Tailwind CSS | 3.4.17 |
| Backend/DB | Supabase (PostgreSQL) | — |
| Storage | Supabase Storage (bucket `planeaciones`) | — |
| Auth | Supabase Auth + Google OAuth | — |
| Importación | API Astro + batch upsert PostgreSQL | — |
| Despliegue | Vercel | — |

## 2. Autenticación

- **Google OAuth**: Login exclusivo con cuentas del dominio `@tecplayacar.edu.mx`
- **Flujo implícito**: Tokens en hash → cookies → redirect por rol
- **Middleware**: Validación de dominio + autorización por prefijo de ruta
- **Roles**: `superadmin`, `coordinador`, `docente` (3 roles; estudiante eliminado)

## 3. Base de Datos (25+ tablas, 9 migraciones)

Las migraciones se consolidaron de 28+ a 9 archivos:
- `001-004`: esquema base consolidado (catálogos, entidades, instrumentos, encuesta simplificada)
- `005-009`: fixes (coordinador_docentes, docentes maestros, RLS, ciclo size, limpieza)

### Catálogo (normalizado)
`cuatrimestres`, `ofertas_academicas`, `campus`, `turnos`, `asignaturas`

### Entidades
`docentes` (341 cargados, 79-80 evaluados), `grupos` (259, con modalidad, turno y clave)

### Evaluaciones (5 instrumentos)
`autodiagnosticos` (24 ítems), `planeaciones` (PDF + rúbrica), `observaciones` (45 ítems, 8 secciones), `evaluacion_coordinacion` (15 ítems, 5 categorías), `encuesta_estudiantil` (10 promedios desde CSV Saeko)

### Auth
`usuarios` — Sincronizado con `auth.users`, 3 roles, auto-creación al login

### Extras
`calificacion_final_docente`, `coordinador_docentes`, `instrumento_preguntas`

## 4. Supabase Storage

| Bucket | Uso | Tamaño |
|--------|-----|--------|
| `planeaciones` | PDFs de planeaciones (privado) | 5 MB/archivo |

URLs firmadas para acceso seguro. Limpieza al cerrar cuatrimestre.

## 5. Importación de Datos (CSV Saeko)

El superadmin importa el CSV de Saeko desde `/admin/importar`. La API `importar-saeko.ts`:
- Lee CSV con formato Saeko (columnas: Campus, Plan, Licenciatura, Grupo, Clave, Materia, etc.)
- Filtra solo filas con `Estado = 'Completada'`
- Agrupa evaluaciones por `docente + asignatura + ciclo`
- Calcula promedios reales de 10 categorías (Asistencia, Organización, Actitud, Enseñanza, Dominio, Evaluación, Comunicación, Gestión, Tecnología, Satisfacción)
- Batch upsert de ofertas, docentes (con match de emails reales), asignaturas, grupos, evaluaciones
- `score_normalizado = promedio_general × 20` (columna GENERATED en DB)
- Deduplicación: grupos por `(docente_email + clave_asig + grupo_raw)`, evaluaciones por UNIQUE(docente_id, asignatura_id, ciclo)
