# Documento de Contexto: Sistema de Evaluación Docente 360° (SED-360) v2

> Tecnológico Universitario Playacar — Mayo 2026

## 1. Visión General
Plataforma integral que mide el desempeño docente desde **5 instrumentos** evaluados por diferentes actores, generando una calificación final ponderada. Las encuestas estudiantiles se importan automáticamente desde CSV Saeko (sin rol estudiante en el sistema).

## 2. Actores y Roles (3 roles)

| Rol | Acceso | Dashboard |
|-----|--------|-----------|
| **Superadmin** | Total. KPIs, ranking, catálogos, usuarios, importación CSV | `/admin/dashboard` |
| **Coordinador** | Evalúa docentes de su área. Captura CA, OC, PD | `/coordinador/dashboard` |
| **Docente** | Ve resultados al cierre. Autodiagnóstico, sube planeaciones | `/docente/dashboard` |

> ⚠️ El rol **estudiante** fue eliminado. Las encuestas provienen directamente del CSV de Saeko, importado por el superadmin desde `/admin/importar`.

## 3. Modelo de Calificación 360°

```
Nota Final = (EE × 0.35) + (CA × 0.20) + (PD × 0.15) + (OC × 0.25) + (AE × 0.05)
```

| Instrumento | Clave | Peso | Datos | Escala | Evaluador |
|-------------|-------|------|-------|-------|-----------|
| Encuesta Estudiantil | EE | 35% | 10 promedios desde CSV Saeko | 0-100 normalizado | Saeko (automático) |
| Coordinación Académica | CA | 20% | 15 (5 categorías A-E) | 1-5 | Coordinador |
| Planeación Docente | PD | 15% | Subida PDF + 4 criterios | 1-5 | Coordinador |
| Observación de Clase | OC | 25% | 45/20/17 (según modalidad) | 1-5 + N/A | Coordinador |
| Auto-evaluación | AE | 5% | 24 | 1-5 | Docente |

## 4. Modalidades de Observación

| Modalidad | Reactivos | Ruta |
|-----------|-----------|------|
| Escolarizado | 45 (8 secciones A-H) | `/coordinador/captura/observacion` |
| Virtual | 20 (6 secciones) | `/coordinador/captura/observacion-virtual` |
| Ejecutivo | 17 (5 secciones) | `/coordinador/captura/observacion-ejecutivo` |

## 5. Evaluación por Materia

Cada docente tiene grupos vinculados a asignaturas. Las evaluaciones (EE, Obs, Plan) se registran por `(docente_id, asignatura_id)`. Coord y Auto son por docente.

En `/admin/docentes`:
- **Fila principal**: promedio general de todas las materias
- **📊 Ver**: modal con desglose por materia: Clave, Materia, Mod., Grupos (clave), Est., Obs., Plan., Coord., Auto.
- Grupos desduplicados por `(docente_id + asignatura_id + clave_grupo)`
- Sidebar admin colapsable por grupos: Académico, Personal, Configuración

## 6. Importación CSV Saeko

El superadmin importa el CSV de Saeko desde `/admin/importar`. La API `importar-saeko.ts`:
- Agrupa evaluaciones por `docente + asignatura + ciclo`
- Calcula promedios reales de las 10 categorías Saeko
- Hace batch upsert de ofertas, docentes, asignaturas, grupos, evaluaciones
- `score_normalizado = promedio_general × 20` (columna GENERATED en DB)
- 79-80 docentes evaluados, 138 asignaturas, 259 grupos, ~4500 evaluaciones

## 7. Reglas de Negocio

- **Encuesta automática**: Sin rol estudiante ni encuesta manual. Datos vienen de Saeko.
- **Dominio cerrado**: Solo `@tecplayacar.edu.mx` (middleware)
- **Cierre de cuatrimestre**: Resultados visibles solo al cerrar
- **Modalidad docente**: Múltiples modalidades por docente (Escolarizado, Virtual, Ejecutivo, Mixto)
- **Observación por modalidad**: El coordinador evalúa con el formulario de la modalidad del docente
- **Autodiagnóstico único**: Una sola vez por cuatrimestre
- **Planeaciones múltiples**: Una por cada materia que imparte
- **RLS desactivado en `encuesta_estudiantil`**: La API ya valida superadmin; se usa upsert con UNIQUE(docente_id, asignatura_id, ciclo)
