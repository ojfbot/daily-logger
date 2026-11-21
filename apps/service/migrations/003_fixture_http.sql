CREATE TABLE dailylogger_service.owner_logins (
  cookie_hash text PRIMARY KEY,
  state_hash text NOT NULL,
  pkce_verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE dailylogger_service.owner_sessions (
  session_hash text PRIMARY KEY,
  actor_id text NOT NULL,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE dailylogger_service.fixture_http_requests (
  actor_id text NOT NULL,
  idempotency_key text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  intent_text text NOT NULL,
  command_id uuid NOT NULL UNIQUE REFERENCES dailylogger_service.fixture_commands(command_id),
  PRIMARY KEY (actor_id, idempotency_key)
);
