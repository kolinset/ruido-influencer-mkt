-- Estado "Programada" para campañas aprobadas que parten en una fecha próxima.
-- Si la tabla campaigns tiene una regla que limita los estados posibles, esto la quita
-- (si no la tiene, no hace nada). Se puede correr más de una vez sin problema.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'campaigns'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE campaigns DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
