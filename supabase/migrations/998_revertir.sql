-- Revertir migración 998 (ejecutar en producción)
DELETE FROM usuarios WHERE email LIKE '%@test.sed360.com';
