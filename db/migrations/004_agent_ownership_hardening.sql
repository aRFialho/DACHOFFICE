ALTER TABLE department
  ADD CONSTRAINT department_id_office_unique UNIQUE (id, office_id);

ALTER TABLE agent
  ADD CONSTRAINT agent_id_office_unique UNIQUE (id, office_id);

ALTER TABLE agent_version
  ADD CONSTRAINT agent_version_id_agent_unique UNIQUE (id, agent_id);

ALTER TABLE agent
  DROP CONSTRAINT agent_active_version_fk;

ALTER TABLE agent
  ADD CONSTRAINT agent_active_version_owner_fk
  FOREIGN KEY (active_version_id, id)
  REFERENCES agent_version (id, agent_id)
  ON DELETE RESTRICT;

ALTER TABLE department
  DROP CONSTRAINT department_lead_agent_fk;

ALTER TABLE department
  ADD CONSTRAINT department_lead_agent_owner_fk
  FOREIGN KEY (lead_agent_id, office_id)
  REFERENCES agent (id, office_id)
  ON DELETE SET NULL (lead_agent_id);

ALTER TABLE agent
  ADD CONSTRAINT agent_supervisor_owner_fk
  FOREIGN KEY (supervisor_agent_id, office_id)
  REFERENCES agent (id, office_id)
  ON DELETE SET NULL (supervisor_agent_id);

ALTER TABLE agent
  DROP CONSTRAINT agent_department_id_fkey;

ALTER TABLE agent
  ADD CONSTRAINT agent_department_owner_fk
  FOREIGN KEY (department_id, office_id)
  REFERENCES department (id, office_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX agent_tool_grant_one_active_per_tool_idx
  ON agent_tool_grant (agent_id, tool_code)
  WHERE revoked_at IS NULL;
