-- Crear estudiante automáticamente al primer login
CREATE OR REPLACE FUNCTION crear_estudiante_nuevo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.rol = 'estudiante' AND NEW.entidad_id IS NULL THEN
    INSERT INTO public.estudiantes (nombre, apellidos, email, matricula, activo)
    VALUES (split_part(NEW.email, '@', 1), '', NEW.email, 'AUTO-' || substring(NEW.id::text, 1, 8), true)
    ON CONFLICT (email) DO NOTHING;
    UPDATE public.usuarios SET entidad_id = (SELECT id FROM public.estudiantes WHERE email = NEW.email)
    WHERE id = NEW.id AND entidad_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crear_estudiante ON usuarios;
CREATE TRIGGER trg_crear_estudiante AFTER INSERT OR UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION crear_estudiante_nuevo();

-- Crear estudiantes para usuarios existentes que no tengan
INSERT INTO estudiantes (nombre, apellidos, email, matricula, activo)
SELECT split_part(u.email, '@', 1), '', u.email, 'AUTO-' || substring(u.id::text, 1, 8), true
FROM usuarios u WHERE u.rol = 'estudiante' AND u.entidad_id IS NULL
ON CONFLICT (email) DO NOTHING;

UPDATE usuarios SET entidad_id = (SELECT e.id FROM estudiantes e WHERE e.email = usuarios.email)
WHERE rol = 'estudiante' AND entidad_id IS NULL;
