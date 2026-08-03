CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  visitor_id TEXT,
  session_id TEXT,
  page TEXT,
  page_title TEXT,
  device TEXT,
  referrer TEXT,
  query TEXT,
  source_type TEXT,
  source_name TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  target TEXT,
  label TEXT,
  role TEXT,
  seconds INTEGER,
  milestone INTEGER,
  progress INTEGER,
  title TEXT,
  payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events (event);
CREATE INDEX IF NOT EXISTS idx_analytics_source ON analytics_events (source_name);
CREATE INDEX IF NOT EXISTS idx_analytics_utm_campaign ON analytics_events (utm_campaign);
