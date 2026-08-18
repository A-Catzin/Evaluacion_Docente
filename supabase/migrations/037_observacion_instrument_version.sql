-- Preserve the exact question set used when an observation is captured.
ALTER TABLE observaciones
  ADD COLUMN IF NOT EXISTS instrument_version TEXT;

-- The virtual v1 form has a fifth communicative item. It remains outside the
-- existing aggregate so historical scoring behavior is unchanged.
ALTER TABLE observaciones
  ADD COLUMN IF NOT EXISTS ccom5 SMALLINT;

ALTER TABLE observaciones
  DROP CONSTRAINT IF EXISTS observaciones_instrument_version_check;

ALTER TABLE observaciones
  ADD CONSTRAINT observaciones_instrument_version_check
  CHECK (instrument_version IS NULL OR instrument_version IN ('escolarizado-v1', 'virtual-v1', 'ejecutivo-v1'));
