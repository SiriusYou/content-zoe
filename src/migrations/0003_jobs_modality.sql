ALTER TABLE jobs ADD COLUMN modality TEXT NOT NULL DEFAULT 'text_report'
  CHECK (modality IN ('text_report','image'));

-- statement-breakpoint

CREATE INDEX idx_jobs_modality ON jobs(modality);
