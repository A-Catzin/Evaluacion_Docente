# 08 — Resumen de Implementación SED-360 v2

> Documento final — Mayo 2026

## Stack
| Capa | Tecnología |
|------|-----------|
| Frontend | Astro SSR 4.16.18 + Tailwind CSS 3.4.17 |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage) |
| Auth | Google OAuth + middleware 4 roles |
| Importación | Python + SQL chunks desde CSVs |
| Runtime | Node.js 20.19.2 |

## Fórmula 360°
```
Nota Final = EE(35%) + CA(20%) + PD(15%) + OC(25%) + AE(5%)
```

## 5 Instrumentos — Completos ✅
| # | Instrumento | Reactivos | Evaluador |
|---|-------------|-----------|-----------|
| 1 | Encuesta Estudiantil | 51 (10 secciones A-J) | Estudiante |
| 2 | Coordinación Académica | 15 (5 categorías A-E) | Coordinador |
| 3 | Planeación Docente | Subida PDF + 4 criterios | Coordinador |
| 4 | Observación de Clase | 45/20/17 (según modalidad) | Coordinador |
| 5 | Autoevaluación Docente | 24 | Docente |

## Páginas (30+)
| Ruta | Rol |
|------|-----|
| `/`, `/auth`, `/auth/test` | Público |
| `/admin/dashboard`, `/admin/docentes`, `/admin/coordinadores`, `/admin/usuarios` | Admin |
| `/admin/roles`, `/admin/ofertas`, `/admin/campus`, `/admin/turnos`, `/admin/asignaturas`, `/admin/cuatrimestres` | Admin |
| `/admin/instrumentos`, `/admin/instrumentos/editar` | Admin |
| `/coordinador/dashboard`, `/coordinador/captura/*`, `/coordinador/planeaciones` | Coord/Admin |
| `/docente/dashboard`, `/docente/autodiagnostico`, `/docente/planeaciones` | Docente |
| `/estudiante/dashboard`, `/estudiante/encuesta/[id]` | Estudiante |

## BD (25+ tablas, 28 migraciones)
Catálogos normalizados, entidades con saeko_id, 5 instrumentos con GENERATED columns, RLS centralizado, triggers de auto-creación.

## Datos
- 72 docentes (de Reporte_clases, con materias)
- 1010 estudiantes (con email institucional)
- 47 grupos (con modalidad y turno)
- 11 ofertas académicas, 113 asignaturas

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
| Importación CSV | SQL chunks + script Python |
| Grupos sin match | Match por email + fallback apellidos |
| DECIMAL overflow 100 | `DECIMAL(5,2)` |
