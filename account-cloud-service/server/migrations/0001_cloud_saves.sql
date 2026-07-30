CREATE TABLE IF NOT EXISTS emberveil_cloud_save (
  user_id TEXT NOT NULL,
  slot_id TEXT NOT NULL CHECK (slot_id IN ('autosave', 'manual-1', 'manual-2', 'manual-3')),
  cloud_version INTEGER NOT NULL CHECK (cloud_version > 0),
  save_id TEXT NOT NULL,
  save_revision INTEGER NOT NULL CHECK (save_revision >= 0),
  save_saved_at TEXT NOT NULL,
  game_version TEXT NOT NULL,
  map_id TEXT NOT NULL,
  region_id TEXT NOT NULL,
  play_time_ms INTEGER NOT NULL CHECK (play_time_ms >= 0),
  checksum TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  last_decision TEXT NOT NULL CHECK (last_decision IN ('sync', 'keep-local')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot_id),
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emberveil_cloud_save_backup (
  user_id TEXT NOT NULL,
  slot_id TEXT NOT NULL CHECK (slot_id IN ('autosave', 'manual-1', 'manual-2', 'manual-3')),
  cloud_version INTEGER NOT NULL,
  save_id TEXT NOT NULL,
  save_revision INTEGER NOT NULL,
  save_saved_at TEXT NOT NULL,
  game_version TEXT NOT NULL,
  map_id TEXT NOT NULL,
  region_id TEXT NOT NULL,
  play_time_ms INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  last_decision TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  backed_up_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot_id),
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emberveil_cloud_save_request (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  result_cloud_version INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS emberveil_cloud_save_updated_idx
  ON emberveil_cloud_save (user_id, updated_at DESC);
