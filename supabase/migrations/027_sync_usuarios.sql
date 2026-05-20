-- Migración 027: Sincronizar usuarios desde auth.users
INSERT INTO usuarios (id, email, rol)
SELECT id, email,
  CASE WHEN email LIKE 'tup-d%' THEN 'docente' ELSE 'estudiante' END
FROM auth.users
WHERE id NOT IN (SELECT id FROM usuarios);

-- Verificar
SELECT rol, count(*) FROM usuarios GROUP BY rol;
