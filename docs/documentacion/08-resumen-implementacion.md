# 08 — Resumen de Implementación SED-360 v2

> Documento final — Mayo 2026

## Stack
| Capa | Tecnología |
|------|-----------|
| Frontend | Astro SSR 4.16.18 + Tailwind CSS 3.4.17 |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage) |
| Auth | Google OAuth + middleware 3 roles (sin estudiante) |
| Importación | API Astro + batch upsert PostgreSQL desde CSV Saeko |
| Runtime | Node.js 20.19.2 |

## Fórmula 360°
```
Nota Final = EE(35%) + CA(20%) + PD(15%) + OC(25%) + AE(5%)
```

## 5 Instrumentos — Completos ✅
| # | Instrumento | Datos | Evaluador |
|---|-------------|-------|-----------|
| 1 | Encuesta Estudiantil | 10 promedios desde CSV Saeko | Automático (Saeko) |
| 2 | Coordinación Académica | 15 (5 categorías A-E) | Coordinador |
| 3 | Planeación Docente | Subida PDF + 4 criterios | Coordinador |
| 4 | Observación de Clase | 45/20/17 (según modalidad) | Coordinador |
| 5 | Autoevaluación Docente | 24 | Docente |

> ⚠️ Eliminado: rol estudiante y encuesta manual. Las encuestas se importan desde CSV Saeko por el superadmin.

## Páginas (25+)
| Ruta | Rol |
|------|-----|
| `/`, `/auth`, `/auth/test` | Público |
| `/admin/dashboard`, `/admin/docentes`, `/admin/coordinadores`, `/admin/usuarios` | Admin |
| `/admin/importar` | Admin (solo superadmin) |
| `/admin/roles`, `/admin/ofertas`, `/admin/campus`, `/admin/turnos`, `/admin/asignaturas`, `/admin/cuatrimestres` | Admin |
| `/admin/instrumentos`, `/admin/instrumentos/editar` | Admin |
| `/coordinador/dashboard`, `/coordinador/captura/*`, `/coordinador/planeaciones` | Coord/Admin |
| `/docente/dashboard`, `/docente/autodiagnostico`, `/docente/planeaciones` | Docente |

## BD (25+ tablas, 9 migraciones)

Migraciones consolidadas de 28+ a 9:
- `001_esquema_base.sql` — Catálogos principales
- `002_instrumentos.sql` — 5 instrumentos, calificación final
- `003_configuracion.sql` — Config, triggers
- `004_encuesta_simplificada.sql` — Encuesta con 10 promedios y GENERATED column
- `005_coordinador_docentes.sql` — Vinculación coordinador↔docentes
- `006_docentes_maestros.sql` — 341 docentes desde CSV maestro
- `007_fix_encuesta_rls.sql` — RLS desactivado, nuevo UNIQUE
- `008_fix_ciclo_size.sql` — VARCHAR(30) para ciclo
- `009_limpiar_encuestas.sql` — Limpieza de datos previos

## Datos Reales
- **341** docentes maestros cargados (vía migración 006)
- **79-80** docentes con evaluaciones registradas
- **138** asignaturas
- **259** grupos (con modalidad, turno y clave)
- **~4500** evaluaciones estudiantiles (desde CSV Saeko)

## Páginas Destacadas

### `/admin/docentes`
Tabla principal con promedios generales por docente. Modal "Ver materias" con:
- Desglose por materia: Clave, Materia, Mod., Grupo, Est., Obs., Plan., Coord., Auto.
- EE, Obs, Plan son por materia (desde `docente_id + asignatura_id`)
- Coord y Auto son por docente (generales, repetidos por fila)
- Grupos desduplicados por `(docente_id, asignatura_id, clave_grupo)`

### `/admin/importar`
UI con barra de progreso para subir CSV Saeko. La API `importar-saeko.ts`:
- Filtra solo `Estado = 'Completada'`
- Agrupa por `docente + asignatura + ciclo`
- Calcula promedios reales de 10 categorías
- Batch upsert de ofertas, docentes, asignaturas, grupos, evaluaciones
- Match de emails reales desde `docentes_tecplayacar.csv`

## Problemas Resueltos
| Problema | Solución |
|----------|----------|
| WebSocket Node 20 | `import ws from 'ws'` |
| OAuth code_verifier | Flujo implícito + hash |
| RLS recursión | `rol_usuario(uid)` SECURITY DEFINER |
| Storage bucket privado | URLs firmadas |
| GENERATED column ref | Calcular desde columnas base |
| Docente inactivo al cambiar rol | Trigger automático |
| Preguntas hardcodeadas | `instrumento_preguntas` + editor |
| Grupos duplicados | Dedup por `(docente+asignatura+clave)` |
| Migraciones dispersas (28+) | Consolidadas en 9 archivos |
| Rol estudiante innecesario | Eliminado, reemplazado por CSV Saeko |
| DECIMAL overflow 100 | `DECIMAL(5,2)` |
| Encuesta 51 reactivos compleja | Simplificada a 10 promedios |
