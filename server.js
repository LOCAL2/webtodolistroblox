const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

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

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getInitialData() {
  if (fs.existsSync(INITIAL_FILE)) {
    const raw = fs.readFileSync(INITIAL_FILE, 'utf-8');
    return JSON.parse(raw);
  }
  return { phases: [], tasks: [], activityLogs: [] };
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const init = getInitialData();
      if (!init.activityLogs) init.activityLogs = [];
      saveData(init);
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

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving tasks.json:', err);
  }
}

// Keep a list of active users/peers
const activeClients = new Map(); // ws -> { id, username, color }

function broadcast(type, payload, senderWs = null) {
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
  const currentData = loadData();
  ws.send(JSON.stringify({
    type: 'INIT',
    payload: {
      data: currentData,
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
  const data = loadData();
  res.json(data);
});

app.patch('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const updates = req.body; // status, assignee, notes, priority, etc.
  const data = loadData();

  const taskIndex = data.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const previousTask = { ...data.tasks[taskIndex] };
  const updatedTask = { ...previousTask, ...updates };

  // Update completed timestamp
  if (updates.status === 'done' && previousTask.status !== 'done') {
    updatedTask.completedAt = new Date().toISOString();
  } else if (updates.status && updates.status !== 'done') {
    updatedTask.completedAt = null;
  }

  data.tasks[taskIndex] = updatedTask;

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

  if (!data.activityLogs) data.activityLogs = [];
  data.activityLogs.unshift(logEntry);
  if (data.activityLogs.length > 50) data.activityLogs.pop(); // Keep last 50 logs

  saveData(data);

  // Broadcast to all WebSocket clients
  broadcast('TASK_UPDATED', { task: updatedTask, log: logEntry });

  res.json({ task: updatedTask, log: logEntry });
});

app.post('/api/tasks', (req, res) => {
  const { phaseId, title, description, category, priority, assignee, notes } = req.body;

  if (!phaseId || !title) {
    return res.status(400).json({ error: 'phaseId and title are required' });
  }

  const data = loadData();
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

  data.tasks.push(newTask);

  const logEntry = {
    id: 'log_' + Date.now(),
    taskId: newTask.id,
    taskTitle: newTask.title,
    phaseId: newTask.phaseId,
    user: assignee || 'Someone',
    action: `added new task "${newTask.title}"`,
    timestamp: new Date().toISOString()
  };

  if (!data.activityLogs) data.activityLogs = [];
  data.activityLogs.unshift(logEntry);
  saveData(data);

  broadcast('TASK_ADDED', { task: newTask, log: logEntry });

  res.status(201).json(newTask);
});

app.delete('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const data = loadData();

  const taskIndex = data.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const deletedTask = data.tasks.splice(taskIndex, 1)[0];

  const logEntry = {
    id: 'log_' + Date.now(),
    taskId: taskId,
    taskTitle: deletedTask.title,
    phaseId: deletedTask.phaseId,
    user: req.body.user || 'Someone',
    action: `deleted task "${deletedTask.title}"`,
    timestamp: new Date().toISOString()
  };

  if (!data.activityLogs) data.activityLogs = [];
  data.activityLogs.unshift(logEntry);
  saveData(data);

  broadcast('TASK_DELETED', { taskId, log: logEntry });

  res.json({ success: true, taskId });
});

app.post('/api/tasks/reset', (req, res) => {
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
  saveData(initial);

  broadcast('DATA_RESET', initial);
  res.json({ success: true, data: initial });
});

app.get('/api/stats', (req, res) => {
  const data = loadData();
  const total = data.tasks.length;
  const done = data.tasks.filter((t) => t.status === 'done').length;
  const inProgress = data.tasks.filter((t) => t.status === 'in_progress').length;
  const testing = data.tasks.filter((t) => t.status === 'testing').length;
  const todo = data.tasks.filter((t) => t.status === 'todo').length;

  const phaseStats = data.phases.map((p) => {
    const pTasks = data.tasks.filter((t) => t.phaseId === p.id);
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

// Start Server
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Roblox Trash to Riches Dev Tracker is running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`⚡ WebSocket live sync enabled on port ${PORT}`);
  console.log(`====================================================`);
});
