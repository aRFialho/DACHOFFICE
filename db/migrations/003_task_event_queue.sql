CREATE TABLE task (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 20000),
  source text NOT NULL CHECK (source IN ('human', 'webhook', 'schedule', 'agent', 'meeting')),
  priority text NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  status text NOT NULL CHECK (status IN ('queued', 'assigned', 'executing', 'completed', 'failed', 'cancelled')),
  requested_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES task(id) ON DELETE SET NULL,
  assigned_agent_id uuid REFERENCES agent(id) ON DELETE SET NULL,
  assigned_department_id uuid REFERENCES department(id) ON DELETE SET NULL,
  due_context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX task_office_status_priority_idx ON task (office_id, status, priority, created_at);

CREATE TABLE task_context_item (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  context_key text NOT NULL CHECK (char_length(context_key) BETWEEN 1 AND 160),
  value_text text NOT NULL CHECK (char_length(value_text) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, context_key)
);

CREATE TABLE task_event (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL CHECK (sequence_number >= 1),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  from_status text,
  to_status text,
  actor_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, sequence_number)
);

CREATE INDEX task_event_task_sequence_idx ON task_event (task_id, sequence_number);

CREATE TABLE outbox_message (
  id uuid PRIMARY KEY,
  aggregate_type text NOT NULL CHECK (char_length(aggregate_type) BETWEEN 1 AND 80),
  aggregate_id uuid NOT NULL,
  topic text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 160),
  payload_json jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered')),
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_message_pending_idx ON outbox_message (status, available_at, created_at)
  WHERE status IN ('pending', 'processing');

CREATE TABLE worker_job_delivery (
  idempotency_key text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION reject_task_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'task_event is immutable';
END;
$$;

CREATE TRIGGER task_event_immutable
  BEFORE UPDATE OR DELETE ON task_event
  FOR EACH ROW EXECUTE FUNCTION reject_task_event_mutation();
