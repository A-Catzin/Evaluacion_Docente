-- =============================================================
-- Migración 019: Consolidado Final — Fórmula + Limpieza
-- Ejecutar esta ÚNICA migración para dejar todo actualizado
-- =============================================================

-- 1. Actualizar fórmula de ponderación: EE(35) + CA(20) + PD(15) + OC(25) + AE(5)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calificacion_final_docente' AND column_name='calificacion_final') THEN
    ALTER TABLE calificacion_final_docente DROP COLUMN calificacion_final;
  END IF;
END $$;

ALTER TABLE calificacion_final_docente ADD COLUMN calificacion_final DECIMAL(5,2) GENERATED ALWAYS AS (
    COALESCE(score_encuesta_estudiantil, 0) * 0.35 +
    COALESCE(score_coordinacion, 0) * 0.20 +
    COALESCE(score_planeacion, 0) * 0.15 +
    COALESCE(score_observacion, 0) * 0.25 +
    COALESCE(score_autoevaluacion, 0) * 0.05
) STORED;

-- 2. Marcar docente inactivo al cambiar rol + limpiar entidad_id
CREATE OR REPLACE FUNCTION limpiar_entidad_al_cambiar_rol()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.rol != 'docente' AND OLD.rol = 'docente' AND OLD.entidad_id IS NOT NULL THEN
    UPDATE docentes SET activo = false WHERE id = OLD.entidad_id;
    NEW.entidad_id = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpiar_entidad ON usuarios;
CREATE TRIGGER trg_limpiar_entidad BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION limpiar_entidad_al_cambiar_rol();

-- 3. Limpiar datos existentes (usuarios que no son docentes pero tienen entidad_id)
UPDATE docentes SET activo = false WHERE id IN (SELECT entidad_id FROM usuarios WHERE rol != 'docente' AND entidad_id IS NOT NULL);
UPDATE usuarios SET entidad_id = NULL WHERE rol != 'docente' AND entidad_id IS NOT NULL;

-- 4. Solo mostrar docentes activos en queries (política existente se mantiene)
-- Las queries ya filtran por activo = true desde src/services/docentes.ts

-- ✅ Listo. Todos los cambios aplicados.
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
