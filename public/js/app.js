/**
 * Roblox: Trash to Riches — Dev Roadmap & Task Tracker
 * Full-stack Client Logic with WebSocket Live Sync & Synth Audio
 */

// Application State
const state = {
  phases: [],
  tasks: [],
  activityLogs: [],
  activeFilterPhase: 'all',
  activeFilterStatus: 'all',
  activeFilterAssignee: 'all',
  searchQuery: '',
  currentUser: localStorage.getItem('trash_to_riches_user') || 'Satang',
  userColor: localStorage.getItem('trash_to_riches_color') || '#7C3AED',
  soundEnabled: localStorage.getItem('trash_to_riches_sound') !== 'false',
  activeUsersCount: 1,
  selectedTask: null,
  wsConnected: false
};

// Web Audio API Synth Sound Generator
class SoundManager {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playCheckSound() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      // Audio context might be restricted before interaction
    }
  }

  playUncheckSound() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}
  }

  playNotifySound() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(880, now + 0.08); // A5

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }
}

const sounds = new SoundManager();

// DOM Elements Cache
const DOM = {
  connectionStatus: document.getElementById('connectionStatus'),
  openUserModalBtn: document.getElementById('openUserModalBtn'),
  userSelectModal: document.getElementById('userSelectModal'),
  userCardBtns: document.querySelectorAll('#userSelectModal .user-card-btn'),
  userAvatar: document.getElementById('userAvatar'),
  userNameDisplay: document.getElementById('userNameDisplay'),
  soundToggleBtn: document.getElementById('soundToggleBtn'),
  soundIconOn: document.getElementById('soundIconOn'),
  soundIconOff: document.getElementById('soundIconOff'),
  activityToggleBtn: document.getElementById('activityToggleBtn'),
  
  // Overview Stats
  doneCount: document.getElementById('doneCount'),
  totalCount: document.getElementById('totalCount'),
  percentBadge: document.getElementById('percentBadge'),
  overallProgressBar: document.getElementById('overallProgressBar'),
  activePeersCount: document.getElementById('activePeersCount'),
  inProgressCount: document.getElementById('inProgressCount'),
  testingCount: document.getElementById('testingCount'),
  completedStatCount: document.getElementById('completedStatCount'),

  // Filters & Toolbar
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  statusFilter: document.getElementById('statusFilter'),
  assigneeFilter: document.getElementById('assigneeFilter'),
  openAddTaskBtn: document.getElementById('openAddTaskBtn'),
  resetDataBtn: document.getElementById('resetDataBtn'),

  // Navigation & Content
  phaseNavList: document.getElementById('phaseNavList'),
  phasesContainer: document.getElementById('phasesContainer'),
  loadingState: document.getElementById('loadingState'),

  // Drawers & Modals
  activityDrawerOverlay: document.getElementById('activityDrawerOverlay'),
  closeActivityBtn: document.getElementById('closeActivityBtn'),
  activityList: document.getElementById('activityList'),

  addTaskModal: document.getElementById('addTaskModal'),
  addTaskForm: document.getElementById('addTaskForm'),
  closeAddTaskBtn: document.getElementById('closeAddTaskBtn'),
  cancelAddTaskBtn: document.getElementById('cancelAddTaskBtn'),
  taskPhaseSelect: document.getElementById('taskPhaseSelect'),

  taskDetailModal: document.getElementById('taskDetailModal'),
  closeDetailModalBtn: document.getElementById('closeDetailModalBtn'),
  cancelDetailBtn: document.getElementById('cancelDetailBtn'),
  saveDetailBtn: document.getElementById('saveDetailBtn'),
  deleteTaskBtn: document.getElementById('deleteTaskBtn'),
  detailPhaseTag: document.getElementById('detailPhaseTag'),
  detailTitleInput: document.getElementById('detailTitleInput'),
  detailDescInput: document.getElementById('detailDescInput'),
  detailCategoryInput: document.getElementById('detailCategoryInput'),
  detailStatusSelect: document.getElementById('detailStatusSelect'),
  detailAssigneeInput: document.getElementById('detailAssigneeInput'),
  detailPrioritySelect: document.getElementById('detailPrioritySelect'),
  detailNotesInput: document.getElementById('detailNotesInput'),

  confirmModal: document.getElementById('confirmModal'),
  confirmModalTitle: document.getElementById('confirmModalTitle'),
  confirmModalMessage: document.getElementById('confirmModalMessage'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmOkBtn: document.getElementById('confirmOkBtn')
};

// Setup Toast Notification
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span class="pulse-dot" style="${type === 'success' ? 'background:#10B981;' : ''}"></span>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// REST Fetch & Polling Fallback for Vercel Serverless
let pollTimer = null;

async function fetchTasks() {
  try {
    const res = await fetch('/api/tasks');
    if (res.ok) {
      const data = await res.json();
      state.phases = data.phases || state.phases || [];
      state.tasks = data.tasks || [];
      state.activityLogs = data.activityLogs || [];
      renderAll();
    }
  } catch (err) {
    console.error('Fetch tasks error:', err);
  }
}

// WebSocket Connection Setup with Smart Vercel Fallback
let ws = null;
let isVercel = window.location.hostname.includes('vercel.app');

function connectWebSocket() {
  // Fetch initial data via REST HTTP
  fetchTasks();

  if (isVercel) {
    // Vercel Serverless Mode: Use HTTP + Supabase 1.5s Polling (No WS connection errors!)
    updateConnectionUI(true, 'Supabase Sync Active');
    if (!pollTimer) {
      pollTimer = setInterval(fetchTasks, 1500);
    }
    return;
  }

  // Local / Custom Server Mode
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      state.wsConnected = true;
      updateConnectionUI(true, 'Live Sync Connected');
      sendUserIdentity();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
      } catch (e) {}
    };

    ws.onclose = () => {
      state.wsConnected = false;
      updateConnectionUI(true, 'Supabase Sync Active');
      if (!pollTimer) {
        pollTimer = setInterval(fetchTasks, 1500);
      }
    };

    ws.onerror = () => {
      state.wsConnected = false;
      updateConnectionUI(true, 'Supabase Sync Active');
      if (!pollTimer) {
        pollTimer = setInterval(fetchTasks, 1500);
      }
    };
  } catch (e) {
    updateConnectionUI(true, 'Supabase Sync Active');
    if (!pollTimer) {
      pollTimer = setInterval(fetchTasks, 1500);
    }
  }
}

function updateConnectionUI(connected, customText = null) {
  if (!DOM.connectionStatus) return;
  if (connected) {
    DOM.connectionStatus.classList.add('connected');
    const lbl = DOM.connectionStatus.querySelector('.status-label');
    if (lbl) lbl.textContent = customText || 'Live Sync Connected';
  } else {
    DOM.connectionStatus.classList.remove('connected');
    const lbl = DOM.connectionStatus.querySelector('.status-label');
    if (lbl) lbl.textContent = customText || 'Connecting...';
  }
}

function sendUserIdentity() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'SET_IDENTITY',
      payload: {
        username: state.currentUser,
        color: state.userColor
      }
    }));
  }
}

function handleWebSocketMessage(msg) {
  switch (msg.type) {
    case 'INIT':
      state.phases = msg.payload.data.phases || [];
      state.tasks = msg.payload.data.tasks || [];
      state.activityLogs = msg.payload.data.activityLogs || [];
      state.activeUsersCount = (msg.payload.activeUsers || []).length;
      renderAll();
      break;

    case 'ACTIVE_USERS':
      state.activeUsersCount = (msg.payload || []).length;
      DOM.activePeersCount.textContent = `${state.activeUsersCount} Dev${state.activeUsersCount > 1 ? 's' : ''} Online`;
      break;

    case 'TASK_UPDATED': {
      const updatedTask = msg.payload.task;
      const log = msg.payload.log;

      const idx = state.tasks.findIndex((t) => t.id === updatedTask.id);
      if (idx !== -1) {
        const prev = state.tasks[idx];
        state.tasks[idx] = updatedTask;

        // Sound and toast notification if someone else did it
        if (log && log.user !== state.currentUser) {
          showToast(`${log.user} ${log.action}`, updatedTask.status === 'done' ? 'success' : 'info');
          sounds.playNotifySound();
        }

        if (log) {
          state.activityLogs.unshift(log);
          if (state.activityLogs.length > 50) state.activityLogs.pop();
          renderActivityList();
        }

        renderOverview();
        renderPhaseNav();
        updateTaskItemElement(updatedTask);
      }
      break;
    }

    case 'TASK_ADDED': {
      const newTask = msg.payload.task;
      const log = msg.payload.log;
      state.tasks.push(newTask);
      if (log) {
        state.activityLogs.unshift(log);
        if (log.user !== state.currentUser) {
          showToast(`${log.user} added a task: ${newTask.title}`);
        }
        renderActivityList();
      }
      renderAll();
      break;
    }

    case 'TASK_DELETED': {
      const taskId = msg.payload.taskId;
      state.tasks = state.tasks.filter((t) => t.id !== taskId);
      if (msg.payload.log) {
        state.activityLogs.unshift(msg.payload.log);
        renderActivityList();
      }
      renderAll();
      break;
    }

    case 'DATA_RESET':
      state.phases = msg.payload.phases || [];
      state.tasks = msg.payload.tasks || [];
      state.activityLogs = msg.payload.activityLogs || [];
      showToast('Roadmap has been reset to initial state');
      renderAll();
      break;
  }
}

// User Identity Controls
function setupUserControls() {
  updateUserBadge();

  // If no user selected yet, prompt modal on first enter
  if (!localStorage.getItem('trash_to_riches_user')) {
    DOM.userSelectModal.classList.remove('hidden');
  }

  if (DOM.openUserModalBtn) {
    DOM.openUserModalBtn.addEventListener('click', () => {
      DOM.userSelectModal.classList.remove('hidden');
    });
  }

  DOM.userCardBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const color = btn.dataset.color;
      setUser(name, color);
      DOM.userSelectModal.classList.add('hidden');
    });
  });
}

function setUser(name, color) {
  state.currentUser = name;
  state.userColor = color;
  localStorage.setItem('trash_to_riches_user', name);
  localStorage.setItem('trash_to_riches_color', color);
  updateUserBadge();
  sendUserIdentity();
  showToast(`ผู้ใช้งานเปลี่ยนเป็น: ${name}`);
}

function updateUserBadge() {
  DOM.userNameDisplay.textContent = state.currentUser;
  DOM.userAvatar.textContent = state.currentUser.charAt(0).toUpperCase();
  DOM.userAvatar.style.backgroundColor = state.userColor;
}

// Sound Controls
function setupSoundControls() {
  updateSoundUI();
  DOM.soundToggleBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('trash_to_riches_sound', state.soundEnabled);
    updateSoundUI();
    if (state.soundEnabled) sounds.playCheckSound();
  });
}

function updateSoundUI() {
  if (state.soundEnabled) {
    DOM.soundIconOn.classList.remove('hidden');
    DOM.soundIconOff.classList.add('hidden');
  } else {
    DOM.soundIconOn.classList.add('hidden');
    DOM.soundIconOff.classList.remove('hidden');
  }
}

// Activity Drawer Controls
function setupActivityControls() {
  DOM.activityToggleBtn.addEventListener('click', () => {
    DOM.activityDrawerOverlay.classList.remove('hidden');
    renderActivityList();
  });

  DOM.closeActivityBtn.addEventListener('click', () => {
    DOM.activityDrawerOverlay.classList.add('hidden');
  });

  DOM.activityDrawerOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.activityDrawerOverlay) {
      DOM.activityDrawerOverlay.classList.add('hidden');
    }
  });
}

function renderActivityList() {
  if (!state.activityLogs || state.activityLogs.length === 0) {
    DOM.activityList.innerHTML = `<div class="loading-state">ยังไม่มีบันทึกกิจกรรม</div>`;
    return;
  }

  DOM.activityList.innerHTML = state.activityLogs.map((log) => {
    const timeAgo = formatTimeAgo(new Date(log.timestamp));
    return `
      <div class="activity-item">
        <div class="activity-user">${escapeHtml(log.user)}</div>
        <div class="activity-action">${escapeHtml(log.action)}</div>
        <div class="activity-time">${timeAgo}</div>
      </div>
    `;
  }).join('');
}

// Filter and Search Controls
function setupFilterControls() {
  DOM.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    DOM.clearSearchBtn.classList.toggle('hidden', !state.searchQuery);
    renderPhasesAndTasks();
  });

  DOM.clearSearchBtn.addEventListener('click', () => {
    DOM.searchInput.value = '';
    state.searchQuery = '';
    DOM.clearSearchBtn.classList.add('hidden');
    renderPhasesAndTasks();
  });

  DOM.statusFilter.addEventListener('change', (e) => {
    state.activeFilterStatus = e.target.value;
    renderPhasesAndTasks();
  });

  DOM.assigneeFilter.addEventListener('change', (e) => {
    state.activeFilterAssignee = e.target.value;
    renderPhasesAndTasks();
  });

  DOM.resetDataBtn.addEventListener('click', () => {
    showConfirm(
      'รีเซ็ต Roadmap ทั้งหมด?',
      'คุณต้องการรีเซ็ตสถานะ Task ทั้งหมดกลับไปเป็นค่าเริ่มต้นจาก Game Design Document หรือไม่?',
      () => {
        fetch('/api/tasks/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: state.currentUser })
        });
      }
    );
  });
}

// Add Task Modal Controls
function setupAddTaskModal() {
  DOM.openAddTaskBtn.addEventListener('click', () => {
    populatePhaseSelect();
    DOM.addTaskForm.reset();
    DOM.addTaskModal.classList.remove('hidden');
  });

  DOM.closeAddTaskBtn.addEventListener('click', () => {
    DOM.addTaskModal.classList.add('hidden');
  });

  DOM.cancelAddTaskBtn.addEventListener('click', () => {
    DOM.addTaskModal.classList.add('hidden');
  });

  DOM.addTaskModal.addEventListener('click', (e) => {
    if (e.target === DOM.addTaskModal) {
      DOM.addTaskModal.classList.add('hidden');
    }
  });

  DOM.addTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phaseId = DOM.taskPhaseSelect.value;
    const title = document.getElementById('taskTitleInput').value.trim();
    const description = document.getElementById('taskDescInput').value.trim();
    const category = document.getElementById('taskCategoryInput').value.trim();
    const priority = document.getElementById('taskPrioritySelect').value;
    const assignee = document.getElementById('taskAssigneeInput').value.trim() || state.currentUser;

    if (!title || !phaseId) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId,
          title,
          description,
          category,
          priority,
          assignee
        })
      });

      if (res.ok) {
        DOM.addTaskModal.classList.add('hidden');
        showToast(`เพิ่ม Task ใหม่เรียบร้อยแล้ว!`, 'success');
        sounds.playCheckSound();
      }
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  });
}

function populatePhaseSelect() {
  DOM.taskPhaseSelect.innerHTML = state.phases.map((p) => {
    const selected = (state.activeFilterPhase === p.id) ? 'selected' : '';
    return `<option value="${p.id}" ${selected}>Phase ${p.number}: ${escapeHtml(p.name)}</option>`;
  }).join('');
}

// Task Detail & Edit Modal
function setupDetailModal() {
  DOM.closeDetailModalBtn.addEventListener('click', () => {
    DOM.taskDetailModal.classList.add('hidden');
  });

  DOM.cancelDetailBtn.addEventListener('click', () => {
    DOM.taskDetailModal.classList.add('hidden');
  });

  DOM.taskDetailModal.addEventListener('click', (e) => {
    if (e.target === DOM.taskDetailModal) {
      DOM.taskDetailModal.classList.add('hidden');
    }
  });

  DOM.saveDetailBtn.addEventListener('click', async () => {
    if (!state.selectedTask) return;
    const newTitle = DOM.detailTitleInput.value.trim();
    if (!newTitle) {
      showToast('กรุณากรอกชื่องาน', 'warning');
      return;
    }

    const updates = {
      title: newTitle,
      description: DOM.detailDescInput.value.trim(),
      category: DOM.detailCategoryInput.value.trim(),
      status: DOM.detailStatusSelect.value,
      assignee: DOM.detailAssigneeInput.value.trim(),
      priority: DOM.detailPrioritySelect.value,
      notes: DOM.detailNotesInput.value.trim(),
      updatedBy: state.currentUser
    };

    if (updates.status === 'done' && !updates.assignee) {
      updates.assignee = state.currentUser;
    } else if (updates.status === 'todo' && !DOM.detailAssigneeInput.value.trim()) {
      updates.assignee = '';
    }

    await patchTask(state.selectedTask.id, updates);
    DOM.taskDetailModal.classList.add('hidden');
    showToast('บันทึกการแก้ไขเรียบร้อยแล้ว!', 'success');
  });

  DOM.deleteTaskBtn.addEventListener('click', () => {
    if (!state.selectedTask) return;
    showConfirm(
      'ลบ Task นี้?',
      `คุณแน่ใจว่าต้องการลบ Task "${state.selectedTask.title}" หรือไม่?`,
      async () => {
        await fetch(`/api/tasks/${state.selectedTask.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: state.currentUser })
        });
        DOM.taskDetailModal.classList.add('hidden');
      }
    );
  });
}

function openDetailModal(task, focusField = 'title') {
  state.selectedTask = task;
  const phase = state.phases.find((p) => p.id === task.phaseId);

  if (DOM.detailPhaseTag) {
    DOM.detailPhaseTag.textContent = phase ? `Phase ${phase.number}: ${phase.name}` : task.phaseId;
  }
  DOM.detailTitleInput.value = task.title || '';
  DOM.detailDescInput.value = task.description || '';
  DOM.detailCategoryInput.value = task.category || '';

  DOM.detailStatusSelect.innerHTML = `
    <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>ยังไม่เริ่ม</option>
    <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>กำลังทำ</option>
    <option value="testing" ${task.status === 'testing' ? 'selected' : ''}>กำลังทดสอบ</option>
    <option value="done" ${task.status === 'done' ? 'selected' : ''}>เสร็จแล้ว</option>
  `;

  DOM.detailAssigneeInput.value = task.assignee || '';
  DOM.detailPrioritySelect.value = task.priority || 'medium';
  DOM.detailNotesInput.value = task.notes || '';
  DOM.deleteTaskBtn.classList.remove('hidden');

  DOM.taskDetailModal.classList.remove('hidden');

  setTimeout(() => {
    if (focusField === 'title') {
      DOM.detailTitleInput.focus();
      DOM.detailTitleInput.select();
    } else if (focusField === 'notes') {
      DOM.detailNotesInput.focus();
    }
  }, 50);
}

// Confirmation Dialog
let onConfirmCallback = null;

function showConfirm(title, message, callback) {
  DOM.confirmModalTitle.textContent = title;
  DOM.confirmModalMessage.textContent = message;
  onConfirmCallback = callback;
  DOM.confirmModal.classList.remove('hidden');
}

DOM.confirmCancelBtn.addEventListener('click', () => {
  DOM.confirmModal.classList.add('hidden');
  onConfirmCallback = null;
});

DOM.confirmOkBtn.addEventListener('click', () => {
  if (onConfirmCallback) {
    onConfirmCallback();
  }
  DOM.confirmModal.classList.add('hidden');
  onConfirmCallback = null;
});

// API Patch Helper
async function patchTask(taskId, updates) {
  try {
    updates.updatedBy = state.currentUser;
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update task');
    setTimeout(fetchTasks, 150);
  } catch (err) {
    console.error('Error updating task:', err);
    showToast('ไม่สามารถอัปเดตงานได้ กรุณาลองใหม่', 'danger');
  }
}

// Render Functions
function renderAll() {
  DOM.loadingState.classList.add('hidden');
  renderOverview();
  renderPhaseNav();
  renderPhasesAndTasks();
  renderActivityList();
}

function renderOverview() {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === 'done').length;
  const inProgress = state.tasks.filter((t) => t.status === 'in_progress').length;
  const testing = state.tasks.filter((t) => t.status === 'testing').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  DOM.doneCount.textContent = done;
  DOM.totalCount.textContent = total;
  DOM.percentBadge.textContent = `${percent}%`;
  DOM.overallProgressBar.style.width = `${percent}%`;

  DOM.inProgressCount.textContent = inProgress;
  DOM.testingCount.textContent = testing;
  DOM.completedStatCount.textContent = done;
  DOM.activePeersCount.textContent = `${state.activeUsersCount} Dev${state.activeUsersCount > 1 ? 's' : ''} Online`;
}

function renderPhaseNav() {
  const allTasksCount = state.tasks.length;
  const allDoneCount = state.tasks.filter((t) => t.status === 'done').length;
  const allPercent = allTasksCount ? Math.round((allDoneCount / allTasksCount) * 100) : 0;

  let html = `
    <button class="phase-tab ${state.activeFilterPhase === 'all' ? 'active' : ''}" data-phase="all">
      <span>ทุก Phase</span>
      <span class="tab-badge">${allDoneCount}/${allTasksCount}</span>
      <span class="tab-percent">${allPercent}%</span>
    </button>
  `;

  state.phases.forEach((phase) => {
    const phaseTasks = state.tasks.filter((t) => t.phaseId === phase.id);
    const pDone = phaseTasks.filter((t) => t.status === 'done').length;
    const pTotal = phaseTasks.length;
    const pPercent = pTotal ? Math.round((pDone / pTotal) * 100) : 0;
    const isActive = state.activeFilterPhase === phase.id ? 'active' : '';

    html += `
      <button class="phase-tab ${isActive}" data-phase="${phase.id}">
        <span>Phase ${phase.number}</span>
        <span class="tab-badge">${pDone}/${pTotal}</span>
        <span class="tab-percent">${pPercent}%</span>
      </button>
    `;
  });

  DOM.phaseNavList.innerHTML = html;

  // Add click listeners to tabs
  DOM.phaseNavList.querySelectorAll('.phase-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeFilterPhase = tab.dataset.phase;
      renderPhaseNav();
      renderPhasesAndTasks();

      // Scroll smoothly to phase card if specific
      if (state.activeFilterPhase !== 'all') {
        const el = document.getElementById(`section-${state.activeFilterPhase}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function renderPhasesAndTasks() {
  const query = state.searchQuery;
  const statusF = state.activeFilterStatus;
  const assigneeF = state.activeFilterAssignee;
  const phaseF = state.activeFilterPhase;

  // Filter Phases
  const displayPhases = state.phases.filter((p) => {
    if (phaseF !== 'all' && p.id !== phaseF) return false;
    return true;
  });

  if (displayPhases.length === 0) {
    DOM.phasesContainer.innerHTML = `
      <div class="loading-state">
        <p>ไม่พบ Phase หรือข้อมูลงานตามเงื่อนไขที่เลือก</p>
      </div>
    `;
    return;
  }

  let fullHtml = '';

  displayPhases.forEach((phase) => {
    let tasksInPhase = state.tasks.filter((t) => t.phaseId === phase.id);
    const totalInPhase = tasksInPhase.length;
    const doneInPhase = tasksInPhase.filter((t) => t.status === 'done').length;
    const phasePercent = totalInPhase ? Math.round((doneInPhase / totalInPhase) * 100) : 0;

    // Apply Filters & Search to tasks in this phase
    const filteredTasks = tasksInPhase.filter((task) => {
      // Search
      if (query) {
        const matchTitle = task.title.toLowerCase().includes(query);
        const matchDesc = (task.description || '').toLowerCase().includes(query);
        const matchCat = (task.category || '').toLowerCase().includes(query);
        const matchNotes = (task.notes || '').toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchCat && !matchNotes) return false;
      }

      // Status Filter
      if (statusF !== 'all' && task.status !== statusF) return false;

      // Assignee Filter
      if (assigneeF !== 'all') {
        if (assigneeF === 'unassigned') {
          if (task.assignee) return false;
        } else if (task.assignee !== assigneeF) {
          return false;
        }
      }

      return true;
    });

    // If search active and no tasks match in this phase, skip this phase
    if (query && filteredTasks.length === 0 && (statusF !== 'all' || assigneeF !== 'all')) {
      return;
    }

    fullHtml += `
      <section class="phase-card" id="section-${phase.id}">
        <div class="phase-card-header">
          <div class="phase-header-info">
            <span class="phase-num-badge" style="border-color:${phase.color}; color:${phase.color};">
              Phase ${phase.number}
            </span>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <h2 class="phase-title-text">${escapeHtml(phase.name)}</h2>
                <span class="phase-tag-badge">${escapeHtml(phase.tag)}</span>
              </div>
              <p class="phase-summary-text">${escapeHtml(phase.summary)}</p>
            </div>
          </div>
          <div class="phase-header-progress">
            <div class="phase-progress-stat">
              <strong>${doneInPhase}</strong> / ${totalInPhase} Tasks (${phasePercent}%)
            </div>
            <div class="phase-mini-bar">
              <div class="phase-mini-fill" style="width: ${phasePercent}%; background-color: ${phase.color};"></div>
            </div>
          </div>
        </div>

        <div class="task-list" id="task-list-${phase.id}">
          ${filteredTasks.length > 0 
            ? filteredTasks.map(renderTaskItemHtml).join('') 
            : `<div style="padding:16px; text-align:center; color:var(--color-text-dim); font-size:0.85rem;">
                ไม่มี Task ที่ตรงกับการกรองใน Phase นี้
               </div>`
          }
        </div>
      </section>
    `;
  });

  DOM.phasesContainer.innerHTML = fullHtml || `
    <div class="loading-state">
      <p>ไม่พบ Task ที่ตรงกับเงื่อนไขการค้นหา</p>
    </div>
  `;

  attachTaskEventListeners();
}

function renderTaskItemHtml(task) {
  const isDone = task.status === 'done';
  const priority = task.priority || 'medium';
  const priorityClass = `priority-${priority}`;
  const isHigh = priority === 'high';
  const assignedName = task.assignee ? escapeHtml(task.assignee) : 'Unassigned';
  const isAssigned = !!task.assignee;

  return `
    <div class="task-item ${isDone ? 'status-done' : ''} ${isHigh ? 'has-high-priority' : ''}" id="task-card-${task.id}" data-id="${task.id}">
      <!-- Custom Cyber Checkbox -->
      <label class="custom-checkbox" title="${isDone ? 'มาร์กว่ายังไม่เสร็จ' : 'มาร์กว่าเสร็จแล้ว'}">
        <input type="checkbox" class="task-checkbox" data-id="${task.id}" ${isDone ? 'checked' : ''}>
        <span class="checkmark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </span>
      </label>

      <!-- Task Details -->
      <div class="task-content">
        <div class="task-header-row">
          <span class="task-title" title="คลิกเพื่อแก้ไขชื่องาน">${escapeHtml(task.title)}</span>
          <button class="edit-title-btn" data-id="${task.id}" title="แก้ไขชื่องาน">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <span class="task-category-tag">${escapeHtml(task.category || 'General')}</span>
          <span class="task-priority-tag ${priorityClass}">${isHigh ? '🔥 HIGH' : priority}</span>
          ${isDone ? `<span class="done-by-badge">✓ ทำเสร็จโดย ${escapeHtml(task.assignee || state.currentUser)}</span>` : ''}
        </div>

        ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}
        
        ${task.notes ? `
          <div class="task-notes-box">
            <strong>Note:</strong> ${escapeHtml(task.notes)}
          </div>
        ` : ''}

        <div class="task-controls">
          <!-- Status Selector -->
          <select class="status-badge-select status-${task.status}" data-id="${task.id}" aria-label="สถานะงาน">
            <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>ยังไม่เริ่ม</option>
            <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>กำลังทำ</option>
            <option value="testing" ${task.status === 'testing' ? 'selected' : ''}>กำลังทดสอบ</option>
            <option value="done" ${task.status === 'done' ? 'selected' : ''}>เสร็จแล้ว</option>
          </select>

          <!-- Assignee Button -->
          <button class="assignee-pill ${isAssigned ? 'assigned' : ''}" data-id="${task.id}" title="คลิกเพื่อสลับผู้ทำ (Satang / Time)">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>${task.assignee ? escapeHtml(task.assignee) : 'ระบุผู้ทำ'}</span>
          </button>

          <!-- Notes / Details Button -->
          <button class="task-btn-action open-detail-btn" data-id="${task.id}" title="เปิดดูรายละเอียด / เขียนโน้ต">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>${task.notes ? 'Edit Note' : 'Add Note'}</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function updateTaskItemElement(task) {
  const card = document.getElementById(`task-card-${task.id}`);
  if (!card) return;

  const isDone = task.status === 'done';
  card.classList.toggle('status-done', isDone);

  const chk = card.querySelector('.task-checkbox');
  if (chk) chk.checked = isDone;

  const statusSel = card.querySelector('.status-badge-select');
  if (statusSel) {
    statusSel.value = task.status;
    statusSel.className = `status-badge-select status-${task.status}`;
  }

  // Update Done By Badge
  let doneBadge = card.querySelector('.done-by-badge');
  if (isDone) {
    const doneUser = task.assignee || state.currentUser;
    if (!doneBadge) {
      doneBadge = document.createElement('span');
      doneBadge.className = 'done-by-badge';
      const headerRow = card.querySelector('.task-header-row');
      if (headerRow) headerRow.appendChild(doneBadge);
    }
    doneBadge.textContent = `✓ ทำเสร็จโดย ${doneUser}`;
    doneBadge.classList.remove('hidden');
  } else if (doneBadge) {
    doneBadge.classList.add('hidden');
  }

  const assigneePill = card.querySelector('.assignee-pill');
  if (assigneePill) {
    const isAssigned = !!task.assignee;
    assigneePill.classList.toggle('assigned', isAssigned);
    assigneePill.querySelector('span').textContent = task.assignee ? task.assignee : 'ระบุผู้ทำ';
  }

  // Update phase header progress stat
  const phase = state.phases.find((p) => p.id === task.phaseId);
  if (phase) {
    const phaseTasks = state.tasks.filter((t) => t.phaseId === phase.id);
    const pDone = phaseTasks.filter((t) => t.status === 'done').length;
    const pTotal = phaseTasks.length;
    const pPercent = pTotal ? Math.round((pDone / pTotal) * 100) : 0;

    const phaseSection = document.getElementById(`section-${phase.id}`);
    if (phaseSection) {
      const stat = phaseSection.querySelector('.phase-progress-stat');
      if (stat) stat.innerHTML = `<strong>${pDone}</strong> / ${pTotal} Tasks (${pPercent}%)`;
      const fill = phaseSection.querySelector('.phase-mini-fill');
      if (fill) fill.style.width = `${pPercent}%`;
    }
  }
}

function attachTaskEventListeners() {
  // Checkbox Toggle
  document.querySelectorAll('.task-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', async (e) => {
      const taskId = e.target.dataset.id;
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      const newStatus = e.target.checked ? 'done' : 'todo';
      task.status = newStatus;

      if (newStatus === 'done') {
        task.assignee = state.currentUser;
      } else {
        task.assignee = ''; // Reset to unassigned
      }

      updateTaskItemElement(task);
      renderOverview();
      renderPhaseNav();

      if (newStatus === 'done') {
        sounds.playCheckSound();
      } else {
        sounds.playUncheckSound();
      }

      await patchTask(taskId, {
        status: newStatus,
        assignee: task.assignee
      });
    });
  });

  // Status Select dropdown
  document.querySelectorAll('.status-badge-select').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const taskId = e.target.dataset.id;
      const newStatus = e.target.value;
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      task.status = newStatus;
      if (newStatus === 'done') {
        task.assignee = state.currentUser;
      } else if (newStatus === 'todo') {
        task.assignee = ''; // Reset to unassigned
      }

      updateTaskItemElement(task);
      renderOverview();
      renderPhaseNav();

      if (newStatus === 'done') sounds.playCheckSound();
      else sounds.playUncheckSound();

      await patchTask(taskId, {
        status: newStatus,
        assignee: task.assignee
      });
    });
  });

  // Assignee click
  document.querySelectorAll('.assignee-pill').forEach((pill) => {
    pill.addEventListener('click', async (e) => {
      const taskId = pill.dataset.id;
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      let newAssignee = state.currentUser;
      if (!task.assignee) {
        newAssignee = state.currentUser;
      } else if (task.assignee === state.currentUser) {
        newAssignee = state.currentUser === 'Satang' ? 'Time' : 'Satang';
      } else {
        newAssignee = ''; // Toggle back to unassigned
      }

      task.assignee = newAssignee;
      updateTaskItemElement(task);

      await patchTask(taskId, { assignee: newAssignee });
      showToast(newAssignee ? `มอบหมายให้: ${newAssignee}` : 'ยกเลิกผู้รับผิดชอบแล้ว');
    });
  });

  // Open Detail / Edit modal
  document.querySelectorAll('.open-detail-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.id;
      const task = state.tasks.find((t) => t.id === taskId);
      if (task) openDetailModal(task, 'notes');
    });
  });

  document.querySelectorAll('.edit-title-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.id;
      const task = state.tasks.find((t) => t.id === taskId);
      if (task) openDetailModal(task, 'title');
    });
  });

  document.querySelectorAll('.task-content').forEach((content) => {
    content.addEventListener('click', (e) => {
      if (e.target.closest('select') || e.target.closest('button') || e.target.closest('input') || e.target.closest('label')) {
        return;
      }
      const taskId = content.closest('.task-item').dataset.id;
      const task = state.tasks.find((t) => t.id === taskId);
      if (task) openDetailModal(task, 'title');
    });
  });
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'เมื่อสักครู่';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

// Initial Boot
window.addEventListener('DOMContentLoaded', () => {
  setupUserControls();
  setupSoundControls();
  setupActivityControls();
  setupFilterControls();
  setupAddTaskModal();
  setupDetailModal();
  connectWebSocket();
});
