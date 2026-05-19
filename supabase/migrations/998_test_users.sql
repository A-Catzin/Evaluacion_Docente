-- Migración TEST: Crear usuarios de prueba
-- SOLO PARA RAMA feature/test-mode. NO EJECUTAR EN PRODUCCIÓN.

-- Insertar en usuarios (se necesita que existan en auth.users... pero para test usamos el sistema de tokens)
-- Como usamos tokens falsos, solo necesitamos que existan en la tabla usuarios
-- Los IDs son UUIDs válidos pero no están en auth.users (el middleware en modo test los acepta igual)

-- Si no existen usuarios de test, los creamos con IDs fijos
INSERT INTO usuarios (id, email, rol) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.local', 'superadmin'),
  ('00000000-0000-0000-0000-000000000002', 'coord@test.local', 'coordinador'),
  ('00000000-0000-0000-0000-000000000003', 'docente@test.local', 'docente'),
  ('00000000-0000-0000-0000-000000000004', 'est@test.local', 'estudiante')
ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol;

-- Crear docente de prueba vinculado al usuario docente test
INSERT INTO docentes (nombre, apellidos, email, num_empleado, activo)
VALUES ('Docente', 'Test', 'docente@test.local', 'TEST001', true)
ON CONFLICT (email) DO NOTHING;

UPDATE usuarios SET entidad_id = (SELECT id FROM docentes WHERE email = 'docente@test.local')
WHERE email = 'docente@test.local' AND entidad_id IS NULL;

-- Crear estudiante de prueba
INSERT INTO estudiantes (nombre, apellidos, email, matricula, activo)
VALUES ('Estudiante', 'Test', 'est@test.local', 'TEST001', true)
ON CONFLICT (email) DO NOTHING;

UPDATE usuarios SET entidad_id = (SELECT id FROM estudiantes WHERE email = 'est@test.local')
WHERE email = 'est@test.local' AND entidad_id IS NULL;
