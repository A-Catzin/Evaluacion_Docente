# SED-360 — Sistema de Evaluación Docente 360°

Plataforma de evaluación docente del Tecnológico Universitario Playacar. Mide el desempeño docente con 5 instrumentos evaluados por distintos actores y genera una calificación final ponderada con una categoría 360.

## Cómo se califica

| Instrumento | Quién lo aplica | Peso normal | Perfil NP / Corrección |
| ----------- | --------------- | ----------- | ---------------------- |
| Encuesta estudiantil | Estudiantes | 35 % | 40 % |
| Observación de clase | Observador | 25 % | 30 % |
| Planeación didáctica | Docente (aprueba coordinación) | 15 % | 0 % |
| Coordinación | Coordinador | 20 % | 25 % |
| Autodiagnóstico | Docente | 5 % | 5 % |

El mismo perfil de 4 instrumentos se usa en las modalidades ejecutiva e inglés. Las materias con planeación **NP** (no aplica) o en **Corrección** no cuentan la planeación y usan el perfil de 4 instrumentos. Un autodiagnóstico no realizado cuenta 0 cuando se cierra la ventana del ciclo.

| Categoría 360 | Rango |
| ------------- | ----- |
| Sobresaliente | 95–100 |
| Eficaz | 86–94 |
| Adecuado | 76–85 |
| Proceso de Mejora | 66–75 |
| Desempeño Crítico | 0–65 |

Los pesos y las categorías viven en `src/services/scoring.ts` y `src/lib/categoria360.ts`.

## Stack

| Capa | Tecnología |
| ---- | ---------- |
| Framework | Astro 5 (SSR, `@astrojs/vercel`) |
| Estilos | Tailwind CSS 3.4 |
| Base de datos | Supabase PostgreSQL (RLS y funciones SQL) |
| Auth | Google OAuth (`@tecplayacar.edu.mx`) + cookies de sesión |
| Storage | Cloudflare R2 (PDF de planeaciones) |
| Validación | Zod |
| Pruebas | Vitest |
| Deploy | Vercel (Node 22.x) |

## Roles y acceso

| Rol | Acceso |
| --- | ------ |
| Superadmin | Todo: dashboard, catálogos, usuarios, importaciones, asignaciones, seguimiento de instrumentos y reportes |
| Coordinador | Evalúa a sus docentes asignados (coordinación y planeaciones) y ve sus reportes y el detalle de cada docente |
| Observador | Observaciones de clase a sus docentes asignados |
| Docente | Resultados, autodiagnóstico, planeaciones y comentarios validados |
| Estudiante | Evalúa a los docentes de sus grupos elegibles en el ciclo activo |
| Pendiente | Acceso no resuelto; no habilita ningún portal |

El acceso se resuelve contra coincidencias exactas, únicas y activas del correo institucional en el padrón. Los roles explícitos de personal se conservan; las coincidencias ambiguas o ausentes quedan en `pendiente`.

## Estructura del proyecto

```text
src/
├── components/     # Componentes UI reutilizables
├── features/       # Lógica de dominio (moderación, etc.)
├── layouts/        # Layouts por rol
├── lib/            # Auth, roles, clientes de base y storage, reglas puras (categorías, límite de N/A)
├── pages/          # Páginas Astro y endpoints
│   ├── admin/      # Dashboard, catálogos, importaciones, docentes, instrumentos y reportes
│   ├── coordinador/# Dashboard, reportes, detalle de docentes, planeaciones y captura
│   ├── docente/    # Dashboard, autodiagnóstico, materias, planeaciones y actividad
│   ├── observador/ # Dashboard y actividad
│   ├── estudiante/ # Dashboard y encuesta por grupo
│   └── api/        # Endpoints (auth, admin, coordinador, docente, estudiante, instrumentos)
├── services/       # Lógica de negocio: calificaciones, scoring, planeaciones, observaciones, etc.
└── types/          # Tipos TypeScript
supabase/migrations/ # Migraciones de esquema
docs/                # Documentación pública
```

## Comandos

| Comando | Acción |
| ------- | ------ |
| `npm install` | Instalar dependencias |
| `npm run dev` | Servidor de desarrollo en `localhost:4321` |
| `npm run build` | Build de producción |
| `npm run preview` | Previsualizar el build |
| `npm run test` | Pruebas en modo watch |
| `npm run test:run` | Pruebas una sola vez |
| `npm run check:r2` | Verificar la configuración de Cloudflare R2 |
| `npx astro check` | Revisión de tipos |

## Configuración

Copiar `.env.example` a `.env` y completar las variables. Nunca se versionan valores ni llaves. R2 se habilita solo cuando están presentes `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` y una `R2_PUBLIC_URL` HTTPS válida; si falta alguna, queda deshabilitado de forma segura. Los cambios de variables en Vercel requieren un nuevo despliegue.

## Migraciones

Las migraciones de `supabase/migrations/` forman parte del contrato de despliegue. Se aplican en orden numérico con la CLI de Supabase (`supabase db query --linked -f supabase/migrations/<archivo>.sql`) **antes** de desplegar el código que las usa. `.gitignore` ignora la carpeta y lista una excepción por archivo, así que cada migración nueva debe agregarse ahí para versionarse.

## Calificaciones y reportes

Los scores finales se precalculan en `calificaciones_finales`. Se recalculan desde **Admin → Reportes por docente → Recalcular calificaciones** (`/api/admin/recalcular-calificaciones`) y automáticamente al enviar instrumentos. Conviene recalcular después de cerrar la ventana del autodiagnóstico, cambiar el estado de una planeación o abrir una encuesta.

## Documentación

- [Documentación técnica completa](docs/DOCUMENTACION.md): arquitectura, modelo de datos, API, despliegue y contribución.
- [Visión general](docs/contexto.md) y [roadmap](docs/roadmap.md).
- [Runbook operativo del ciclo](docs/operacion-ciclo-importaciones-y-ee-nativa.md): importaciones y evaluación estudiantil.
