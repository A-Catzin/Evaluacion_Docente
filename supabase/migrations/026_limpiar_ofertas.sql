-- Migración 026: Limpiar ofertas académicas duplicadas
-- El CSV importó en MAYÚSCULAS. Migrar materias a las ofertas Title Case.

-- 1. Actualizar asignaturas: apuntar a la oferta Title Case si existe
UPDATE asignaturas a SET oferta_academica_id = o2.id
FROM ofertas_academicas o1, ofertas_academicas o2
WHERE a.oferta_academica_id = o1.id
  AND UPPER(o1.nombre) = o1.nombre  -- es MAYÚSCULAS
  AND o2.nombre = INITCAP(LOWER(o1.nombre))  -- versión Title Case
  AND o1.id != o2.id;

-- 2. Borrar las ofertas en MAYÚSCULAS que ya no tienen materias vinculadas
DELETE FROM ofertas_academicas
WHERE UPPER(nombre) = nombre
  AND id NOT IN (SELECT DISTINCT oferta_academica_id FROM asignaturas WHERE oferta_academica_id IS NOT NULL);
