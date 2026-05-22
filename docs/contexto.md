# Documento de Contexto: Sistema de Evaluación Docente 360° (SED-360) v2

> Tecnológico Universitario Playacar — Mayo 2026

## 1. Visión General
Plataforma integral que mide el desempeño docente desde **5 instrumentos** evaluados por diferentes actores, generando una calificación final ponderada.

## 2. Actores y Roles (4 roles)

| Rol | Acceso | Dashboard |
|-----|--------|-----------|
| **Superadmin** | Total. KPIs, ranking, catálogos, usuarios, importación CSV | `/admin/dashboard` |
| **Coordinador** | Evalúa docentes de su área. Captura CA, OC, PD | `/coordinador/dashboard` |
| **Docente** | Ve resultados al cierre. Autodiagnóstico, sube planeaciones | `/docente/dashboard` |
| **Estudiante** | Responde encuesta anónima. Ve pendientes/completadas | `/estudiante/dashboard` |

## 3. Modelo de Calificación 360°

```
Nota Final = (EE × 0.35) + (CA × 0.20) + (PD × 0.15) + (OC × 0.25) + (AE × 0.05)
```

| Instrumento | Clave | Peso | Reactivos | Escala | Evaluador |
|-------------|-------|------|-----------|-------|-----------|
| Encuesta Estudiantil | EE | 35% | 51 (10 secciones A-J) | 1-5 Likert | Estudiante |
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

Cada docente tiene grupos vinculados a asignaturas. Las evaluaciones se hacen por materia. En `/admin/docentes`:
- **Fila principal**: promedio general de todas las materias
- **📊 Ver**: modal con desglose por materia (asignatura, modalidad, turno)

## 6. Reglas de Negocio

- **Anonimato**: Encuesta estudiantil usa `encuesta_control_envio` (tabla separada)
- **Dominio cerrado**: Solo `@tecplayacar.edu.mx` (middleware)
- **Cierre de cuatrimestre**: Resultados visibles solo al cerrar
- **Modalidad docente**: Múltiples modalidades por docente (Escolarizado, Virtual, Ejecutivo, Mixto)
- **Observación por modalidad**: El coordinador evalúa con el formulario de la modalidad del docente
- **Autodiagnóstico único**: Una sola vez por cuatrimestre
- **Planeaciones múltiples**: Una por cada materia que imparte
- **Voto único estudiante**: Un estudiante evalúa una vez por grupo
