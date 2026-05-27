# Patrones de Arquitectura — SED-360 v2

## 1. Service Layer (10 servicios)

```
src/services/
├── catalogos.ts        # cuatrimestres, ofertas, campus, turnos, asignaturas
├── docentes.ts         # docentes, grupos
├── instrumentos.ts     # CA, PD, OC, AE (legacy)
├── calificaciones.ts   # calificacion_final_docente
├── autodiagnostico.ts  # auto-evaluación 24 ítems
├── observaciones.ts    # observación de clase
├── planeaciones.ts     # subida PDF + rúbrica
├── encuesta.ts         # encuesta estudiantil
└── usuarios.ts         # gestión de roles
```

La importación CSV Saeko no usa service layer — va directo desde el endpoint API `importar-saeko.ts` con Supabase client.

## 2. Layouts por Rol (5 variantes)

```
src/layouts/
├── BaseLayout.astro        # Shell HTML común
├── Layout.astro            # Páginas públicas (landing, auth)
├── LayoutAdmin.astro       # Sidebar colapsable (Académico, Personal, Configuración)
├── LayoutCoordinador.astro # Top nav (CA, Observación, Planeaciones)
└── LayoutDocente.astro     # Top nav (Dashboard, Autodiagnóstico, Planeaciones)
```

> ⚠️ `LayoutEstudiante.astro` eliminado — el rol estudiante fue removido.

## 3. Middleware — Dominio + 3 Roles

```
RUTAS_PUBLICAS → next()
    ↓
Cookies de sesión → validar dominio @tecplayacar.edu.mx
    ↓
Mapa ROLES_POR_RUTA:
  /admin/*        → superadmin
  /coordinador/*  → coordinador, superadmin
  /docente/*      → docente, superadmin, coordinador
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

Las evaluaciones (EE, Obs, Plan) se vinculan a `asignatura_id`. Coord y Auto son por docente. En `/admin/docentes`:
- **Fila principal**: promedio general de todas las materias
- **Modal**: desglose por materia con scores individuales (EE, Obs, Plan) + generales (Coord, Auto)
- Grupos desduplicados por `(docente_id + asignatura_id + clave_grupo)` con un Set en server-side

## 7. Importación de Datos (CSV Saeko → API)

```
CSV Saeko (.csv)                              API Astro SSR                    Supabase
     │                                              │                              │
     ├─ POST /api/admin/importar-saeko (FormData) ──→│                              │
     │                                              ├─ Parse CSV, filtrar Completada│
     │                                              ├─ Agrupar por doc+asig+ciclo   │
     │                                              ├─ Batch upsert ofertas ───────→│
     │                                              ├─ Batch upsert docentes ──────→│
     │                                              ├─ Batch upsert asignaturas ───→│
     │                                              ├─ Resolver IDs (email→id, clave→id)
     │                                              ├─ Insert grupos (dedup) ──────→│
     │                                              ├─ Upsert encuesta_estudiantil ─→│
     │←── 200 { success, total, docentes, ... } ────│                              │
```

La UI en `/admin/importar` usa `FormData` con barra de progreso. La API valida sesión superadmin.
