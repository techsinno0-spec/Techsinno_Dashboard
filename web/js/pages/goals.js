async function render_goals() {
  if (!isManager()) return;
  const el = document.getElementById('page-goals');

  el.innerHTML = `<div style="max-width:680px">
    <p style="color:var(--text3);font-size:12px;margin-bottom:12px">Your private 90-day business goals. Only visible to you.</p>
    <div id="goalsContainer"></div>
    <button class="btn bsm bo" style="margin-top:10px" onclick="showAddGoal()"><i class="ti ti-plus" style="font-size:12px"></i> Add Goal</button>
    <div id="addGoalForm" style="display:none;margin-top:10px"></div>
  </div>`;

  loadGoals();
}

let goalsData = [];

async function loadGoals() {
  const container = document.getElementById('goalsContainer');
  if (!container) return;

  try {
    const data = await apiGet('/config/goals_private');
    goalsData = (data && data.config && data.config.goals) || [];
  } catch {
    goalsData = [];
  }

  if (goalsData.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="ti ti-target"></i>No goals set yet. Add your first 90-day goal.</div>';
    return;
  }

  let html = '';
  goalsData.forEach((g, i) => {
    const pct = g.progress || 0;
    const color = pct >= 100 ? '#3fb950' : pct >= 50 ? 'var(--brand-mid)' : 'var(--accent)';
    html += `<div class="card" style="margin-bottom:8px;padding:12px 14px">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
        <div style="font-weight:500;font-size:13px;flex:1">${escHtml(g.title)}</div>
        <div style="display:flex;gap:4px">
          <button class="btn bsm bo" onclick="editGoalProgress(${i})" title="Update progress"><i class="ti ti-chart-line" style="font-size:11px"></i></button>
          <button class="btn bsm bo" onclick="deleteGoal(${i})" title="Remove"><i class="ti ti-trash" style="font-size:11px"></i></button>
        </div>
      </div>
      ${g.description ? `<div style="font-size:11px;color:var(--text3);margin-bottom:6px">${escHtml(g.description)}</div>` : ''}
      <div style="height:6px;background:var(--card-hover);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .3s"></div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px;font-family:'DM Mono',monospace">${pct}% complete${g.deadline ? ' · Due ' + g.deadline : ''}</div>
    </div>`;
  });
  container.innerHTML = html;
}

function showAddGoal() {
  const form = document.getElementById('addGoalForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  form.innerHTML = `<div class="card" style="padding:12px">
    <div class="flbl">Goal Title</div>
    <input type="text" id="goalTitle" style="width:100%;margin-bottom:6px" placeholder="e.g. Sign 5 new factory clients">
    <div class="flbl">Description (optional)</div>
    <textarea id="goalDesc" style="width:100%;height:50px;margin-bottom:6px" placeholder="Details..."></textarea>
    <div class="flbl">Deadline (optional)</div>
    <input type="date" id="goalDeadline" style="width:200px;margin-bottom:8px">
    <div><button class="btn bsm" onclick="submitGoal()">Add Goal</button> <button class="btn bsm bo" onclick="document.getElementById('addGoalForm').style.display='none'">Cancel</button></div>
  </div>`;
}

async function submitGoal() {
  const title = document.getElementById('goalTitle').value.trim();
  if (!title) { ntf('Title required'); return; }
  goalsData.push({
    title,
    description: document.getElementById('goalDesc').value.trim(),
    deadline: document.getElementById('goalDeadline').value || null,
    progress: 0,
    createdAt: new Date().toISOString()
  });
  await saveGoals();
  document.getElementById('addGoalForm').style.display = 'none';
}

async function editGoalProgress(idx) {
  const curr = goalsData[idx].progress || 0;
  const val = prompt(`Update progress for "${goalsData[idx].title}" (0-100):`, curr);
  if (val === null) return;
  const n = parseInt(val);
  if (isNaN(n) || n < 0 || n > 100) { ntf('Enter a number 0-100'); return; }
  goalsData[idx].progress = n;
  await saveGoals();
}

async function deleteGoal(idx) {
  if (!confirm(`Delete goal "${goalsData[idx].title}"?`)) return;
  goalsData.splice(idx, 1);
  await saveGoals();
}

async function saveGoals() {
  try {
    await apiPut('/config/goals_private', { goals: goalsData });
    loadGoals();
  } catch {
    ntf('Failed to save goals');
  }
}
