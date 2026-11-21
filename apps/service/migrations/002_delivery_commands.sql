ALTER TABLE dailylogger_service.fixture_runs ADD COLUMN delivery_owner text
  CHECK (delivery_owner IS NULL OR delivery_owner = 's03b');

CREATE TABLE dailylogger_service.delivery_installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  library_version text NOT NULL, schema_version integer NOT NULL,
  queue_config_digest text NOT NULL
);

CREATE TABLE dailylogger_service.fixture_commands (
  command_id uuid PRIMARY KEY,
  actor_id text NOT NULL, idempotency_key text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  operation text NOT NULL CHECK (operation IN ('start','resume','recover','cancel')),
  route text NOT NULL, request_text text NOT NULL, request_digest text NOT NULL,
  run_id uuid REFERENCES dailylogger_service.fixture_runs(run_id),
  target_text text NOT NULL,
  admission text NOT NULL CHECK (admission IN ('admitted','rejected')),
  response_status integer NOT NULL, response_text text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('queued','running','retrying','reconciliation_required','succeeded','failed','stale','cancelled','rejected')),
  job_id uuid UNIQUE,
  result_text text, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
  UNIQUE(actor_id, idempotency_key)
);
CREATE INDEX fixture_commands_run ON dailylogger_service.fixture_commands(run_id, created_at);

CREATE TABLE dailylogger_service.resume_targets (
  target_id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES dailylogger_service.fixture_runs(run_id),
  target_digest text NOT NULL, target_text text NOT NULL,
  consumed_by uuid UNIQUE REFERENCES dailylogger_service.fixture_commands(command_id),
  created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz,
  UNIQUE(run_id, target_digest)
);

CREATE TABLE dailylogger_service.run_cancellations (
  command_id uuid PRIMARY KEY REFERENCES dailylogger_service.fixture_commands(command_id),
  run_id uuid NOT NULL REFERENCES dailylogger_service.fixture_runs(run_id),
  state text NOT NULL CHECK (state IN ('requested','effective','already_completed')),
  requested_at timestamptz NOT NULL DEFAULT now(), reconciled_at timestamptz
);
CREATE INDEX run_cancellations_run ON dailylogger_service.run_cancellations(run_id);
ALTER TABLE dailylogger_service.operation_attempts
  ADD COLUMN command_id uuid REFERENCES dailylogger_service.fixture_commands(command_id),
  ADD COLUMN job_id uuid, ADD COLUMN delivery_retry integer;
