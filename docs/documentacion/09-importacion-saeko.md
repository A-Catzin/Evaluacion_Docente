# 09 — Sistema de Importación CSV Saeko

> Endpoint: `src/pages/api/admin/importar-saeko.ts`
> UI: `src/pages/admin/importar.astro`

## Propósito

Importar evaluaciones estudiantiles desde el CSV exportado por Saeko, reemplazando completamente la encuesta manual. Solo el **superadmin** puede ejecutar la importación.

## Flujo General

```
CSV Saeko (.csv)
    ↓ POST /api/admin/importar-saeko (FormData)
    ↓ Validar sesión superadmin
    ↓ Parse CSV (split por coma, trim, quitar comillas)
    ↓ Filtrar solo filas con Estado = 'Completada'
    ↓
    ├── Agrupar entidades únicas:
    │   ├── Ofertas académicas (Plan de estudios)
    │   ├── Docentes (Nombre del docente)
    │   ├── Asignaturas (Clave + Nombre de la clase)
    │   └── Grupos (columna "Grupo")
    │
    ├── Batch upsert a Supabase:
    │   ├── ofertas_academicas (onConflict: nombre)
    │   ├── docentes (onConflict: email)
    │   └── asignaturas (onConflict: clave)
    │
    ├── Resolver IDs (FKs):
    │   ├── emailToId: Map<email, docente_id>
    │   └── claveToId: Map<clave_asignatura, asignatura_id>
    │
    ├── Insertar grupos (insert simple, sin UNIQUE)
    │
    └── Agrupar evaluaciones y hacer upsert:
        ├── Key: docente_email|clave_asig|ciclo
        ├── Acumular 10 categorías por estudiante
        ├── Calcular promedios: sum/t
        └── Upsert encuesta_estudiantil (onConflict: docente_id,asignatura_id,ciclo)
```

## Formato del CSV Esperado

Columnas de Saeko (las relevantes para la importación):

| Columna CSV | Campo en DB | Nota |
|---|---|---|
| `Plan de estudios` | `ofertas_academicas.nombre` | ej: `LIC ESC 2026-02` |
| `Nombre del docente` | `docentes.nombre + apellidos` | Se parsea: primeras 2 palabras = apellidos, resto = nombre |
| `Asignatura Clave` | `asignaturas.clave` | ej: `DEP31` |
| `Nombre de la clase` | `asignaturas.nombre` | ej: `TEORÍA DEL CASO Y DELITOS EN PARTICULAR` |
| `Grupo` | `grupos.clave` | ej: `26-2 DE 11 05A - Matutino` |
| `Ciclo escolar` | `encuesta_estudiantil.ciclo` | ej: `2026-02` |
| `Estado de la evaluación` | — | Solo se procesan filas con `'Completada'` |
| `Asistencia` | `prom_asistencia` | Promedio de todos los estudiantes |
| `Organización` | `prom_organizacion` | ídem |
| `Actitud` | `prom_actitud` | ídem |
| `Enseñanza` | `prom_ensenanza` | ídem |
| `Dominio del contenido` | `prom_dominio` | ídem |
| `Evaluación y calificación` | `prom_evaluacion` | ídem |
| `Participación y comunicación` | `prom_comunicacion` | ídem |
| `Gestión del grupo` | `prom_gestion` | ídem |
| `Tecnología` | `prom_tecnologia` | ídem |
| `Satisfacción global del estudiante` | `prom_satisfaccion` | ídem |
| `Promedio` | `promedio_general` | Promedio general de Saeko |
| `Comentarios` | `comentarios` | Concatenados con ` \| ` |

> ⚠️ El CSV de Saeko tiene **columnas duplicadas** (ej: dos columnas "Asistencia"). El código usa la primera ocurrencia porque el parse itera `headers.forEach((h, j) => row[h] = vals[j])` y la última sobreescribe.

## Match de Emails

Los docentes en el CSV Saeko vienen solo con nombre (sin email). Para vincularlos con la tabla `docentes`:

1. **Búsqueda exacta**: se normaliza el nombre a mayúsculas y se busca en `docentes_tecplayacar.csv` (cargado en la BD vía migración 006)
2. **Fuzzy match**: si no hay match exacto, se buscan apellidos por coincidencia parcial
3. **Fallback**: se genera un email auto-generado `nombre.apellido@tecplayacar.edu.mx`

## Agrupación de Evaluaciones

Las evaluaciones se agrupan por `(docente_email, clave_asignatura, ciclo)`:

```
gruposEval: Map<"email|clave|ciclo", {
  t: number,           // total de estudiantes
  sAsi: number,        // suma de Asistencia
  sOrg: number,        // suma de Organización
  ...                  // 10 categorías
  sGen: number,        // suma de Promedio
  comments: string[]   // comentarios concatenados
}>
```

Cada fila del CSV con `Estado = 'Completada'` suma sus valores al acumulador `g`. Al final:

```
prom_asistencia = +(g.sAsi / g.t).toFixed(2)   // ej: 4.85
promedio_general = +(g.sGen / g.t).toFixed(2)   // ej: 4.97
score_normalizado = promedio_general * 20       // GENERATED column en DB → 99.40
```

## Deduplicación

### Grupos
No tienen UNIQUE constraint. La API deduplica por `grupo_raw + clave_asignatura` antes de insertar:
```typescript
const key = grupo_raw + '||' + clave;
if (!grupoToDocAsig.has(key)) { ... }
```
Si el import se corre múltiples veces, se crearán duplicados. **Pendiente**: agregar UNIQUE en `grupos(docente_id, asignatura_id, clave)` y cambiar a upsert.

### Evaluaciones
Tienen UNIQUE en `(docente_id, asignatura_id, ciclo)`. El upsert sobreescribe los promedios anteriores si se re-importa el mismo ciclo.

## UI: `/admin/importar`

- Formulario con input `type="file"` (solo `.csv`)
- Barra de progreso animada durante la subida
- Resultado: conteo de filas procesadas, docentes, asignaturas, grupos, evaluaciones creadas
- Solo accesible para superadmin (validado en API y oculto en sidebar para otros roles)

## Datos Actuales (Mayo 2026)

| Métrica | Valor |
|---------|-------|
| Filas en CSV Saeko | ~5647 |
| Filas con Estado = 'Completada' | ~4500 |
| Docentes únicos evaluados | 79-80 |
| Asignaturas únicas | 138 |
| Grupos únicos | 259 |
| Evaluaciones (grupos de eval) | Variable según ciclos |
