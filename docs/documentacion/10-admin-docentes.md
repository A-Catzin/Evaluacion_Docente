# 10 — Página Admin Docentes (`/admin/docentes`)

> Archivo: `src/pages/admin/docentes.astro`

## Propósito

Vista principal del superadmin para consultar el desempeño 360° de todos los docentes con evaluaciones. Muestra promedios generales en tabla y desglose por materia en modal.

## Estructura de la Página

### Tabla Principal

Columnas: **Nombre**, **Email**, **Campus**, **Modalidad**, **Materias** (botón 📊 Ver), **Cat. 360**, **Final**, **Est.**, **Obs.**, **Coord.**, **Plan.**, **Auto.**

| Columna | Fuente | Cálculo |
|---------|--------|---------|
| Nombre, Email, Campus, Modalidad | `docentes` | — |
| Materias | Botón que abre modal | — |
| Cat. 360 | Categoría textual | `≥90=Sobresaliente, ≥80=Distinguido, ≥70=Bueno, ≥60=Aprobado, ≥50=A mejorar, <50=Insuficiente` |
| Final | Fórmula 360 ponderada | `EE×0.35 + CA×0.20 + PD×0.15 + OC×0.25 + AE×0.05` |
| Est. | `encuesta_estudiantil.score_normalizado` | Promedio de todas las materias |
| Obs. | `observaciones` (45 reactivos) | `Math.round((suma/num_reactivos/5)*100)` — promedio por materia |
| Coord. | `evaluacion_coordinacion.score_normalizado` | Primer registro (general por docente) |
| Plan. | `planeaciones.puntaje_promedio` | Promedio de todas las materias |
| Auto. | `autodiagnosticos.puntaje_total` | `Math.round((puntaje_total/120)*100)` |

### Cálculo de Promedios Generales

```typescript
// Para cada docente, iterar sus grupos (materias):
for (const g of grupos) {
  const est = eeMap?.get(g.asignatura_id);   // score EE de esa materia
  const obs = obsMap2?.get(g.asignatura_id);  // score Obs de esa materia
  const plan = planMap2?.get(g.asignatura_id); // score Plan de esa materia
  if (est || obs || plan) count++;
  if (est) sumEst += est;
  if (obs) sumObs += obs;
  if (plan) sumPlan += plan;
}
// Promedio de materias (no de grupos):
promEst = count > 0 ? Math.round(sumEst / count) : 0;
```

## Modal "Ver Materias"

### Trigger
Botón 📊 Ver en la columna Materias. Solo visible si el docente tiene al menos un grupo.

### Columnas
**Clave**, **Materia**, **Mod.**, **Grupos**, **Est.**, **Obs.**, **Plan.**, **Coord.**, **Auto.**

| Columna | Fuente | Nota |
|---------|--------|------|
| Clave | `asignaturas.clave` | ej: `DEP31` |
| Materia | `asignaturas.nombre` | ej: `TEORÍA DEL CASO Y DELITOS EN PARTICULAR` |
| Mod. | `grupos.modalidad` | Primera modalidad del grupo desduplicado |
| Grupos | `grupos.clave` | Clave del grupo, ej: `26-2 DE 11 05A` |
| Est. | `encuesta_estudiantil.score_normalizado` | Por `(docente_id, asignatura_id)` |
| Obs. | `observaciones` | Por `(docente_id, asignatura_id)` |
| Plan. | `planeaciones.puntaje_promedio` | Por `(docente_id, asignatura_id)`, más reciente |
| Coord. | `evaluacion_coordinacion.score_normalizado` | General del docente (repetido por fila) |
| Auto. | `autodiagnosticos.puntaje_total` | General del docente (repetido por fila) |

### Desduplicación de Grupos

```typescript
const seenGrupos = new Set<string>();
for (const g of gruposData) {
  const key = `${g.docente_id}|${g.asignatura_id}|${g.clave}`;
  if (seenGrupos.has(key)) continue;  // mismo docente+materia+clave → skip
  seenGrupos.add(key);
  grupoMap.get(g.docente_id)!.push({
    asignatura_id: g.asignatura_id,
    modalidad: g.modalidad,
    clave_grupo: g.clave
  });
}
```

Esto hace que:
- Grupos **idénticos duplicados** (mismo `docente + materia + clave`, por múltiples imports) → se colapsan a 1 fila
- Grupos **distintos** (misma materia, diferente clave, ej: `26-2 PED 11 02A` y `26-2 PED 12 02A`) → cada uno su fila

## Flujo de Datos Server→Cliente

### Server-side (Astro frontmatter)

1. Query `docentes` filtrados por `docsEvaluados` (Set de IDs con encuesta)
2. Queries batch a `evaluacion_coordinacion`, `autodiagnosticos`, `encuesta_estudiantil`, `observaciones`, `planeaciones`, `grupos`, `asignaturas`
3. Construir Maps: `eePorDocente`, `obsPorDocente`, `planPorDocente` como `Map<docente_id, Map<asignatura_id, score>>`
4. Calcular `filas` con promedios generales por docente
5. Serializar a JSON para el `<script is:inline>`

### Cliente-side (JavaScript inline)

```javascript
// Reconstruir Maps anidados desde JSON
var eeMap2 = new Map(eeData2.map(function(e){
  return [e[0], new Map(e[1])];
}));

function verMaterias(docenteId, nombreDocente) {
  var grupos = grupoMap2.get(docenteId);
  // Para cada grupo, buscar scores en eeMap2, obsMap2, planMap2
  // Coord y Auto vienen de coordMap2.get(docenteId) y diagMap2.get(docenteId)
}
```

> ⚠️ Los Maps no serializan a JSON nativamente. Se convierten a arrays de entries (`Array.from(map.entries())`) en el server y se reconstruyen en el cliente con `new Map(array)`.

## Queries Realizadas

| # | Tabla | Campos | Propósito |
|---|-------|--------|-----------|
| 1 | `docentes` | `*` (activo=true) | Lista base |
| 2 | `encuesta_estudiantil` | `docente_id` (DISTINCT) | Filtrar solo evaluados |
| 3 | `evaluacion_coordinacion` | `docente_id, score_normalizado` | Coord por docente |
| 4 | `autodiagnosticos` | `docente_id, puntaje_total` | Auto por docente |
| 5 | `encuesta_estudiantil` | `docente_id, asignatura_id, score_normalizado` | EE por materia |
| 6 | `observaciones` | `docente_id, asignatura_id, cco1..cno5` | Obs por materia |
| 7 | `planeaciones` | `docente_id, asignatura_id, puntaje_promedio` | Plan por materia |
| 8 | `grupos` | `docente_id, asignatura_id, modalidad, clave` | Grupos del docente |
| 9 | `asignaturas` | `id, clave, nombre` | Nombres de materias |

Total: **9 queries** (8 en paralelo vía Promise.all, 1 secuencial para observaciones).
