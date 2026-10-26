-- Bloque 2 (ciclo 27-1): 141 groups that only meet on Saturdays from 2026-10-24 to 2026-12-05.
-- Students have not had a class with these teachers yet, so the student survey is disabled for them
-- until the block starts. Same switch as migration 110: grupos.activo is NOT used because it also
-- drives planning, observation and teacher responsibility flows. The 2 responses already submitted
-- (groups 1100 and 1101) are kept and still counted.
-- Context and the full list: docs-privados/Bloques/BLOQUE_2_27-1.md

UPDATE public.grupos g
SET encuesta_estudiantil_habilitada = FALSE
WHERE g.cuatrimestre_id = 11
  AND g.id IN (
               946, 948, 950, 954, 955, 958, 961, 965, 967, 976, 977, 984,
               990, 991, 1008, 1010, 1013, 1015, 1019, 1022, 1024, 1026, 1036, 1037,
               1041, 1042, 1043, 1045, 1049, 1052, 1054, 1057, 1058, 1063, 1064, 1066,
               1069, 1070, 1072, 1076, 1078, 1080, 1084, 1085, 1086, 1092, 1093, 1095,
               1099, 1100, 1101, 1107, 1108, 1110, 1112, 1115, 1118, 1121, 1122, 1127,
               1129, 1130, 1132, 1135, 1136, 1140, 1141, 1142, 1145, 1146, 1366, 1367,
               1368, 1370, 1373, 1389, 1390, 1391, 1395, 1396, 1397, 1401, 1402, 1403,
               1404, 1407, 1408, 1410, 1413, 1414, 1416, 1420, 1424, 1425, 1426, 1427,
               1429, 1435, 1436, 1437, 1719, 1722, 1727, 1731, 1732, 1734, 1735, 1739,
               1740, 1745, 1748, 1750, 1751, 1753, 1756, 1758, 1760, 1763, 1765, 1766,
               2349755, 2349756, 2349761, 2349764, 2349766, 2349771, 2349775, 2349776, 2349778, 2349780, 2349782, 2349783,
               2349785, 2349786, 2349787, 2349861, 2349862, 2349866, 2349868, 2349870, 2349872
  );
