async function render_goals() {
  if (!isManager()) return;
  const el = document.getElementById('page-goals');
  el.innerHTML = '<div id="goalsContainer"><div class="spin"></div> Loading 90-day goals...</div>';
  loadGoals();
}

let goalsData = [];
let syncState = null;

const WEB_GOAL_DEFAULTS = [
  { p: 1, t: 'Business bank account open', d: false },
  { p: 1, t: 'SARS eFiling registered', d: false },
  { p: 1, t: 'Workshop set up', d: false },
  { p: 1, t: 'LinkedIn company page live', d: false },
  { p: 1, t: 'One-page website live', d: false },
  { p: 1, t: 'First cold outreach sent', d: false },
  { p: 1, t: 'First paid repair job done', d: false },
  { p: 2, t: '2-4 repair jobs completed', d: false },
  { p: 2, t: 'Case study on LinkedIn', d: false },
  { p: 2, t: '3+ warm referral leads', d: false },
  { p: 2, t: '2 factory audits booked', d: false },
  { p: 2, t: 'Google Business Profile live', d: false },
  { p: 3, t: 'Retainer proposal sent', d: false },
  { p: 3, t: 'IoT pilot agreed', d: false },
  { p: 3, t: 'R40,000+ revenue reached', d: false },
  { p: 3, t: 'Q2 plan written', d: false }
];

function normalizeGoal(g, idx) {
  return {
    title: g.title || g.t || `Goal ${idx + 1}`,
    description: g.description || '',
    deadline: g.deadline || null,
    progress: g.progress !== undefined ? Number(g.progress || 0) : (g.d ? 100 : 0),
    phase: Number(g.phase || g.p || 1),
    done: g.done !== undefined ? !!g.done : !!g.d,
    raw: g
  };
}

function toElectronGoal(g) {
  return {
    ...g.raw,
    t: g.title,
    p: Number(g.phase || g.raw?.p || 1),
    d: !!g.done || Number(g.progress || 0) >= 100,
    title: g.title,
    description: g.description,
    deadline: g.deadline,
    progress: Number(g.progress || 0)
  };
}

async function loadGoals() {
  const container = document.getElementById('goalsContainer');
  if (!container) return;

  try {
    syncState = await syncLoad();
    goalsData = ((syncState && syncState.data && syncState.data.goals) || []).map(normalizeGoal);
  } catch {
    goalsData = [];
  }
  if (!goalsData.length) goalsData = WEB_GOAL_DEFAULTS.map(normalizeGoal);

  let html = '';
  [1, 2, 3].forEach(phase => {
    const list = goalsData.filter(g => Number(g.phase || 1) === phase);
    const pct = list.length ? Math.round(list.filter(g => g.done || Number(g.progress || 0) >= 100).length / list.length * 100) : 0;
    const phaseLabel = phase === 1 ? 'Foundation' : phase === 2 ? 'Traction' : 'Scale';
    const days = phase === 1 ? 'Days 1-30' : phase === 2 ? 'Days 31-60' : 'Days 61-90';
    const status = phase === 1 ? 'Active' : 'Upcoming';
    const color = phase === 1 ? 'var(--brand-mid)' : phase === 2 ? 'var(--accent)' : '#3fb950';
    html += `<div class="card" style="margin-bottom:10px;border-color:${phase === 1 ? 'rgba(95,168,196,.35)' : 'var(--border)'}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:15px;color:${color};font-weight:700">Phase ${phase} — ${phaseLabel}</div>
          <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${days}</div>
        </div>
        <span class="bdg" style="background:${phase === 1 ? 'rgba(63,185,80,.18)' : 'var(--bg4)'};color:${phase === 1 ? '#3fb950' : 'var(--text3)'}">${status}</span>
      </div>
      <div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:5px">Goal progress <span style="float:right;font-family:'DM Mono',monospace;color:var(--text2)">${pct}%</span></div>
      <div class="pt" style="margin-bottom:10px"><div class="pf ${phase === 1 ? 'pf-brand' : phase === 2 ? 'pf-accent' : 'pf-green'}" style="width:${pct}%"></div></div>
      ${list.map(g => {
        const idx = goalsData.indexOf(g);
        const done = g.done || Number(g.progress || 0) >= 100;
        return `<div class="tr">
          <input type="checkbox" ${done ? 'checked' : ''} onchange="toggleGoalDone(${idx})">
          <div style="font-size:12px;color:var(--text);${done ? 'text-decoration:line-through;color:var(--text3)' : ''}">${escHtml(g.title)}</div>
        </div>`;
      }).join('')}
    </div>`;
  });
  container.innerHTML = html;
}

async function toggleGoalDone(idx) {
  const g = goalsData[idx];
  const done = !(g.done || Number(g.progress || 0) >= 100);
  g.done = done;
  g.progress = done ? 100 : 0;
  await saveGoals();
}

async function saveGoals() {
  try {
    const current = syncState && syncState.data ? syncState.data : ((await syncLoad()).data || {});
    await syncSave({
      tasks: current.tasks || [],
      posts: current.posts || [],
      goals: goalsData.map(toElectronGoal)
    });
    loadGoals();
  } catch {
    ntf('Failed to save goals');
  }
}
