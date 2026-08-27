CREATE TABLE office_runtime_event (
  sequence bigserial PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  office_id uuid NOT NULL REFERENCES office(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'agent.location.requested',
    'agent.state.changed',
    'approval.requested',
    'incident.war_room_requested',
    'meeting.started',
    'speech.created'
  )),
  payload_json jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX office_runtime_event_office_sequence_idx
  ON office_runtime_event (office_id, sequence);

CREATE FUNCTION reject_office_runtime_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'office_runtime_event is immutable';
END;
$$;

CREATE TRIGGER office_runtime_event_immutable
  BEFORE UPDATE OR DELETE ON office_runtime_event
  FOR EACH ROW EXECUTE FUNCTION reject_office_runtime_event_mutation();
