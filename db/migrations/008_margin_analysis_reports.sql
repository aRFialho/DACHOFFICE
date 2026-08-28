ALTER TABLE task
  ADD CONSTRAINT task_id_office_id_unique UNIQUE (id, office_id);

ALTER TABLE agent
  ADD CONSTRAINT agent_id_office_id_unique UNIQUE (id, office_id);

ALTER TABLE agent_version
  ADD CONSTRAINT agent_version_id_agent_id_unique UNIQUE (id, agent_id);

CREATE TABLE IF NOT EXISTS margin_analysis_report (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  agent_version_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_json jsonb NOT NULL,
  evidence_json jsonb NOT NULL,
  provenance_json jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'no_margin_snapshots')),
  confidence text NOT NULL CHECK (confidence IN ('REAL', 'ESTIMATED')),
  revenue_numeric numeric(19,4) NOT NULL,
  cmv_numeric numeric(19,4) NOT NULL,
  taxes_numeric numeric(19,4) NOT NULL,
  marketplace_fees_numeric numeric(19,4) NOT NULL,
  seller_discounts_numeric numeric(19,4) NOT NULL,
  logistics_numeric numeric(19,4) NOT NULL,
  ads_cost_numeric numeric(19,4) NOT NULL,
  other_costs_numeric numeric(19,4) NOT NULL,
  contribution_amount_numeric numeric(19,4) NOT NULL,
  contribution_percent_numeric numeric(19,4) NOT NULL,
  calculated_at timestamptz NOT NULL,
  idempotency_key text NOT NULL
    CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (office_id, task_id),
  UNIQUE (office_id, idempotency_key),
  FOREIGN KEY (task_id, office_id)
    REFERENCES task(id, office_id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_id, office_id)
    REFERENCES agent(id, office_id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_version_id, agent_id)
    REFERENCES agent_version(id, agent_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS margin_analysis_report_office_task_idx
  ON margin_analysis_report (office_id, task_id);

CREATE INDEX IF NOT EXISTS margin_analysis_report_office_calculated_idx
  ON margin_analysis_report (office_id, calculated_at DESC, id DESC);

CREATE FUNCTION reject_margin_analysis_report_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'margin_analysis_report is immutable';
END;
$$;

CREATE TRIGGER margin_analysis_report_immutable
  BEFORE UPDATE OR DELETE ON margin_analysis_report
  FOR EACH ROW EXECUTE FUNCTION reject_margin_analysis_report_mutation();
