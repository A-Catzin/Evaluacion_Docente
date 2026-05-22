# Especificaciones Técnicas: Sistema de Gestión de Planeaciones Didácticas (Ciclo 26-3)

> Tecnológico Universitario Playacar — Plataforma SED-360 v2

## 1. Módulo del Docente (Buzón de Entrega)

**Objetivo:** Permitir el registro individual de cada planeación por asignatura para el Sistema de Evaluación del Desempeño Docente 360°.

### Interfaz de Usuario y Campos

Todos los campos de identidad se precargan automáticamente desde el autodiagnóstico y Google OAuth:

| Campo | Origen | Tipo |
|-------|--------|------|
| Nombre completo | `docentes.nombre + apellidos` | Auto |
| Email institucional | `auth.users.email` | Auto |
| Campus asignado | `docentes.campus` | Auto |
| Oferta académica | `docentes.oferta_academica` | Dropdown (filtrado por carrera del docente) |
| Cuatrimestre | `cuatrimestres` activo | Auto |
| Turno y modalidad | `docentes.turno` | Auto |
| **Asignatura** | `asignaturas` filtradas por carrera | **Dropdown (manual)** |
| **Grupo** | Texto libre | **Manual** |
| ¿Proyecto en la asignatura? | Sí/No | Radio |
| ¿Integra laboratorio? | Sí/No/No aplica | Radio |
| ¿Visitas académicas? | Sí/No/No aplica | Radio |
| Comentario | Opcional | TextArea |
| **Archivo PDF** | Subida | **File input** |

### Múltiples planeaciones

Un docente puede subir **una planeación por cada asignatura** que imparte. La unicidad es `(docente_id, cuatrimestre_id, asignatura_id)`.

## 2. Subida de Archivos

| Parámetro | Valor |
|-----------|-------|
| Formato | Solo PDF |
| Tamaño máximo | 5 MB |
| Nomenclatura | **Automática**: `{Asignatura}_{Grupo}_{Apellido}_{Ciclo}.pdf` |
| Ejemplo | `Farmacologia_3A_Perez_26-3.pdf` |
| Destino | Supabase Storage — bucket `planeaciones` (privado) |
| Acceso | URLs firmadas temporales (1 hora) |
| Ruta | `{cuatrimestre_id}/{docente_id}/{archivo}.pdf` |

### Flujo técnico (vigente v2)
1. Docente selecciona PDF en el formulario
2. El archivo se envía al servidor Astro (POST `/api/docente/subir-archivo`)
3. El servidor sube el archivo a Supabase Storage (bucket privado `planeaciones`)
4. Se guarda el path y metadatos en la tabla `planeaciones`
5. Para visualizar: el sistema genera una **URL firmada temporal** (`createSignedUrl`)
6. Las URLs firmadas expiran en 1 hora — solo usuarios autorizados pueden acceder

## 3. Módulo del Coordinador (Evaluación)

El coordinador evalúa cada planeación con una **rúbrica de 4 criterios** (escala 1-5):

| # | Criterio | Campo |
|---|----------|-------|
| 1 | Alineación Curricular | `criterio_alineacion` |
| 2 | Secuencia Didáctica | `criterio_secuencia` |
| 3 | Recursos y Materiales (NTIC) | `criterio_recursos` |
| 4 | Sistemas de Evaluación | `criterio_evaluacion` |

### Cálculo del puntaje
```
Promedio = (c1 + c2 + c3 + c4) / 4
Puntaje normalizado = (Promedio / 5) × 100
```
Este puntaje alimenta el campo **"Prom. Plan."** en la tabla de docentes del admin.

### Estados
| Estado | Significado |
|--------|-------------|
| `Pendiente` | Recién subida, sin evaluar |
| `Aprobado` | Pasó la evaluación |
| `Corrección` | Requiere cambios — el docente puede re-subir |

### Retroalimentación
- **Comentario para el docente** (opcional): visible para el docente en su dashboard
- **Comentario interno** (opcional): solo visible para coordinadores

## 4. Gestión de Asignaturas (Materias)

El **admin** carga las materias desde `/admin/asignaturas`. Cada materia está ligada a una oferta académica:

```
ofertas_academicas (carreras)
    └── asignaturas (materias por carrera)
```

En el formulario de planeación, el docente primero ve su carrera, y el dropdown de materias se filtra automáticamente.

## 5. Limpieza de Archivos al Cerrar Ciclo

Al finalizar un cuatrimestre, el **superadmin** puede liberar espacio:

| Acción | Descripción |
|--------|-------------|
| **Endpoint** | `POST /api/admin/limpiar-archivos` |
| **Qué borra** | Todos los archivos del bucket con prefijo `{cuatrimestre_id}/` |
| **Confirmación** | Modal que muestra cuántos archivos y MB se eliminarán |
| **Seguridad** | Solo superadmin |

## 6. Estructura de Base de Datos

### Modificar: `asignaturas`
```sql
ALTER TABLE asignaturas ADD COLUMN oferta_academica_id INT REFERENCES ofertas_academicas(id);
```

### Nueva tabla: `planeaciones`
```sql
CREATE TABLE planeaciones (
  id SERIAL PRIMARY KEY,
  docente_id INT REFERENCES docentes(id),
  cuatrimestre_id INT REFERENCES cuatrimestres(id),
  asignatura_id INT REFERENCES asignaturas(id),
  campus TEXT, turno TEXT, modalidad TEXT,
  grupo TEXT NOT NULL,
  proyecto BOOLEAN DEFAULT false,
  laboratorio VARCHAR(10) DEFAULT 'No aplica',
  visitas VARCHAR(10) DEFAULT 'No aplica',
  url_pdf TEXT NOT NULL,
  nombre_archivo TEXT,
  comentario_docente TEXT,
  -- Evaluación del coordinador
  criterio_alineacion SMALLINT CHECK (criterio_alineacion BETWEEN 1 AND 5),
  criterio_secuencia SMALLINT CHECK (criterio_secuencia BETWEEN 1 AND 5),
  criterio_recursos SMALLINT CHECK (criterio_recursos BETWEEN 1 AND 5),
  criterio_evaluacion SMALLINT CHECK (criterio_evaluacion BETWEEN 1 AND 5),
  puntaje_promedio DECIMAL(4,2),
  estado VARCHAR(20) DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Aprobado','Corrección')),
  comentario_retroalimentacion TEXT,
  comentario_interno TEXT,
  fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_evaluacion TIMESTAMP,
  UNIQUE(docente_id, cuatrimestre_id, asignatura_id)
);
```

### RLS
```sql
ALTER TABLE planeaciones ENABLE ROW LEVEL SECURITY;
-- Docente inserta/lee sus planeaciones
CREATE POLICY "Docente gestiona sus planeaciones" ON planeaciones FOR ALL
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.entidad_id = docente_id AND u.rol = 'docente'));
-- Coordinador/admin lee/evalúa todas
CREATE POLICY "Staff lee y evalúa planeaciones" ON planeaciones FOR ALL
  USING (public.rol_usuario(auth.uid()) IN ('superadmin','coordinador'));
```

### Supabase Storage Bucket
```sql
-- Crear bucket (desde dashboard de Supabase o vía API)
-- Nombre: planeaciones
-- Política: solo authenticated puede subir/leer
```
