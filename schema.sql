-- Supabase Database Schema for Roblox Trash to Riches Dev Tracker

-- 1. Create Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',
  status TEXT DEFAULT 'todo',
  assignee TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  notes TEXT DEFAULT '',
  completed_at TIMESTAMPTZ,
  updated_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  task_title TEXT,
  phase_id TEXT,
  "user" TEXT,
  action TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Realtime on Tasks and Activity Logs
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

-- 4. Enable Row Level Security (RLS) and Allow Public Access for Demo
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read tasks" ON tasks FOR SELECT USING (true);
CREATE POLICY "Allow public insert tasks" ON tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update tasks" ON tasks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete tasks" ON tasks FOR DELETE USING (true);

CREATE POLICY "Allow public read logs" ON activity_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert logs" ON activity_logs FOR INSERT WITH CHECK (true);
