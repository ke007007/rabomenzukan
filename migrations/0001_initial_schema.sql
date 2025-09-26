-- Members basic info
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  preferred_name TEXT,
  image_url TEXT,
  occupation TEXT,
  why_lab TEXT,
  what_to_do TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tags catalog: interest / involvement / area
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('interest','involvement','area')),
  UNIQUE(name, category)
);

-- Member-Tag relations
CREATE TABLE IF NOT EXISTS member_tags (
  member_id TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (member_id, tag_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Core values given by others (or self)
CREATE TABLE IF NOT EXISTS core_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  value TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_member_tags_member ON member_tags(member_id);
CREATE INDEX IF NOT EXISTS idx_member_tags_tag ON member_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
CREATE INDEX IF NOT EXISTS idx_core_values_member ON core_values(member_id);
