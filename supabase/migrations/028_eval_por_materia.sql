-- Migración 028: Evaluación por materia + modalidad en grupos
ALTER TABLE grupos ADD COLUMN IF NOT EXISTS modalidad VARCHAR(50) DEFAULT 'Escolarizado';
ALTER TABLE grupos ADD COLUMN IF NOT EXISTS turno_grupo VARCHAR(50);
ALTER TABLE asignaturas ADD COLUMN IF NOT EXISTS modalidad VARCHAR(50);
ALTER TABLE observaciones ADD COLUMN IF NOT EXISTS asignatura_id INT REFERENCES asignaturas(id);
ALTER TABLE observaciones ADD COLUMN IF NOT EXISTS grupo_id_fk INT REFERENCES grupos(id);
ALTER TABLE evaluacion_coordinacion ADD COLUMN IF NOT EXISTS asignatura_id INT REFERENCES asignaturas(id);
