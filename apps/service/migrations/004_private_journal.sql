CREATE TABLE dailylogger_service.journal_runs (
  run_id uuid PRIMARY KEY,
  request_key text NOT NULL UNIQUE,
  request_digest text NOT NULL,
  request jsonb NOT NULL,
  routing_digest text NOT NULL,
  job_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'complete', 'blocked')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dailylogger_service.journal_model_calls (
  run_id uuid NOT NULL REFERENCES dailylogger_service.journal_runs(run_id),
  step text NOT NULL CHECK (step IN ('draft', 'review', 'revise')),
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 3),
  request_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('dispatching', 'rejected', 'uncertain', 'invalid', 'complete')),
  result text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK ((status = 'complete') = (result IS NOT NULL)),
  PRIMARY KEY (run_id, step, attempt)
);
