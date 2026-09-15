require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');
const INITIAL_FILE = path.join(DATA_DIR, 'initial-tasks.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Supabase Client Setup
let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project-id')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase Client initialized with credentials from .env');
  } catch (err) {
    console.error('⚠️ Failed to initialize Supabase:', err.message);
  }
} else {
  console.log('ℹ️ Running in Local File Mode (Set SUPABASE_URL & SUPABASE_KEY in .env to enable Supabase DB)');
}

function getInitialData() {
  if (fs.existsSync(INITIAL_FILE)) {
    const raw = fs.readFileSync(INITIAL_FILE, 'utf-8');
    return JSON.parse(raw);
  }
  return { phases: [], tasks: [], activityLogs: [] };
}

function loadLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const init = getInitialData();
      if (!init.activityLogs) init.activityLogs = [];
      saveLocalData(init);
      return init;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.activityLogs) data.activityLogs = [];
    return data;
  } catch (err) {
    console.error('Error reading tasks.json, falling back to initial data:', err);
    return getInitialData();
  }
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving tasks.json:', err);
  }
}

// Cache state in memory for fast updates
let inMemoryData = loadLocalData();
const taskLastModified = new Map();

// Sync with Supabase if connected
async function syncFromSupabase() {
  if (!supabase) return;
  try {
    const { data: dbTasks, error: taskErr } = await supabase.from('tasks').select('*');
    const { data: dbLogs, error: logErr } = await supabase.from('activity_logs').select('*').order('timestamp', { ascending: false }).limit(50);

    if (!taskErr && dbTasks && dbTasks.length > 0) {
      const now = Date.now();
      const mappedDbTasks = dbTasks.map(t => ({
        id: t.id,
        phaseId: t.phase_id,
        title: t.title,
        description: t.description || '',
        category: t.category || '',
        status: t.status || 'todo',
        assignee: t.assignee || '',
        priority: t.priority || 'medium',
        notes: t.notes || '',
        completedAt: t.completed_at,
        updatedBy: t.updated_by || ''
      }));

      // Preserve local in-memory version if modified within last 10 seconds
      const mergedTasks = mappedDbTasks.map(dbTask => {
        const lastMod = taskLastModified.get(dbTask.id) || 0;
        if (now - lastMod < 10000) {
          const localTask = inMemoryData.tasks.find(t => t.id === dbTask.id);
          return localTask || dbTask;
        }
        return dbTask;
      });

      // Keep custom tasks created locally
      inMemoryData.tasks.forEach(localTask => {
        if (!mergedTasks.some(m => m.id === localTask.id)) {
          const lastMod = taskLastModified.get(localTask.id) || 0;
          if (now - lastMod < 10000) {
            mergedTasks.push(localTask);
          }
        }
      });

      inMemoryData.tasks = mergedTasks;
    }

    if (!logErr && dbLogs) {
      inMemoryData.activityLogs = dbLogs.map(l => ({
        id: l.id,
        taskId: l.task_id,
        taskTitle: l.task_title,
        phaseId: l.phase_id,
        user: l.user,
        action: l.action,
        timestamp: l.timestamp
      }));
    }
  } catch (err) {
    console.error('Supabase fetch error:', err.message);
  }
}

// Initial sync
if (supabase) {
  syncFromSupabase();
}

// Realtime 1-Second Update Interval
let lastDataHash = '';
setInterval(async () => {
  if (supabase) {
    await syncFromSupabase();
  }
  const currentHash = JSON.stringify(inMemoryData.tasks);
  if (currentHash !== lastDataHash) {
    lastDataHash = currentHash;
    broadcast('INIT', {
      data: inMemoryData,
      activeUsers: Array.from(activeClients.values())
    });
  }
}, 1000);

// Keep active users / peers
const activeClients = new Map(); // ws -> { id, username, color }

function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastOnlineUsers() {
  const users = Array.from(activeClients.values());
  broadcast('ACTIVE_USERS', users);
}

// WebSocket Connection Handling
wss.on('connection', (ws) => {
  const clientId = 'user_' + Math.random().toString(36).substring(2, 8);
  activeClients.set(ws, { id: clientId, username: 'Guest', color: '#A78BFA' });

  // Send initial data to connected client
  ws.send(JSON.stringify({
    type: 'INIT',
    payload: {
      data: inMemoryData,
      clientId: clientId,
      activeUsers: Array.from(activeClients.values())
    }
  }));

  broadcastOnlineUsers();

  ws.on('message', (messageText) => {
    try {
      const msg = JSON.parse(messageText);

      if (msg.type === 'SET_IDENTITY') {
        const user = activeClients.get(ws) || { id: clientId };
        user.username = (msg.payload.username || 'Anonymous').trim();
        user.color = msg.payload.color || '#7C3AED';
        activeClients.set(ws, user);
        broadcastOnlineUsers();
      }

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    activeClients.delete(ws);
    broadcastOnlineUsers();
  });
});

// REST Endpoints
app.get('/api/tasks', (req, res) => {
  res.json(inMemoryData);
});

app.patch('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const updates = req.body;
  taskLastModified.set(taskId, Date.now());
  const taskIndex = inMemoryData.tasks.findIndex((t) => t.id === taskId);

  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const previousTask = { ...inMemoryData.tasks[taskIndex] };
  const updatedTask = { ...previousTask, ...updates };

  if (updates.status === 'done' && previousTask.status !== 'done') {
    updatedTask.completedAt = new Date().toISOString();
  } else if (updates.status && updates.status !== 'done') {
    updatedTask.completedAt = null;
  }

  inMemoryData.tasks[taskIndex] = updatedTask;
  saveLocalData(inMemoryData);

  // Add activity log
  const author = updates.updatedBy || updates.assignee || 'Someone';
  let actionText = '';
  if (updates.status && updates.status !== previousTask.status) {
    actionText = updates.status === 'done' 
      ? `marked "${updatedTask.title}" as Done` 
      : `changed "${updatedTask.title}" status to ${updates.status}`;
  } else if (updates.notes !== undefined && updates.notes !== previousTask.notes) {
    actionText = `updated notes on "${updatedTask.title}"`;
  } else {
    actionText = `updated "${updatedTask.title}"`;
  }

  const logEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    taskId: taskId,
    taskTitle: updatedTask.title,
    phaseId: updatedTask.phaseId,
    user: author,
    action: actionText,
    timestamp: new Date().toISOString()
  };

  inMemoryData.activityLogs.unshift(logEntry);
  if (inMemoryData.activityLogs.length > 50) inMemoryData.activityLogs.pop();

  // Write to Supabase if connected
  if (supabase) {
    try {
      await supabase.from('tasks').upsert({
        id: updatedTask.id,
        phase_id: updatedTask.phaseId,
        title: updatedTask.title,
        description: updatedTask.description,
        category: updatedTask.category,
        status: updatedTask.status,
        assignee: updatedTask.assignee,
        priority: updatedTask.priority,
        notes: updatedTask.notes,
        completed_at: updatedTask.completedAt,
        updated_by: updatedTask.updatedBy,
        updated_at: new Date().toISOString()
      });

      await supabase.from('activity_logs').insert({
        id: logEntry.id,
        task_id: logEntry.taskId,
        task_title: logEntry.taskTitle,
        phase_id: logEntry.phaseId,
        user: logEntry.user,
        action: logEntry.action,
        timestamp: logEntry.timestamp
      });
    } catch (err) {
      console.error('Supabase write error:', err.message);
    }
  }

  broadcast('TASK_UPDATED', { task: updatedTask, log: logEntry });
  res.json({ task: updatedTask, log: logEntry });
});

app.post('/api/tasks', async (req, res) => {
  const { phaseId, title, description, category, priority, assignee, notes } = req.body;

  if (!phaseId || !title) {
    return res.status(400).json({ error: 'phaseId and title are required' });
  }

  const newTask = {
    id: 'custom-' + Date.now(),
    phaseId,
    title: title.trim(),
    description: (description || '').trim(),
    category: (category || 'Custom').trim(),
    status: 'todo',
    assignee: (assignee || '').trim(),
    completedAt: null,
    notes: (notes || '').trim(),
    priority: priority || 'medium'
  };

  inMemoryData.tasks.push(newTask);

  const logEntry = {
    id: 'log_' + Date.now(),
    taskId: newTask.id,
    taskTitle: newTask.title,
    phaseId: newTask.phaseId,
    user: assignee || 'Someone',
    action: `added new task "${newTask.title}"`,
    timestamp: new Date().toISOString()
  };

  inMemoryData.activityLogs.unshift(logEntry);
  saveLocalData(inMemoryData);

  if (supabase) {
    try {
      await supabase.from('tasks').insert({
        id: newTask.id,
        phase_id: newTask.phaseId,
        title: newTask.title,
        description: newTask.description,
        category: newTask.category,
        status: newTask.status,
        assignee: newTask.assignee,
        priority: newTask.priority,
        notes: newTask.notes
      });
    } catch (err) {
      console.error('Supabase insert task error:', err.message);
    }
  }

  broadcast('TASK_ADDED', { task: newTask, log: logEntry });
  res.status(201).json(newTask);
});

app.delete('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const taskIndex = inMemoryData.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const deletedTask = inMemoryData.tasks.splice(taskIndex, 1)[0];

  const logEntry = {
    id: 'log_' + Date.now(),
    taskId: taskId,
    taskTitle: deletedTask.title,
    phaseId: deletedTask.phaseId,
    user: req.body.user || 'Someone',
    action: `deleted task "${deletedTask.title}"`,
    timestamp: new Date().toISOString()
  };

  inMemoryData.activityLogs.unshift(logEntry);
  saveLocalData(inMemoryData);

  if (supabase) {
    try {
      await supabase.from('tasks').delete().eq('id', taskId);
    } catch (err) {
      console.error('Supabase delete task error:', err.message);
    }
  }

  broadcast('TASK_DELETED', { taskId, log: logEntry });
  res.json({ success: true, taskId });
});

app.post('/api/tasks/reset', async (req, res) => {
  const initial = getInitialData();
  initial.activityLogs = [
    {
      id: 'log_' + Date.now(),
      taskId: '',
      taskTitle: 'All Phases',
      phaseId: '',
      user: req.body.user || 'Admin',
      action: 'reset all tasks to initial roadmap state',
      timestamp: new Date().toISOString()
    }
  ];
  inMemoryData = initial;
  saveLocalData(initial);

  if (supabase) {
    try {
      await supabase.from('tasks').delete().neq('id', '');
      const dbRows = initial.tasks.map(t => ({
        id: t.id,
        phase_id: t.phaseId,
        title: t.title,
        description: t.description || '',
        category: t.category || '',
        status: t.status || 'todo',
        assignee: t.assignee || '',
        priority: t.priority || 'medium',
        notes: t.notes || ''
      }));
      await supabase.from('tasks').insert(dbRows);
    } catch (err) {
      console.error('Supabase reset error:', err.message);
    }
  }

  broadcast('DATA_RESET', initial);
  res.json({ success: true, data: initial });
});

app.get('/api/stats', (req, res) => {
  const total = inMemoryData.tasks.length;
  const done = inMemoryData.tasks.filter((t) => t.status === 'done').length;
  const inProgress = inMemoryData.tasks.filter((t) => t.status === 'in_progress').length;
  const testing = inMemoryData.tasks.filter((t) => t.status === 'testing').length;
  const todo = inMemoryData.tasks.filter((t) => t.status === 'todo').length;

  const phaseStats = inMemoryData.phases.map((p) => {
    const pTasks = inMemoryData.tasks.filter((t) => t.phaseId === p.id);
    const pDone = pTasks.filter((t) => t.status === 'done').length;
    return {
      phaseId: p.id,
      number: p.number,
      name: p.name,
      total: pTasks.length,
      done: pDone,
      percent: pTasks.length ? Math.round((pDone / pTasks.length) * 100) : 0
    };
  });

  res.json({
    total,
    done,
    inProgress,
    testing,
    todo,
    percent: total ? Math.round((done / total) * 100) : 0,
    phaseStats
  });
});

// Start Server (Local or Vercel Serverless Function)
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Roblox Trash to Riches Dev Tracker is running!`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`⚡ Supabase DB Integration & 1s Realtime Sync Ready!`);
    console.log(`====================================================`);
  });
}

module.exports = app;
