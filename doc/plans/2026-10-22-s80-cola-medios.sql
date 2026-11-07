-- Media Studio queue priority, additive fragment for repository integration.
-- Priority is a bounded board-controlled ordering hint; existing rows retain FIFO order at 0.
ALTER TABLE media_jobs
  ADD COLUMN priority numeric(3, 0) NOT NULL DEFAULT 0;

ALTER TABLE media_jobs
  ADD CONSTRAINT media_jobs_priority_check CHECK (priority BETWEEN 0 AND 100);

-- Keep the existing FIFO index and add the ordering used by runQueue and the queue page.
CREATE INDEX media_jobs_priority_queue_idx
  ON media_jobs (company_id, status, priority DESC, created_at ASC, id ASC);
