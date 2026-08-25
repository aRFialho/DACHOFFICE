-- Sprint 9: Cost and Pricing Agent evidence, simulations, and prepared actions.

CREATE TABLE IF NOT EXISTS supplier_price_table (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL,
  source_name text NOT NULL CHECK (char_length(btrim(source_name)) BETWEEN 1 AND 160),
  effective_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  imported_by_user_id uuid,
  row_count integer NOT NULL CHECK (row_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, office_id, supplier_id),
  UNIQUE (office_id, supplier_id, content_sha256),
  UNIQUE (office_id, idempotency_key),
  FOREIGN KEY (supplier_id, office_id) REFERENCES supplier(id, office_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS supplier_price_table_office_supplier_effective_idx
  ON supplier_price_table (office_id, supplier_id, effective_at DESC, observed_at DESC, id DESC);

CREATE FUNCTION reject_supplier_price_table_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'supplier_price_table is immutable';
END;
$$;

CREATE TRIGGER supplier_price_table_immutable
  BEFORE UPDATE OR DELETE ON supplier_price_table
  FOR EACH ROW EXECUTE FUNCTION reject_supplier_price_table_mutation();

CREATE TABLE IF NOT EXISTS supplier_price_table_row (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_price_table_id uuid NOT NULL,
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  source_sku text NOT NULL CHECK (char_length(btrim(source_sku)) BETWEEN 1 AND 160),
  cost_numeric numeric(19,4) NOT NULL CHECK (cost_numeric >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  source_fields_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_id uuid,
  mapping_status text NOT NULL CHECK (mapping_status IN ('mapped', 'unresolved')),
  resolution_reason text,
  mapped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, office_id, supplier_id),
  UNIQUE (supplier_price_table_id, source_row_number),
  FOREIGN KEY (supplier_price_table_id, office_id, supplier_id)
    REFERENCES supplier_price_table(id, office_id, supplier_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, office_id) REFERENCES product(id, office_id) ON DELETE RESTRICT,
  CHECK (
    (mapping_status = 'mapped' AND product_id IS NOT NULL AND resolution_reason IS NULL AND mapped_at IS NOT NULL)
    OR (
      mapping_status = 'unresolved' AND product_id IS NULL
      AND resolution_reason IN ('missing_sku', 'ambiguous_sku', 'mapping_not_found', 'supplier_mismatch')
    )
  )
);

CREATE INDEX IF NOT EXISTS supplier_price_table_row_pricing_lookup_idx

  ON supplier_price_table_row (office_id, supplier_id, product_id, mapping_status, created_at DESC);

CREATE FUNCTION supplier_price_table_row_exact_product_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mapping_status = 'mapped' THEN
    IF NOT EXISTS (
      SELECT 1 FROM product p
      WHERE p.id = NEW.product_id AND p.office_id = NEW.office_id
        AND p.supplier_id = NEW.supplier_id AND p.sku = NEW.source_sku
    ) THEN
      RAISE EXCEPTION 'supplier price table row requires an exact same-supplier SKU mapping';
    END IF;
  ELSIF NEW.mapped_at IS NOT NULL THEN
    RAISE EXCEPTION 'unresolved supplier price table row cannot have mapped_at';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_price_table_row_exact_product_mapping
  BEFORE INSERT OR UPDATE ON supplier_price_table_row
  FOR EACH ROW EXECUTE FUNCTION supplier_price_table_row_exact_product_mapping();

CREATE TABLE IF NOT EXISTS pricing_simulation_report (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  agent_version_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel ~ '^[a-z0-9][a-z0-9_-]*$'),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_json jsonb NOT NULL,
  provenance_json jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'completed_with_findings')),
  confidence text NOT NULL CHECK (confidence IN ('REAL', 'ESTIMATED')),
  calculated_at timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (id, office_id),
  UNIQUE (office_id, task_id),
  UNIQUE (office_id, idempotency_key),
  FOREIGN KEY (task_id, office_id)
    REFERENCES task(id, office_id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_id, office_id)
    REFERENCES agent(id, office_id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_version_id, agent_id)
    REFERENCES agent_version(id, agent_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pricing_simulation_report_office_task_idx
  ON pricing_simulation_report (office_id, task_id);
CREATE INDEX IF NOT EXISTS pricing_simulation_report_office_calculated_idx
  ON pricing_simulation_report (office_id, calculated_at DESC, id DESC);

CREATE FUNCTION reject_pricing_simulation_report_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pricing_simulation_report is immutable';
END;
$$;

CREATE TRIGGER pricing_simulation_report_immutable
  BEFORE UPDATE OR DELETE ON pricing_simulation_report
  FOR EACH ROW EXECUTE FUNCTION reject_pricing_simulation_report_mutation();

CREATE TABLE IF NOT EXISTS pricing_workbook_artifact (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  pricing_simulation_report_id uuid NOT NULL,
  storage_key text NOT NULL CHECK (char_length(btrim(storage_key)) BETWEEN 1 AND 1024),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer NOT NULL CHECK (byte_length > 0),
  media_type text NOT NULL CHECK (media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, pricing_simulation_report_id),
  UNIQUE (office_id, storage_key),
  FOREIGN KEY (pricing_simulation_report_id, office_id)
    REFERENCES pricing_simulation_report(id, office_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pricing_workbook_artifact_office_report_idx

  ON pricing_workbook_artifact (office_id, pricing_simulation_report_id);

CREATE TABLE IF NOT EXISTS pricing_prepared_action (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  pricing_simulation_report_id uuid NOT NULL,
  product_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel ~ '^[a-z0-9][a-z0-9_-]*$'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  proposed_price_numeric numeric(19,4) NOT NULL CHECK (proposed_price_numeric >= 0),
  break_even_minimum_price_numeric numeric(19,4) NOT NULL CHECK (break_even_minimum_price_numeric >= 0),
  policy_decision text NOT NULL CHECK (policy_decision IN ('allowed', 'approval_required', 'denied')),
  status text NOT NULL CHECK (status IN ('prepared', 'blocked')),
  policy_evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, pricing_simulation_report_id, product_id),
  UNIQUE (office_id, idempotency_key),
  FOREIGN KEY (pricing_simulation_report_id, office_id)
    REFERENCES pricing_simulation_report(id, office_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, office_id) REFERENCES product(id, office_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'prepared' AND policy_decision IN ('allowed', 'approval_required')
      AND proposed_price_numeric >= break_even_minimum_price_numeric)
    OR (status = 'blocked' AND policy_decision = 'denied')
  )
);

CREATE FUNCTION reject_pricing_prepared_action_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pricing_prepared_action is immutable';
END;
$$;

CREATE TRIGGER pricing_prepared_action_immutable
  BEFORE UPDATE OR DELETE ON pricing_prepared_action
  FOR EACH ROW EXECUTE FUNCTION reject_pricing_prepared_action_mutation();
