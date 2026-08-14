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

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  body_md TEXT NOT NULL,
  cover_image TEXT,
  category TEXT,
  tags TEXT,
  related_service_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts (published_at);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts (slug);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts (id),
  parent_id INTEGER REFERENCES comments (id),
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  visitor_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (status);
