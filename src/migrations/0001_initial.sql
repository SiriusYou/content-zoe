CREATE TABLE jobs (
  id                     TEXT PRIMARY KEY,
  week_key               TEXT NOT NULL UNIQUE,
  topic                  TEXT NOT NULL,
  locales                TEXT NOT NULL DEFAULT 'en,zh',
  attempt_number         INTEGER NOT NULL DEFAULT 1,
  status                 TEXT NOT NULL,
  current_stage          TEXT NOT NULL,
  run_dir                TEXT,
  artifact_dir           TEXT,
  primary_report_path    TEXT,
  translated_report_path TEXT,
  sources_path           TEXT,
  approval_summary       TEXT,
  as_of                  INTEGER,
  reject_scope           TEXT,
  reject_type            TEXT,
  reject_reason          TEXT,
  notified_at            INTEGER,
  last_notify_error      TEXT,
  error                  TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  CHECK (locales IN ('en', 'en,zh'))
);

-- statement-breakpoint

CREATE TABLE events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id         TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  type           TEXT NOT NULL,
  payload        TEXT,
  created_at     INTEGER NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
);

-- statement-breakpoint

CREATE INDEX idx_jobs_status_attempt ON jobs(status, attempt_number);

-- statement-breakpoint

CREATE INDEX idx_jobs_week_key ON jobs(week_key);

-- statement-breakpoint

CREATE INDEX idx_events_job_attempt ON events(job_id, attempt_number);

-- statement-breakpoint

CREATE UNIQUE INDEX idx_events_recovery_cleanup_unique
  ON events(job_id, attempt_number)
  WHERE type = 'recovery_cleanup';
