-- "Today" is defined per habit, in the habit's own IANA timezone.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
