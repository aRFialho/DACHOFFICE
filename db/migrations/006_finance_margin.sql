CREATE TABLE IF NOT EXISTS finance_rule_set (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (char_length(btrim(code)) BETWEEN 1 AND 120),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, code),
  UNIQUE (id, office_id)
);

CREATE TABLE IF NOT EXISTS finance_rule_version (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  rule_set_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_set_id, version),
  UNIQUE (id, office_id),
  FOREIGN KEY (rule_set_id, office_id)
    REFERENCES finance_rule_set(id, office_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS channel_fee_rule (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  finance_rule_version_id uuid NOT NULL,
  channel text NOT NULL CHECK (char_length(btrim(channel)) BETWEEN 1 AND 80),
  component_type text NOT NULL CHECK (component_type IN (
    'marketplace_commission',
    'fixed_fee',
    'service_fee',
    'seller_coupon',
    'marketplace_coupon',
    'seller_rebate',
    'marketplace_subsidy',
    'buyer_freight',
    'seller_freight',
    'tax',
    'ads_attribution',
    'payment_fee',
    'other'
  )),
  payer text NOT NULL CHECK (payer IN ('seller', 'marketplace', 'buyer', 'unknown')),
  fee_mode text NOT NULL CHECK (fee_mode IN ('percentage', 'fixed')),
  value_numeric numeric(19,4) NOT NULL,
  currency text CHECK (currency IS NULL OR char_length(currency) = 3),
  source text NOT NULL CHECK (char_length(btrim(source)) BETWEEN 1 AND 120),
  raw_code text,
  confidence text NOT NULL CHECK (confidence IN ('REAL', 'ESTIMATED')),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (finance_rule_version_id, office_id)
    REFERENCES finance_rule_version(id, office_id) ON DELETE RESTRICT,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK ((fee_mode = 'percentage' AND currency IS NULL) OR fee_mode = 'fixed')
);

CREATE TABLE IF NOT EXISTS order_header (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (char_length(btrim(channel)) BETWEEN 1 AND 80),
  external_order_id text NOT NULL
    CHECK (char_length(btrim(external_order_id)) BETWEEN 1 AND 320),
  status text NOT NULL CHECK (char_length(btrim(status)) BETWEEN 1 AND 80),
  ordered_at timestamptz NOT NULL,
  buyer_paid_total_numeric numeric(19,4) NOT NULL,
  currency text NOT NULL CHECK (char_length(currency) = 3),
  source text NOT NULL CHECK (char_length(btrim(source)) BETWEEN 1 AND 120),
  raw_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, channel, external_order_id),
  UNIQUE (id, office_id)
);

CREATE TABLE IF NOT EXISTS order_item (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  order_header_id uuid NOT NULL,
  product_id uuid,
  external_sku text,
  quantity integer NOT NULL CHECK (quantity > 0),
  gross_item_amount_numeric numeric(19,4) NOT NULL,
  seller_item_discount_numeric numeric(19,4) NOT NULL DEFAULT 0,
  channel_item_subsidy_numeric numeric(19,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, order_header_id, office_id),
  FOREIGN KEY (order_header_id, office_id)
    REFERENCES order_header(id, office_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, office_id)
    REFERENCES product(id, office_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS order_financial_component (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  order_header_id uuid NOT NULL,
  order_item_id uuid,
  component_type text NOT NULL CHECK (component_type IN (
    'marketplace_commission',
    'fixed_fee',
    'service_fee',
    'seller_coupon',
    'marketplace_coupon',
    'seller_rebate',
    'marketplace_subsidy',
    'buyer_freight',
    'seller_freight',
    'tax',
    'ads_attribution',
    'payment_fee',
    'other'
  )),
  payer text NOT NULL CHECK (payer IN ('seller', 'marketplace', 'buyer', 'unknown')),
  amount_numeric numeric(19,4) NOT NULL,
  currency text NOT NULL CHECK (char_length(currency) = 3),
  source text NOT NULL CHECK (char_length(btrim(source)) BETWEEN 1 AND 120),
  raw_code text,
  source_reference text,
  confidence text NOT NULL CHECK (confidence IN ('REAL', 'ESTIMATED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_header_id, office_id)
    REFERENCES order_header(id, office_id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id, order_header_id, office_id)
    REFERENCES order_item(id, order_header_id, office_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS order_margin_snapshot (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  order_header_id uuid NOT NULL,
  finance_rule_version_id uuid NOT NULL,
  revenue_basis text NOT NULL CHECK (char_length(btrim(revenue_basis)) BETWEEN 1 AND 120),
  cmv_numeric numeric(19,4) NOT NULL,
  taxes_numeric numeric(19,4) NOT NULL,
  marketplace_fees_numeric numeric(19,4) NOT NULL,
  seller_discounts_numeric numeric(19,4) NOT NULL,
  logistics_numeric numeric(19,4) NOT NULL,
  ads_cost_numeric numeric(19,4) NOT NULL,
  other_costs_numeric numeric(19,4) NOT NULL,
  contribution_amount_numeric numeric(19,4) NOT NULL,
  contribution_percent_numeric numeric(19,4) NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('REAL', 'ESTIMATED')),
  calculation_version text NOT NULL CHECK (char_length(btrim(calculation_version)) BETWEEN 1 AND 120),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (order_header_id, office_id)
    REFERENCES order_header(id, office_id) ON DELETE RESTRICT,
  FOREIGN KEY (finance_rule_version_id, office_id)
    REFERENCES finance_rule_version(id, office_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS order_header_channel_ordered_at_idx
  ON order_header (channel, ordered_at);

CREATE INDEX IF NOT EXISTS order_financial_component_order_header_idx
  ON order_financial_component (order_header_id);

CREATE INDEX IF NOT EXISTS order_margin_snapshot_order_calculated_idx
  ON order_margin_snapshot (order_header_id, calculated_at DESC);
