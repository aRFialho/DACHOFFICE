-- Sprint 9: Persist the bounded XLSX workbook bytes with its immutable metadata.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pricing_workbook_artifact) THEN
    RAISE EXCEPTION 'pricing_workbook_artifact rows must be backfilled before byte storage migration';
  END IF;
END;
$$;

ALTER TABLE pricing_workbook_artifact
  ADD COLUMN content_bytes bytea NOT NULL CHECK (octet_length(content_bytes) <= 10485760);

CREATE FUNCTION reject_pricing_workbook_artifact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pricing_workbook_artifact is immutable';
END;
$$;

CREATE TRIGGER pricing_workbook_artifact_immutable
  BEFORE UPDATE OR DELETE ON pricing_workbook_artifact
  FOR EACH ROW EXECUTE FUNCTION reject_pricing_workbook_artifact_mutation();
