-- Migración TEST: Crear usuarios de prueba vía auth.users
-- SOLO PARA RAMA feature/test-mode

-- Insertar directamente en auth.users (requiere extensión pgcrypto o Supabase)
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'admin@test.sed360.com', '$2a$10$dummyhashfortest', now(), '{"provider":"email"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'coord@test.sed360.com', '$2a$10$dummyhashfortest', now(), '{"provider":"email"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'docente@test.sed360.com', '$2a$10$dummyhashfortest', now(), '{"provider":"email"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'est@test.sed360.com', '$2a$10$dummyhashfortest', now(), '{"provider":"email"}', '{}', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Insertar en usuarios
INSERT INTO usuarios (id, email, rol) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.sed360.com', 'superadmin'),
  ('00000000-0000-0000-0000-000000000002', 'coord@test.sed360.com', 'coordinador'),
  ('00000000-0000-0000-0000-000000000003', 'docente@test.sed360.com', 'docente'),
  ('00000000-0000-0000-0000-000000000004', 'est@test.sed360.com', 'estudiante')
ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol;
