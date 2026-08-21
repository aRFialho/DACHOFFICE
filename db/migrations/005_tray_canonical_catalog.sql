CREATE TABLE IF NOT EXISTS integration (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type = 'tray'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'unhealthy', 'disabled')),
  capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  credential_ref text NOT NULL CHECK (char_length(credential_ref) BETWEEN 1 AND 320),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, type, name),
  UNIQUE (id, office_id)
);

CREATE TABLE IF NOT EXISTS supplier (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, name),
  UNIQUE (id, office_id)
);

CREATE TABLE IF NOT EXISTS product (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  sku text NOT NULL CHECK (char_length(btrim(sku)) BETWEEN 1 AND 160),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 320),
  supplier_id uuid,
  ean text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, sku),
  UNIQUE (id, office_id),
  FOREIGN KEY (supplier_id, office_id)
    REFERENCES supplier(id, office_id) ON DELETE SET NULL (supplier_id)
);

CREATE TABLE IF NOT EXISTS product_cost_snapshot (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL,
  product_id uuid NOT NULL,
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  cost_numeric numeric(19,4) NOT NULL,
  currency text NOT NULL CHECK (char_length(currency) = 3),
  valid_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, office_id)
    REFERENCES product(id, office_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS external_product_mapping (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 80),
  external_product_id text NOT NULL
    CHECK (char_length(btrim(external_product_id)) BETWEEN 1 AND 320),
  external_variation_id text,
  external_sku text,
  product_id uuid,
  status text NOT NULL CHECK (status IN ('mapped', 'unresolved')),
  resolution_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, office_id)
    REFERENCES product(id, office_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'mapped' AND product_id IS NOT NULL AND resolution_reason IS NULL)
    OR (
      status = 'unresolved'
      AND product_id IS NULL
      AND resolution_reason IN ('missing_sku', 'ambiguous_sku', 'mapping_not_found')
    )
);

CREATE TABLE IF NOT EXISTS channel_listing (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL,
  product_id uuid NOT NULL,
  channel text NOT NULL CHECK (char_length(channel) BETWEEN 1 AND 80),
  external_listing_id text NOT NULL
    CHECK (char_length(btrim(external_listing_id)) BETWEEN 1 AND 320),
  external_variation_id text,
  external_sku text,
  current_price_numeric numeric(19,4) NOT NULL,
  current_promo_price_numeric numeric(19,4),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  status text NOT NULL CHECK (char_length(status) BETWEEN 1 AND 80),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, office_id)
    REFERENCES product(id, office_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS tray_store_connection (
  integration_id uuid PRIMARY KEY REFERENCES integration(id) ON DELETE CASCADE,
  store_id text NOT NULL CHECK (char_length(btrim(store_id)) BETWEEN 1 AND 320),
  api_address text NOT NULL CHECK (char_length(btrim(api_address)) BETWEEN 1 AND 2048),
  access_token_ciphertext bytea NOT NULL,
  access_token_iv bytea NOT NULL,
  access_token_auth_tag bytea NOT NULL,
  access_token_expires_at timestamptz NOT NULL,
  refresh_token_ciphertext bytea NOT NULL,
  refresh_token_iv bytea NOT NULL,
  refresh_token_auth_tag bytea NOT NULL,
  refresh_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);

CREATE TABLE IF NOT EXISTS catalog_sync_run (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'retryable', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  checkpoint_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  pages_seen integer NOT NULL DEFAULT 0 CHECK (pages_seen >= 0),
  items_seen integer NOT NULL DEFAULT 0 CHECK (items_seen >= 0),
  mapped_count integer NOT NULL DEFAULT 0 CHECK (mapped_count >= 0),
  unresolved_count integer NOT NULL DEFAULT 0 CHECK (unresolved_count >= 0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  failure_code text,
  FOREIGN KEY (integration_id, office_id)
    REFERENCES integration(id, office_id) ON DELETE RESTRICT,
  CHECK (completed_at IS NULL OR completed_at >= requested_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_office_sku_unique_idx
  ON product (office_id, sku);

CREATE UNIQUE INDEX IF NOT EXISTS external_product_mapping_external_identity_unique_idx
  ON external_product_mapping (
    office_id,
    provider,
    external_product_id,
    COALESCE(external_variation_id, '')
  );

CREATE UNIQUE INDEX IF NOT EXISTS channel_listing_external_identity_unique_idx
  ON channel_listing (
    office_id,
    channel,
    external_listing_id,
    COALESCE(external_variation_id, '')
  );

CREATE UNIQUE INDEX IF NOT EXISTS product_cost_snapshot_observation_unique_idx
  ON product_cost_snapshot (
    product_id,
    source,
    observed_at,
    COALESCE(source_reference, '')
  );

CREATE INDEX IF NOT EXISTS catalog_sync_run_pending_idx
  ON catalog_sync_run (integration_id, status, requested_at)
  WHERE status IN ('queued', 'retryable');
