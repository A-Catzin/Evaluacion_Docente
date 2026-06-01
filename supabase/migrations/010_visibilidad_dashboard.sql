-- 010: Columna de visibilidad en dashboard para docentes
ALTER TABLE docentes ADD COLUMN IF NOT EXISTS visible_dashboard BOOLEAN DEFAULT true;
