CREATE TABLE office (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 160),
  logo_asset_id uuid,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  trust_level text NOT NULL DEFAULT 'analytical'
    CHECK (trust_level IN ('analytical', 'supervised', 'autonomous')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE office_settings (
  office_id uuid PRIMARY KEY REFERENCES office(id) ON DELETE CASCADE,
  workday_start time NOT NULL,
  workday_end time NOT NULL,
  daily_meeting_offset_minutes integer NOT NULL DEFAULT 0 CHECK (daily_meeting_offset_minutes >= 0),
  default_refresh_minutes integer NOT NULL DEFAULT 15 CHECK (default_refresh_minutes > 0),
  monitoring_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (workday_start < workday_end)
);

CREATE TABLE department (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 80),
  lead_agent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, name)
);

CREATE TABLE agent (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES department(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  primary_role text NOT NULL CHECK (char_length(primary_role) BETWEEN 1 AND 160),
  active_version_id uuid,
  lifecycle_status text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'active', 'updating', 'suspended', 'archived')),
  current_state text NOT NULL DEFAULT 'idle' CHECK (char_length(current_state) BETWEEN 1 AND 80),
  supervisor_agent_id uuid REFERENCES agent(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, name)
);

CREATE TABLE agent_version (
  id uuid PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number >= 1),
  base_prompt text NOT NULL,
  mission text NOT NULL,
  communication_style text NOT NULL,
  responsibilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  restrictions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_profile text NOT NULL,
  trust_ceiling text NOT NULL DEFAULT 'analytical'
    CHECK (trust_ceiling IN ('analytical', 'supervised', 'autonomous')),
  change_type text NOT NULL CHECK (change_type IN ('soft', 'hard')),
  created_by_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version_number)
);

ALTER TABLE agent
  ADD CONSTRAINT agent_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES agent_version(id) ON DELETE RESTRICT;

ALTER TABLE department
  ADD CONSTRAINT department_lead_agent_fk
  FOREIGN KEY (lead_agent_id) REFERENCES agent(id) ON DELETE SET NULL;

CREATE TABLE agent_schedule (
  agent_id uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  work_start time NOT NULL,
  work_end time NOT NULL,
  break_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  on_call boolean NOT NULL DEFAULT false,
  timezone text NOT NULL,
  PRIMARY KEY (agent_id, weekday),
  CHECK (work_start < work_end)
);

CREATE TABLE agent_tool_grant (
  id uuid PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  tool_code text NOT NULL CHECK (char_length(tool_code) BETWEEN 1 AND 160),
  access_level text NOT NULL CHECK (access_level IN ('read', 'write')),
  limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_department_idx ON agent (department_id);
CREATE INDEX agent_schedule_agent_idx ON agent_schedule (agent_id);
CREATE INDEX agent_tool_grant_active_idx ON agent_tool_grant (agent_id, tool_code)
  WHERE revoked_at IS NULL;

CREATE FUNCTION reject_agent_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agent_version is immutable';
END;
$$;

CREATE TRIGGER agent_version_immutable
  BEFORE UPDATE OR DELETE ON agent_version
  FOR EACH ROW EXECUTE FUNCTION reject_agent_version_mutation();
