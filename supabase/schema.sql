-- ВнГ: схема Supabase для real-time игровых сессий
-- Выполните в SQL Editor вашего проекта Supabase

-- Комнаты (игровые сессии)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  gm_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rooms_code ON rooms (code);

-- Игроки в комнатах
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_gm BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_players_room ON players (room_id);

-- Листы персонажей
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  name TEXT DEFAULT '',
  class_status TEXT DEFAULT '',
  description TEXT DEFAULT '',
  stats JSONB DEFAULT '[]'::jsonb,
  counters JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (room_id, player_id)
);

CREATE INDEX idx_characters_room ON characters (room_id);

-- История бросков кубов
CREATE TABLE IF NOT EXISTS roll_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  expression TEXT NOT NULL,
  total INTEGER NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_roll_events_room ON roll_events (room_id, created_at DESC);

-- Энкаунтеры
CREATE TABLE IF NOT EXISTS encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image_url TEXT,
  enemy_hp INTEGER,
  enemy_hp_max INTEGER,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_encounters_room ON encounters (room_id);

-- Realtime: включите replication для таблиц в Dashboard → Database → Replication

-- RLS (упрощённая политика для MVP — откройте доступ по anon key)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roll_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_all" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "players_all" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "characters_all" ON characters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "roll_events_all" ON roll_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "encounters_all" ON encounters FOR ALL USING (true) WITH CHECK (true);
