# Patrones de Arquitectura — SED-360 v2

## 1. Service Layer (8 servicios)

```
src/services/
├── catalogos.ts        # cuatrimestres, ofertas, campus, turnos, asignaturas
├── docentes.ts         # docentes, grupos
├── estudiantes.ts      # estudiantes, inscripciones
├── instrumentos.ts     # CA, PD, OC, AE (legacy)
├── calificaciones.ts   # calificacion_final_docente
├── autodiagnostico.ts  # auto-evaluación 24 ítems
├── observaciones.ts    # observación de clase
├── planeaciones.ts     # subida PDF + rúbrica
├── encuesta.ts         # encuesta estudiantil
└── usuarios.ts         # gestión de roles
```

## 2. Layouts por Rol (5 variantes)

```
src/layouts/
├── BaseLayout.astro        # Shell HTML común
├── Layout.astro            # Páginas públicas (landing, auth)
├── LayoutAdmin.astro       # Sidebar colapsable (Académico, Personal, Configuración)
├── LayoutCoordinador.astro # Top nav (CA, Observación, Planeaciones)
├── LayoutDocente.astro     # Top nav (Dashboard, Autodiagnóstico, Planeaciones)
└── LayoutEstudiante.astro  # Full-screen centrado
```

## 3. Middleware — Dominio + 4 Roles

```
RUTAS_PUBLICAS → next()
    ↓
Cookies de sesión → validar dominio @tecplayacar.edu.mx
    ↓
Mapa ROLES_POR_RUTA:
  /admin/*        → superadmin
  /coordinador/*  → coordinador, superadmin
  /docente/*      → docente, superadmin, coordinador
  /estudiante/*   → estudiante, superadmin
```

## 4. Flujo de Autenticación

```
/auth → Google OAuth → Supabase → /#access_token=...
    ↓
POST /api/auth/guardar-sesion → cookies
    ↓
GET /api/auth/rol → redirect por rol
```

## 5. Subida de Archivos

```
Navegador                    Supabase Storage           Backend (Astro SSR)
   │                              │                         │
   ├─ FormData con PDF           │                         │
   ├─ POST /api/docente/subir-archivo ──────────────────→│
   │                              │                         ├─ upload a Storage
   │                              │←── URL ────────────────│
   │                              │                         ├─ INSERT en BD
   │←── 201 ✅ ────────────────────────────────────────────│
```

El archivo sube del navegador → servidor → Storage. URLs firmadas para bucket privado.

## 6. Evaluación por Materia

Las evaluaciones se vinculan a `asignatura_id` y `grupo_id`. Un docente puede tener diferentes puntajes según la materia. El admin muestra promedio general + desglose por materia en modal.

## 7. Importación de Datos (CSV → SQL)

```
docs/base_datos/*.csv → sync/generar_sql.py → sql_generado/*.sql → Supabase SQL Editor
```

3 CSVs: docentes (347), alumnos (1010), clases (213). El script genera chunks de 100 líneas para evitar timeouts.
