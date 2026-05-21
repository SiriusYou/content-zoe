ALTER TABLE jobs
  ADD COLUMN purpose TEXT CHECK (purpose IN ('production', 'validation'));

-- statement-breakpoint

UPDATE jobs
SET purpose = 'validation'
WHERE id IN (
  '2026-W20-ai-trends',
  '2026-W21-ai-trends',
  '2026-W22-ai-trends',
  '2026-W23-ai-trends',
  '2026-W24-ai-trends'
);

-- statement-breakpoint

UPDATE jobs
SET purpose = 'production'
WHERE id = '2026-W25-ai-trends';
