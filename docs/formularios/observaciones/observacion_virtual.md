# Especificaciones Técnicas: Instrumento de Observación de Clase Virtual

Este documento define la estructura y métricas para el sistema de acompañamiento docente en entornos digitales, alineado al modelo institucional de evaluación.

---

## 1. Protocolo del Evaluador
**Objetivo:** Evaluar el desempeño docente en tiempo real durante sesiones sincrónicas, garantizando la objetividad mediante evidencia observable.

### Instrucciones Pre-Observación:
1.  Verificar conectividad (micrófono, cámara, enlace).
2.  Familiarizarse con las categorías del instrumento.
3.  Mantener un rol pasivo (no interactuar en la clase).
4.  Anotar evidencias objetivas (frases, herramientas usadas, acciones del docente).

---

## 2. Escala de Valoración Institucional (1-5)
| Nivel | Descripción | Características |
| :--- | :--- | :--- |
| **5** | Ejemplar | Modelo institucional: Innovadora, inspiradora y altamente estructurada. |
| **4** | Eficaz | Muy buen nivel: Clase clara, dinámica y bien gestionada. |
| **3** | Adecuado | Cumple lo esperado: Desarrollo funcional con áreas a mejorar. |
| **2** | Proceso de Mejora | Cumple parcialmente: Inconsistencias o problemas de interacción. |
| **1** | No Logrado | Fallas continuas: Sin estructura ni uso pedagógico. |
| **N/A** | No Aplica | El criterio no es observable en la sesión actual. |

---

## 3. Estructura de la Rúbrica (Dimensiones)

### A. Dimensión Cognitiva (CCO)
* **1CCO:** Organización y vinculación de contenidos con recursos digitales.
* **2CCO:** Uso de ejemplos y casos contextualizados al entorno en línea.
* **3CCO:** Adaptación ante limitaciones tecnológicas del grupo.
* **4CCO/5CCO:** Uso de apoyos visuales (gráficas, pizarras virtuales) para clarificar conceptos.
* **6CCO:** Promoción del razonamiento crítico (breakout rooms, debates).

### B. Dimensión Metacognitiva (CME)
* **1CME:** Generación de reflexión mediante foros o chats.
* **2CME:** Orientación sobre fortalezas y áreas de oportunidad.
* **3CME/5CME:** Fomento del aprendizaje autónomo y gestión propia en línea.
* **4CME:** Actividades de recapitulación o autoevaluaciones digitales.

### C. Dimensión Comunicativa (CCOM)
* **1CCOM:** Claridad en voz, dicción, ritmo y volumen.
* **2CCOM:** Manejo respetuoso de chats y turnos de voz.
* **3CCOM/4CCOM:** Explicación de dinámicas con lenguaje accesible.
* **5CCOM:** Verificación de comprensión (encuestas, reacciones).

### D. Dimensión Social y Afectiva (CSO/CAF)
* **Social:** Clima de respeto, participación equitativa y manejo de imprevistos técnicos.
* **Afectiva:** Ambiente de confianza y manejo cálido de la baja participación (cámaras apagadas).

### E. Gestión de la Enseñanza y Tecno-Pedagogía (CGE/CTE-PE)
* **Gestión:** Alineación con la planeación, uso de estrategias activas (Kahoot, Jamboard) y gestión del tiempo.
* **Tecno-Pedagogía:** Dominio de la plataforma virtual y promoción del uso ético de la tecnología.

### F. Dimensión Normativa (CNO)
* Inicio puntual, desarrollo conforme al calendario y respeto a la duración de la sesión.

---

## 4. Implementación Técnica (Supabase — Astro SSR + PostgreSQL)

### Tabla: `observaciones_virtuales`
Para tu arquitectura de datos, se recomienda la siguiente estructura:

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | uuid | PK. |
| `docente_id` | uuid | FK -> `profiles`. |
| `evaluador` | text | Nombre del evaluador (lista institucional). |
| `oferta_academica` | text | Carrera (Sistemas, Enfermería, etc.). |
| `cuatrimestre` | text | 1ro al 12vo. |
| `ciclo` | text | Ej: "26-3". |
| `puntajes` | jsonb | Almacena el ID del criterio (1CCO) y su valor (1-5). |
| `observaciones_texto` | jsonb | Comentarios por cada una de las 8 dimensiones. |
| `campus` | text | Campus de asignación. |

### Lógica de Validación:
* **Campos Obligatorios:** Todos los puntajes y el bloque de observaciones de cada dimensión deben estar llenos antes del `submit`.
* **Cálculo Automático:** El sistema debe promediar los puntajes por dimensión para generar el reporte visual de la observación.

---

## 5. Listado de Evaluadores Institucionales
Para el dropdown de tu interfaz:
* Oriana Nah, Eslivet Aguilar, Mari Carmen Martínez, Zulma Martínez, Elsa Garcia, Noadia González, Mario Medina, Karla Ponce, Cristhian Alvarado, Roberto Méndez, Lidia Medina, Roxana Landero, Josué Delgado, Jesús Aguilar, Merit Bazán, entre otros.

---