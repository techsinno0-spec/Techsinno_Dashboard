let webAgentQueue = [];
let webAgentLastScan = null;
let webAgentLastErrors = [];
let webAgentTab = 0;
let webManualTasks = [];
let webAgentJobCards = [];
let webAgentChatMessages = [];
let webAgentBriefingText = '';

const WEB_AGENT_CHAT_KEY = 'techsinno_agent_chat_v1';
const WEB_AGENT_BRIEFING_KEY = 'techsinno_agent_briefing_v1';

const webAgentQuickPrompts = [
  { role: 'Secretary', icon: 'ti-mail-search', prompt: 'Act as my secretary. Triage my unread emails, identify urgent replies or RFQs, and draft any replies that should wait for my approval.' },
  { role: 'Administrator', icon: 'ti-clipboard-check', prompt: 'Act as my administrator. Review tasks, job cards, reminders and CRM follow-ups. Tell me what is overdue, blocked, or missing an owner, then create the most important tasks.' },
  { role: 'Bookkeeper', icon: 'ti-cash', prompt: 'Act as my bookkeeper. Check Zoho Books, list overdue or unpaid invoices, cash concerns, and draft polite payment follow-ups for approval.' },
  { role: 'Marketing', icon: 'ti-speakerphone', prompt: 'Act as my marketing agent. Review CRM leads and campaigns, suggest the next outreach angle, and draft problem-first emails for approval.' },
  { role: 'Work sourcing', icon: 'ti-briefcase', prompt: 'Act as my work sourcing agent. Review my leads, opportunities and queue. Suggest where to find the next TECHSINNO jobs and create follow-up actions.' },
  { role: 'Today', icon: 'ti-list-check', prompt: 'Give me my executive briefing for today. Use live dashboard data first, then give me the top 5 actions in priority order.' }
];

const webAgentTypeLabel = {
  email_reply:'Lead reply', cold_email:'Cold email', quote_draft:'Quote draft', linkedin_post:'LinkedIn post',
  opportunity:'Opportunity', task_reminder:'Task reminder', admin_task:'Admin task', admin_recommendation:'Admin recommendation',
  task_assignment:'Task assignment', job_abnormality:'Job abnormality', lead_followup:'Lead follow-up', service_suggestion:'Service suggestion',
  invoice_overdue:'Overdue invoice', quote_followup:'Quote follow-up', sourcing_target:'Sourcing target'
};
const webAgentTypeIcon  = {
  email_reply:'ti-mail', cold_email:'ti-send', quote_draft:'ti-file-invoice', linkedin_post:'ti-brand-linkedin',
  opportunity:'ti-briefcase', task_reminder:'ti-bell', admin_task:'ti-clipboard-check', admin_recommendation:'ti-bulb',
  task_assignment:'ti-user-plus', job_abnormality:'ti-alert-triangle', lead_followup:'ti-phone-call', service_suggestion:'ti-sparkles',
  invoice_overdue:'ti-cash', quote_followup:'ti-file-invoice', sourcing_target:'ti-target'
};
const webAgentTypeColor = {
  email_reply:'var(--brand-mid)', cold_email:'var(--accent)', quote_draft:'#3fb950', linkedin_post:'#0a66c2',
  opportunity:'#a371f7', task_reminder:'#f85149', admin_task:'#5fa8c4', admin_recommendation:'#a371f7',
  task_assignment:'#3fb950', job_abnormality:'#f85149', lead_followup:'var(--accent)', service_suggestion:'#ff8a65',
  invoice_overdue:'#f85149', quote_followup:'var(--accent)', sourcing_target:'#a371f7'
};
const webAgentFlagColor = { lead:'#3fb950', quote_request:'var(--accent)', urgent:'#f85149', blocked:'#f85149', follow_up:'var(--brand-mid)', outreach:'var(--accent)', content:'var(--brand-mid)', opportunity:'#a371f7', admin:'#5fa8c4' };

async function render_agent() {
  const el = document.getElementById('page-agent');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace" id="webAgentLastScan">Never scanned</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">Claude scans your emails and platforms, prepares everything — you just approve</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn" id="webAgentStartDayBtn" style="display:flex;align-items:center;gap:6px" onclick="webAgentStartDay()"><i class="ti ti-sun"></i> Start my day</button>
      <button class="btn" id="webAgentScanBtn" style="display:flex;align-items:center;gap:6px" onclick="webAgentRunScan()"><i class="ti ti-refresh"></i> Run full scan</button>
      <button class="btn bo bsm" id="webAgentBriefingBtn" onclick="webAgentSendBriefing()" title="Compose and email the morning briefing now"><i class="ti ti-mail-forward"></i> Email briefing</button>
      <button class="btn bo bsm" style="color:#f85149;border-color:rgba(248,81,73,.3)" onclick="webAgentReset()" title="Clear cloud queue"><i class="ti ti-trash"></i> Reset all</button>
    </div>
  </div>
  ${webAgentRenderAssistantPanel()}
  ${webAgentRenderBriefingPanel()}
  <div id="webAgentErrors"></div>
  <div class="g4" style="margin-bottom:14px">
    <div class="stat"><div class="slbl">Pending approval</div><div class="sval ca" id="webAgPending">—</div><div class="ssub">ready for your review</div></div>
    <div class="stat"><div class="slbl">Emails prepared</div><div class="sval cb" id="webAgEmails">—</div><div class="ssub">replies + chasers + outreach</div></div>
    <div class="stat"><div class="slbl">LinkedIn posts</div><div class="sval cg" id="webAgPosts">—</div><div class="ssub">ready to publish</div></div>
    <div class="stat"><div class="slbl">Opportunities</div><div class="sval" id="webAgOpps">—</div><div class="ssub">Upwork + platforms</div></div>
  </div>
  <div class="wtabs" style="margin-bottom:12px">
    <button class="wtab active" id="webAgTab0" onclick="webAgentSetTab(0)">Pending queue</button>
    <button class="wtab" id="webAgTab1" onclick="webAgentSetTab(1)">Opportunities</button>
    <button class="wtab" id="webAgTab2" onclick="webAgentSetTab(2)">History</button>
    <button class="wtab" id="webAgTab3" onclick="webAgentSetTab(3)"><i class="ti ti-world" style="font-size:11px;margin-right:3px"></i>Website jobs</button>
    <button class="wtab" id="webAgTab4" onclick="webAgentSetTab(4)"><i class="ti ti-checklist" style="font-size:11px;margin-right:3px"></i>My Tasks</button>
    <button class="wtab" id="webAgTab5" onclick="webAgentSetTab(5)"><i class="ti ti-file-description" style="font-size:11px;margin-right:3px"></i>Job Cards</button>
    <button class="wtab" id="webAgTab6" onclick="webAgentSetTab(6)">History</button>
  </div>
  <div id="webAgentTabContent"><div class="spin"></div> Loading...</div>`;
  const adminStat = document.getElementById('webAgOpps');
  if (adminStat) {
    adminStat.id = 'webAgAdmin';
    const box = adminStat.closest('.stat');
    if (box) {
      const label = box.querySelector('.slbl');
      const sub = box.querySelector('.ssub');
      if (label) label.textContent = 'Admin alerts';
      if (sub) sub.textContent = 'tasks + jobs + CRM';
    }
  }
  const intro = document.getElementById('webAgentLastScan')?.nextElementSibling;
  if (intro) intro.textContent = 'Claude watches admin, tasks, jobs, money, leads and email, then proposes the next move for approval';
  const adminTab = document.getElementById('webAgTab2');
  if (adminTab) adminTab.textContent = 'Admin review';
  webAgentApplyWorkflowChrome();
  await webAgentLoadQueue();
}

function webAgentSetStatCard(id, newId, label, sub) {
  const value = document.getElementById(id);
  if (!value) return;
  value.id = newId;
  const box = value.closest('.stat');
  if (!box) return;
  const labelEl = box.querySelector('.slbl');
  const subEl = box.querySelector('.ssub');
  if (labelEl) labelEl.textContent = label;
  if (subEl) subEl.textContent = sub;
}

function webAgentSetTabLabel(id, html) {
  const tab = document.getElementById(id);
  if (tab) tab.innerHTML = html;
}

function webAgentApplyWorkflowChrome() {
  webAgentSetStatCard('webAgEmails', 'webAgInbox', 'Inbox autopilot', 'triage + reply drafts');
  webAgentSetStatCard('webAgPosts', 'webAgFollowups', 'Follow-ups', 'quotes + leads + invoices');
  webAgentSetStatCard('webAgAdmin', 'webAgSourcing', 'Work sourcing', 'targets + outreach work');

  webAgentSetTabLabel('webAgTab1', '<i class="ti ti-mail-search" style="font-size:11px;margin-right:3px"></i>Inbox autopilot');
  webAgentSetTabLabel('webAgTab2', '<i class="ti ti-phone-call" style="font-size:11px;margin-right:3px"></i>Follow-ups');
  webAgentSetTabLabel('webAgTab3', '<i class="ti ti-briefcase" style="font-size:11px;margin-right:3px"></i>Work sourcing');
  webAgentSetTabLabel('webAgTab4', 'Admin review');
  webAgentSetTabLabel('webAgTab5', '<i class="ti ti-checklist" style="font-size:11px;margin-right:3px"></i>My Tasks');
  webAgentSetTabLabel('webAgTab6', '<i class="ti ti-file-description" style="font-size:11px;margin-right:3px"></i>Job Cards');

  if (!document.getElementById('webAgTab7')) {
    document.querySelector('#page-agent .wtabs')?.insertAdjacentHTML('beforeend', '<button class="wtab" id="webAgTab7" onclick="webAgentSetTab(7)">History</button>');
  }
}

function webAgentFmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-ZA', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function webAgentLoadChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(WEB_AGENT_CHAT_KEY) || '[]');
    webAgentChatMessages = Array.isArray(saved) ? saved.slice(-12) : [];
  } catch {
    webAgentChatMessages = [];
  }
}

function webAgentSaveChat() {
  localStorage.setItem(WEB_AGENT_CHAT_KEY, JSON.stringify(webAgentChatMessages.slice(-12)));
}

function webAgentRenderAssistantPanel() {
  webAgentLoadChat();
  return `<div class="card" style="padding:13px 14px;margin-bottom:14px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:7px"><i class="ti ti-robot" style="color:#a371f7"></i> Personal AI command center</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px;line-height:1.5">Ask it to work as secretary, administrator, bookkeeper, marketing assistant, lead sourcer or daily operations assistant. It can read live dashboard data and queue actions for approval.</div>
      </div>
      <button class="btn bsm bo" onclick="webAgentClearChat()"><i class="ti ti-eraser"></i> Clear chat</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:6px;margin-bottom:10px">
      ${webAgentQuickPrompts.map((p, i) => `<button class="btn bsm bo" style="justify-content:flex-start;text-align:left;min-height:34px" onclick="webAgentUsePrompt(${i})"><i class="ti ${p.icon}"></i> ${escHtml(p.role)}</button>`).join('')}
    </div>
    <div id="webAgentChatLog" style="max-height:320px;overflow:auto;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:9px;margin-bottom:8px">${webAgentRenderChatMessages()}</div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <textarea id="webAgentChatInput" placeholder="Example: Check my inbox, add follow-up tasks, and draft replies I should approve." style="flex:1;min-height:58px;resize:vertical;font-size:12px;box-sizing:border-box"></textarea>
      <button class="btn" id="webAgentChatBtn" onclick="webAgentSendChat()" style="height:36px"><i class="ti ti-send"></i> Ask</button>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:7px;line-height:1.5">Safety: emails are drafted into the approval queue, not sent automatically. Financial tools require owner access.</div>
  </div>`;
}

function webAgentRenderChatMessages() {
  if (!webAgentChatMessages.length) {
    return `<div style="font-size:12px;color:var(--text3);line-height:1.6;padding:10px;text-align:center">No assistant chat yet. Pick a role above or ask for today's priorities.</div>`;
  }
  return webAgentChatMessages.map(m => {
    const isUser = m.role === 'user';
    return `<div style="display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin-bottom:8px">
      <div style="max-width:82%;background:${isUser ? 'rgba(95,168,196,.18)' : 'var(--bg3)'};border:1px solid ${isUser ? 'rgba(95,168,196,.35)' : 'var(--border)'};border-radius:var(--radius-sm);padding:8px 10px">
        <div style="font-size:10px;color:${isUser ? 'var(--brand-mid)' : '#a371f7'};font-family:'DM Mono',monospace;margin-bottom:4px">${isUser ? 'YOU' : 'AI AGENT'}</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.55;white-space:pre-wrap">${escHtml(m.content || '')}</div>
      </div>
    </div>`;
  }).join('');
}

function webAgentSetChatLogLoading() {
  const log = document.getElementById('webAgentChatLog');
  if (!log) return;
  log.innerHTML = webAgentRenderChatMessages() + `<div style="display:flex;align-items:center;gap:7px;color:var(--text3);font-size:11px;padding:6px 8px"><div class="spin" style="width:12px;height:12px;border-width:2px"></div> Agent is checking live data...</div>`;
  log.scrollTop = log.scrollHeight;
}

function webAgentRefreshChatLog() {
  const log = document.getElementById('webAgentChatLog');
  if (!log) return;
  log.innerHTML = webAgentRenderChatMessages();
  log.scrollTop = log.scrollHeight;
}

function webAgentChatPayload() {
  const messages = webAgentChatMessages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content);
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return messages;
}

function webAgentUsePrompt(index) {
  const p = webAgentQuickPrompts[index];
  const input = document.getElementById('webAgentChatInput');
  if (p && input) {
    input.value = p.prompt;
    input.focus();
  }
}

function webAgentClearChat() {
  webAgentChatMessages = [];
  webAgentSaveChat();
  webAgentRefreshChatLog();
}

async function webAgentSendChat() {
  const input = document.getElementById('webAgentChatInput');
  const btn = document.getElementById('webAgentChatBtn');
  const prompt = input?.value.trim();
  if (!prompt) return ntf('Ask the agent what to do');

  webAgentChatMessages.push({ role: 'user', content: prompt });
  webAgentChatMessages = webAgentChatMessages.slice(-12);
  webAgentSaveChat();
  if (input) input.value = '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Working'; }
  webAgentSetChatLogLoading();

  try {
    const data = await apiPost('/ai/chat', { messages: webAgentChatPayload() });
    if (data && data.error) {
      webAgentChatMessages.push({ role: 'assistant', content: data.error });
      ntf(data.error);
    } else {
      webAgentChatMessages.push({ role: 'assistant', content: data?.text || 'Done.' });
      if (Array.isArray(data?.actions) && data.actions.length) await webAgentLoadQueue();
    }
    webAgentChatMessages = webAgentChatMessages.slice(-12);
    webAgentSaveChat();
    webAgentRefreshChatLog();
  } catch {
    webAgentChatMessages.push({ role: 'assistant', content: 'I could not reach the AI service. Check Claude configuration in Settings and try again.' });
    webAgentSaveChat();
    webAgentRefreshChatLog();
    ntf('AI chat failed');
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Ask'; }
}

function webAgentLoadBriefing() {
  try {
    webAgentBriefingText = localStorage.getItem(WEB_AGENT_BRIEFING_KEY) || '';
  } catch {
    webAgentBriefingText = '';
  }
}

function webAgentSaveBriefing(text) {
  webAgentBriefingText = text || '';
  try { localStorage.setItem(WEB_AGENT_BRIEFING_KEY, webAgentBriefingText); } catch {}
}

function webAgentRenderBriefingPanel() {
  webAgentLoadBriefing();
  const hasBriefing = !!webAgentBriefingText;
  return `<div class="card" style="padding:13px 14px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:9px">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:7px"><i class="ti ti-sun" style="color:var(--accent)"></i> Daily command briefing</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px;line-height:1.5">Start My Day runs the operations scan, refreshes inbox/follow-up/sourcing work, and drafts a live briefing preview before anything is emailed.</div>
      </div>
      <button class="btn bsm" id="webAgentStartDayPanelBtn" onclick="webAgentStartDay()"><i class="ti ti-player-play"></i> Start my day</button>
    </div>
    <div id="webAgentBriefingBox" style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;max-height:260px;overflow:auto">
      ${hasBriefing
        ? `<pre style="white-space:pre-wrap;margin:0;font-size:11px;line-height:1.55;color:var(--text2);font-family:'DM Mono',monospace">${escHtml(webAgentBriefingText)}</pre>`
        : `<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px">No briefing preview yet. Use Start My Day to generate one from live data.</div>`}
    </div>
  </div>`;
}

function webAgentRefreshBriefingBox(loadingText) {
  const box = document.getElementById('webAgentBriefingBox');
  if (!box) return;
  if (loadingText) {
    box.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--text3);font-size:12px;padding:10px"><div class="spin" style="width:13px;height:13px;border-width:2px"></div>${escHtml(loadingText)}</div>`;
    return;
  }
  box.innerHTML = webAgentBriefingText
    ? `<pre style="white-space:pre-wrap;margin:0;font-size:11px;line-height:1.55;color:var(--text2);font-family:'DM Mono',monospace">${escHtml(webAgentBriefingText)}</pre>`
    : `<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px">No briefing preview yet. Use Start My Day to generate one from live data.</div>`;
}

async function webAgentStartDay() {
  const buttons = [document.getElementById('webAgentStartDayBtn'), document.getElementById('webAgentStartDayPanelBtn')].filter(Boolean);
  buttons.forEach(btn => { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Starting'; });
  webAgentRefreshBriefingBox('Running operations scan...');
  ntf('Starting daily command scan...');

  try {
    const scan = await apiPost('/agent/scan', {});
    if (scan && scan.error) {
      webAgentRefreshBriefingBox('');
      ntf(scan.error);
      return;
    }
    await webAgentLoadQueue();
    webAgentRefreshBriefingBox('Composing live briefing preview...');
    const data = await apiPost('/agent/briefing', { dryRun: true });
    if (data && data.error) {
      webAgentRefreshBriefingBox('');
      ntf(data.error);
      return;
    }
    webAgentSaveBriefing(data?.briefing || '');
    webAgentRefreshBriefingBox();
    ntf(`Daily briefing ready · ${scan?.newItems || 0} new queue item(s)`);
  } catch {
    webAgentRefreshBriefingBox('');
    ntf('Start My Day failed');
  } finally {
    buttons.forEach(btn => { btn.disabled = false; btn.innerHTML = btn.id === 'webAgentStartDayPanelBtn' ? '<i class="ti ti-player-play"></i> Start my day' : '<i class="ti ti-sun"></i> Start my day'; });
  }
}

async function webAgentLoadQueue() {
  try {
    const data = await apiGet('/agent/queue');
    webAgentQueue = (data && data.queue) || [];
    webAgentLastScan = data && data.lastScan;
    webAgentLastErrors = (data && data.lastErrors) || [];
  } catch {
    webAgentQueue = [];
    webAgentLastScan = null;
    webAgentLastErrors = [];
  }
  const last = document.getElementById('webAgentLastScan');
  if (last) last.textContent = webAgentLastScan ? 'Last scan: ' + webAgentFmtTime(webAgentLastScan) : 'Never scanned — run full scan in Electron to start';
  webAgentRenderErrors();
  webAgentUpdateStats();
  webAgentRenderTab();
}

function webAgentRenderErrors() {
  const el = document.getElementById('webAgentErrors');
  if (!el) return;
  if (!webAgentLastErrors.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card" style="border:1px solid rgba(248,81,73,.35);background:rgba(248,81,73,.06);padding:10px 12px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:600;color:#f85149;margin-bottom:5px"><i class="ti ti-alert-triangle"></i> Last scan reported ${webAgentLastErrors.length} problem(s)</div>
    ${webAgentLastErrors.map(e => `<div style="font-size:11px;color:var(--text2);line-height:1.5">• ${escHtml(e)}</div>`).join('')}
    <div style="font-size:10px;color:var(--text3);margin-top:5px">These sources returned nothing this scan — fix the connection in Settings, then run a new scan.</div>
  </div>`;
}

function webAgentUpdateStats() {
  const pending = webAgentQueue.filter(i => i.status === 'pending');
  const inbox = pending.filter(i => i.source === 'inbox_autopilot' || (i.type === 'email_reply' && i.emailId));
  const followups = pending.filter(i => ['lead_followup','quote_followup','invoice_overdue','task_reminder'].includes(i.type));
  const sourcing = pending.filter(i => i.source === 'sourcing_engine' || ['sourcing_target','opportunity','cold_email'].includes(i.type));
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('webAgPending', pending.length);
  set('webAgInbox', inbox.length);
  set('webAgFollowups', followups.length);
  set('webAgSourcing', sourcing.length);
}

function webAgentSetTab(tab) {
  webAgentTab = tab;
  [0,1,2,3,4,5,6,7].forEach(i => document.getElementById('webAgTab' + i)?.classList.toggle('active', i === tab));
  webAgentRenderTab();
}

function webAgentRenderTab() {
  const el = document.getElementById('webAgentTabContent');
  if (!el) return;
  if (webAgentTab === 0) el.innerHTML = webAgentRenderPending();
  else if (webAgentTab === 1) el.innerHTML = webAgentRenderInboxAutopilot();
  else if (webAgentTab === 2) el.innerHTML = webAgentRenderFollowUps();
  else if (webAgentTab === 3) el.innerHTML = webAgentRenderWorkSourcing();
  else if (webAgentTab === 4) el.innerHTML = webAgentRenderAdminReview();
  else if (webAgentTab === 5) { el.innerHTML = '<div class="card"><div class="spin"></div> Loading tasks...</div>'; webAgentRenderMyTasks(el); }
  else if (webAgentTab === 6) { el.innerHTML = '<div class="card"><div class="spin"></div> Loading job cards...</div>'; webAgentRenderJobCards(el); }
  else el.innerHTML = webAgentRenderHistory();
}

function webAgentRenderPending() {
  const items = webAgentQueue.filter(i => i.status === 'pending').sort((a,b) => (a.priority || 9) - (b.priority || 9));
  if (!items.length) return `<div class="card" style="text-align:center;padding:30px"><i class="ti ti-check" style="font-size:32px;color:#3fb950;display:block;margin-bottom:8px"></i><div style="font-size:13px;color:var(--text2)">Queue is empty.</div><div style="font-size:11px;color:var(--text3);margin-top:4px">Run full scan to find leads, prepare emails, chase invoices and review admin.</div></div>`;
  const groups = {};
  items.forEach(i => { if (!groups[i.type]) groups[i.type] = []; groups[i.type].push(i); });
  return Object.entries(groups).map(([type, list]) => `<div style="margin-bottom:16px">
    <div class="fl" style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
      <i class="ti ${webAgentTypeIcon[type] || 'ti-file'}" style="color:${webAgentTypeColor[type] || 'var(--text2)'}"></i>
      <span>${webAgentTypeLabel[type] || type} (${list.length})</span>
    </div>
    ${list.map(webAgentRenderItem).join('')}
  </div>`).join('');
}

function webAgentRenderItem(item) {
  const flagColor = webAgentFlagColor[item.flagType] || 'var(--text3)';
  const preview = (item.body || '').slice(0, 180).replace(/\n/g, ' ');
  const actionBtn = item.action && item.action.kind ? `<button class="btn bsm" onclick="webAgentRunAction('${item.id}')"><i class="ti ti-player-play"></i> ${escHtml(item.action.label || 'Approve action')}</button>` : '';
  const sendable = ['email_reply', 'cold_email', 'invoice_overdue', 'quote_followup'].includes(item.type) && item.to && item.provider;
  const sendBtn = sendable ? `<button class="btn bsm" onclick="webAgentReviewSend('${item.id}')"><i class="ti ti-send"></i> Review &amp; send</button>` : '';
  const meta = [
    item.inboxCategory ? `Inbox: ${item.inboxCategory}` : '',
    item.urgency ? `Urgency: ${item.urgency}` : '',
    item.suggestedAction ? `Action: ${item.suggestedAction}` : '',
    item.source ? `Source: ${item.source}` : ''
  ].filter(Boolean);
  const metaHtml = meta.length ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin:5px 0">${meta.map(m => `<span style="font-size:9px;color:var(--text3);border:1px solid var(--border);border-radius:999px;padding:2px 6px;font-family:'DM Mono',monospace">${escHtml(m)}</span>`).join('')}</div>` : '';
  const diagnostic = (item.painPoint || item.evidence || item.techsinnoSolution || item.nextStep) ? `<div style="background:rgba(95,168,196,.08);border:1px solid rgba(95,168,196,.18);border-radius:var(--radius-sm);padding:8px 10px;margin:7px 0">
    <div style="font-size:10px;color:var(--brand-mid);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">Problem spotted</div>
    ${item.painPoint ? `<div style="font-size:11px;color:var(--text);margin-bottom:3px"><strong>Pain:</strong> ${escHtml(item.painPoint)}</div>` : ''}
    ${item.evidence ? `<div style="font-size:10px;color:var(--text2);margin-bottom:3px"><strong>Evidence/assumption:</strong> ${escHtml(item.evidence)}</div>` : ''}
    ${item.techsinnoSolution ? `<div style="font-size:10px;color:var(--text2);margin-bottom:3px"><strong>TECHSINNO fit:</strong> ${escHtml(item.techsinnoSolution)}</div>` : ''}
    ${item.nextStep ? `<div style="font-size:10px;color:var(--accent)"><strong>First step:</strong> ${escHtml(item.nextStep)}</div>` : ''}
  </div>` : '';
  return `<div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid ${flagColor};border-radius:var(--radius);padding:11px 13px;margin-bottom:8px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.title || item.subject || '(untitled)')}</div>
        <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${escHtml(item.reason || '')}</div>
      </div>
      <button class="btn bsm bo" onclick="webAgentDismiss('${item.id}')">Skip</button>
    </div>
    ${item.to ? `<div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:5px">To: ${escHtml(item.to)}</div>` : ''}
    ${metaHtml}
    ${diagnostic}
    <div style="font-size:11px;color:var(--text2);line-height:1.5;margin:6px 0 9px;background:var(--bg4);padding:7px 9px;border-radius:var(--radius-sm)">${escHtml(preview)}${item.body && item.body.length > 180 ? '…' : ''}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${sendBtn}
      ${actionBtn}
      ${item.url ? `<button class="btn bsm" onclick="window.open('${item.url}','_blank')"><i class="ti ti-external-link"></i> View</button>` : ''}
      <button class="btn bsm bo" onclick="webAgentCopy('${item.id}')"><i class="ti ti-copy"></i> Copy</button>
    </div>
    <div id="agsend-${item.id}" data-open="0"></div>
  </div>`;
}

// Inline editor: review the AI-drafted email, tweak it, then send via the real mail endpoint.
function webAgentReviewSend(id) {
  const item = webAgentQueue.find(i => i.id === id);
  if (!item) return;
  const box = document.getElementById('agsend-' + id);
  if (!box) return;
  if (box.dataset.open === '1') { box.innerHTML = ''; box.dataset.open = '0'; return; }
  box.dataset.open = '1';
  box.innerHTML = `
    <div style="margin-top:8px;padding:10px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm)">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px">TO · via ${escHtml(item.provider || '')}</div>
      <input id="agsend-to-${id}" type="email" value="${escHtml(item.to || '')}" style="width:100%;font-size:12px;margin-bottom:6px;box-sizing:border-box">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px">SUBJECT</div>
      <input id="agsend-subject-${id}" type="text" value="${escHtml(item.subject || '')}" style="width:100%;font-size:12px;margin-bottom:6px;box-sizing:border-box">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px">MESSAGE</div>
      <textarea id="agsend-body-${id}" style="width:100%;font-size:12px;min-height:160px;resize:vertical;box-sizing:border-box">${escHtml(item.body || '')}</textarea>
      <div id="agsend-err-${id}" style="font-size:11px;color:#f85149;margin-top:6px"></div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn bsm" id="agsend-btn-${id}" onclick="webAgentSendEmail('${id}')"><i class="ti ti-send"></i> Send now</button>
        <button class="btn bsm bo" onclick="webAgentReviewSend('${id}')">Close</button>
      </div>
    </div>`;
}

async function webAgentSendEmail(id) {
  const item = webAgentQueue.find(i => i.id === id);
  if (!item) return;
  const provider = item.provider;
  const to = document.getElementById('agsend-to-' + id)?.value.trim();
  const subject = document.getElementById('agsend-subject-' + id)?.value.trim();
  const body = document.getElementById('agsend-body-' + id)?.value;
  const err = document.getElementById('agsend-err-' + id);
  const setErr = (t) => { if (err) err.textContent = t; };

  if (!provider) return setErr('No email provider on this item');
  if (!to) return setErr('Recipient is required');
  if (!subject) return setErr('Subject is required');
  if (!confirm(`Send this email via ${provider} to ${to}?`)) return;
  setErr('');

  const btn = document.getElementById('agsend-btn-' + id);
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Sending...'; }

  try {
    const data = await apiPost(`/email/send/${provider}`, { to, subject, body });
    if (data && data.error) {
      setErr(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Send now'; }
      return;
    }
    webAgentQueue = webAgentQueue.map(i => i.id === id ? { ...i, status: 'approved', approvedAt: Date.now() } : i);
    await apiPut('/agent/queue', { queue: webAgentQueue, lastScan: webAgentLastScan });
    ntf('Email sent');
    webAgentUpdateStats();
    webAgentRenderTab();
  } catch {
    setErr('Failed to send email');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Send now'; }
  }
}

function webAgentRenderInboxAutopilot() {
  const items = webAgentQueue
    .filter(i => (i.source === 'inbox_autopilot' || (i.type === 'email_reply' && i.emailId)) && i.status !== 'dismissed')
    .sort((a,b) => (a.priority || 9) - (b.priority || 9));
  if (!items.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No inbox autopilot items yet.<div style="font-size:11px;color:var(--text3);margin-top:6px">Run Start My Day or Run full scan to classify unread mail, spot RFQs, and draft replies for approval.</div></div>';
  return items.map(webAgentRenderItem).join('');
}

function webAgentRenderFollowUps() {
  const followTypes = ['lead_followup','quote_followup','invoice_overdue','task_reminder'];
  const items = webAgentQueue
    .filter(i => followTypes.includes(i.type) && i.status !== 'dismissed')
    .sort((a,b) => (a.priority || 9) - (b.priority || 9));
  if (!items.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No follow-ups waiting.<div style="font-size:11px;color:var(--text3);margin-top:6px">The engine watches CRM follow-up dates, stale leads, sent quotes, overdue invoices, and due reminders.</div></div>';
  return items.map(webAgentRenderItem).join('');
}

function webAgentRenderWorkSourcing() {
  const items = webAgentQueue
    .filter(i => (i.source === 'sourcing_engine' || ['sourcing_target','opportunity','cold_email'].includes(i.type)) && i.status !== 'dismissed')
    .sort((a,b) => (a.priority || 9) - (b.priority || 9));
  if (!items.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No sourcing targets yet.<div style="font-size:11px;color:var(--text3);margin-top:6px">Run Start My Day to generate weekly prospecting targets from your CRM gaps and TECHSINNO service fit.</div></div>';
  return `<div class="card" style="padding:10px 12px;margin-bottom:10px">
    <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px"><i class="ti ti-briefcase"></i> Work sourcing board</div>
    <div style="font-size:11px;color:var(--text3);line-height:1.5">These are sourcing plays, not scraped leads yet. They create prospect-list tasks and outreach angles from your CRM gaps. External tender/search feeds can be added later.</div>
  </div>${items.map(webAgentRenderItem).join('')}`;
}

function webAgentRenderOpportunities() {
  const opps = webAgentQueue.filter(i => i.type === 'opportunity' && i.status !== 'dismissed');
  if (!opps.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No opportunities yet.<div style="font-size:11px;color:var(--text3);margin-top:6px">Note: Upwork discontinued its public RSS job feeds in Aug 2024, so the old Upwork leg has been retired. A rebuilt sourcing leg (tenders + search) is planned.</div></div>';
  return opps.map(webAgentRenderItem).join('');
}

function webAgentRenderAdminReview() {
  const adminTypes = ['admin_task','admin_recommendation','task_assignment','job_abnormality','lead_followup','service_suggestion','invoice_overdue'];
  const items = webAgentQueue
    .filter(i => adminTypes.includes(i.type) && i.status !== 'dismissed')
    .sort((a,b) => (a.priority || 9) - (b.priority || 9));
  if (!items.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No admin alerts yet. Run a full scan to review tasks, jobs, CRM, invoices and next actions.</div>';
  return items.map(webAgentRenderItem).join('');
}

function webAgentRenderHistory() {
  const done = webAgentQueue.filter(i => ['approved','dismissed','error'].includes(i.status));
  if (!done.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No history yet.</div>';
  return done.map(i => `<div class="tr"><div style="flex:1"><div style="font-size:12px;color:var(--text)">${escHtml(i.title || i.subject || '(untitled)')}</div><div style="font-size:10px;color:var(--text3)">${escHtml(i.status)}</div></div></div>`).join('');
}

function webAgentRenderWebsiteJobs() {
  const jobs = webAgentQueue.filter(i => i.source === 'website_match' && i.status !== 'dismissed');
  if (!jobs.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No website-matched jobs yet.</div>';
  return jobs.map(webAgentRenderItem).join('');
}

async function webAgentLoadManualTasks() {
  const state = await syncLoad();
  webManualTasks = (state && state.data && Array.isArray(state.data.manualTasks)) ? state.data.manualTasks : [];
  return state && state.data ? state.data : {};
}

async function webAgentSaveManualTasks() {
  const saved = await syncSave({ manualTasks: webManualTasks });
  if (!saved || saved.error || saved.success === false) throw new Error(saved && saved.error ? saved.error : 'Cloud sync failed');
}

async function webAgentRenderMyTasks(el) {
  try {
    await webAgentLoadManualTasks();
    el.innerHTML = webAgentMyTasksHtml();
  } catch {
    el.innerHTML = '<div class="card" style="color:#f85149;font-size:12px">Failed to load shared tasks.</div>';
  }
}

function webAgentMyTasksHtml() {
  const rows = webManualTasks.length ? webManualTasks.map(t => {
    const done = t.status === 'done';
    const due = t.deadline ? new Date(t.deadline + (t.time ? 'T' + t.time : 'T00:00')) : null;
    const overdue = due && due.getTime() < Date.now() && !done;
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 11px;background:var(--bg3);border:1px solid ${overdue ? 'rgba(248,81,73,.4)' : 'var(--border)'};border-radius:var(--radius);margin-bottom:6px;opacity:${done ? '.55' : '1'}">
      <input type="checkbox" ${done ? 'checked' : ''} onchange="webAgentToggleManualTask('${t.id}',this.checked)" style="width:15px;height:15px;flex-shrink:0;cursor:pointer;margin-top:2px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:var(--text);text-decoration:${done ? 'line-through' : 'none'}">${escHtml(t.title || '')}</div>
        ${t.description ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(t.description)}</div>` : ''}
        <div style="font-size:10px;color:${overdue ? '#f85149' : 'var(--text3)'};font-family:'DM Mono',monospace;margin-top:4px">${overdue ? 'OVERDUE · ' : ''}${t.deadline || 'No deadline'}${t.time ? ' · ' + t.time : ''} · ${escHtml(t.priority || 'medium')}</div>
      </div>
      <button class="btn bo bsm" onclick="webAgentDeleteManualTask('${t.id}')">Delete</button>
    </div>`;
  }).join('') : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:18px">No tasks yet — add one below.</div>';

  return `<div class="card" style="margin-bottom:12px">
    <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:10px"><i class="ti ti-plus"></i> Add shared task</div>
    <div style="display:grid;grid-template-columns:1fr 150px 150px 130px;gap:8px;margin-bottom:8px">
      <input id="webMtTitle" type="text" placeholder="Task title *" style="font-size:12px">
      <input id="webMtDeadline" type="date" style="font-size:12px">
      <input id="webMtTime" type="time" style="font-size:12px">
      <select id="webMtPriority" style="font-size:12px"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select>
    </div>
    <textarea id="webMtDesc" placeholder="Description / notes (optional)" style="width:100%;font-size:12px;min-height:52px;resize:vertical;margin-bottom:8px;box-sizing:border-box"></textarea>
    <div style="text-align:right"><button class="btn bsm" onclick="webAgentAddManualTask()"><i class="ti ti-plus"></i> Add task</button></div>
  </div>${rows}`;
}

async function webAgentAddManualTask() {
  const title = document.getElementById('webMtTitle')?.value.trim();
  if (!title) return ntf('Task title is required');
  const previous = [...webManualTasks];
  webManualTasks.unshift({
    id: 'mt_' + Date.now().toString(36),
    title,
    description: document.getElementById('webMtDesc')?.value.trim() || '',
    deadline: document.getElementById('webMtDeadline')?.value || '',
    time: document.getElementById('webMtTime')?.value || '',
    priority: document.getElementById('webMtPriority')?.value || 'medium',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  try { await webAgentSaveManualTasks(); }
  catch(e) { webManualTasks = previous; ntf('Task was not saved to cloud'); return; }
  webAgentRenderTab();
  ntf('Task added');
}

async function webAgentToggleManualTask(id, done) {
  const previous = [...webManualTasks];
  webManualTasks = webManualTasks.map(t => t.id === id ? { ...t, status: done ? 'done' : 'pending', updatedAt: Date.now() } : t);
  try { await webAgentSaveManualTasks(); }
  catch(e) { webManualTasks = previous; ntf('Task was not saved to cloud'); return; }
  webAgentRenderTab();
}

async function webAgentDeleteManualTask(id) {
  const previous = [...webManualTasks];
  webManualTasks = webManualTasks.filter(t => t.id !== id);
  try { await webAgentSaveManualTasks(); }
  catch(e) { webManualTasks = previous; ntf('Task was not deleted from cloud'); return; }
  webAgentRenderTab();
  ntf('Task deleted');
}

async function webAgentRenderJobCards(el) {
  try {
    const data = await apiGet('/job-cards');
    webAgentJobCards = (data && data.jobCards) || [];
    if (!webAgentJobCards.length) {
      el.innerHTML = '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No job cards yet.</div>';
      return;
    }
    el.innerHTML = webAgentJobCards.map(c => `<div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(c.title || c.jobTitle || '(untitled)')}</div>
          <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:3px">${escHtml(c.jobNumber || c.docNumber || '')} · ${escHtml(c.clientName || c.client || 'Unknown client')} · ${escHtml(c.status || 'open')}</div>
          ${(c.description || c.summary) ? `<div style="font-size:11px;color:var(--text2);line-height:1.5;margin-top:7px">${escHtml(c.description || c.summary)}</div>` : ''}
        </div>
        <button class="btn bo bsm" onclick="webAgentDeleteJobCard('${c.id}')">Delete</button>
      </div>
    </div>`).join('');
  } catch {
    el.innerHTML = '<div class="card" style="color:#f85149;font-size:12px">Failed to load job cards.</div>';
  }
}

async function webAgentDeleteJobCard(id) {
  if (!confirm('Delete this job card?')) return;
  await apiDelete('/job-cards/' + id);
  webAgentRenderTab();
  ntf('Job card deleted');
}

async function webAgentDismiss(id) {
  webAgentQueue = webAgentQueue.map(i => i.id === id ? { ...i, status: 'dismissed' } : i);
  await apiPut('/agent/queue', { queue: webAgentQueue, lastScan: webAgentLastScan });
  webAgentUpdateStats();
  webAgentRenderTab();
}

async function webAgentMarkActionApproved(id, message) {
  webAgentQueue = webAgentQueue.map(i => i.id === id ? { ...i, status: 'approved', approvedAt: Date.now() } : i);
  await apiPut('/agent/queue', { queue: webAgentQueue, lastScan: webAgentLastScan });
  ntf(message);
  webAgentUpdateStats();
  webAgentRenderTab();
}

async function webAgentRunAction(id) {
  const item = webAgentQueue.find(i => i.id === id);
  if (!item || !item.action || !item.action.kind) return;
  if (!confirm(`Approve AI action: ${item.action.label || item.title || 'Run action'}?`)) return;

  try {
    if (item.action.kind === 'create_task') {
      const payload = item.action.payload || {};
      if (!payload.title || !payload.assignedTo) {
        ntf('AI action is missing task title or assignee');
        return;
      }
      const data = await apiPost('/tasks', payload);
      if (data && data.error) {
        ntf(data.error);
        return;
      }
      await webAgentMarkActionApproved(id, 'Task created from AI recommendation');
      return;
    }
    if (item.action.kind === 'create_client') {
      const payload = item.action.payload || {};
      if (!payload.companyName) {
        ntf('AI action is missing company name');
        return;
      }
      const data = await apiPost('/clients', payload);
      if (data && data.error) {
        ntf(data.error);
        return;
      }
      await webAgentMarkActionApproved(id, 'Lead created from AI recommendation');
      return;
    }
    if (item.action.kind === 'create_reminder') {
      const payload = item.action.payload || {};
      if (!payload.title || !payload.dueDate) {
        ntf('AI action is missing reminder title or due date');
        return;
      }
      const data = await apiPost('/reminders', payload);
      if (data && data.error) {
        ntf(data.error);
        return;
      }
      await webAgentMarkActionApproved(id, 'Reminder created from AI recommendation');
      return;
    }
    ntf('This AI action is not supported yet');
  } catch {
    ntf('AI action failed');
  }
}

async function webAgentReset() {
  if (!confirm('Clear the shared AI queue?')) return;
  webAgentQueue = [];
  webAgentLastScan = null;
  await apiPut('/agent/queue', { queue: [], lastScan: null });
  webAgentUpdateStats();
  webAgentRenderTab();
}

function webAgentCopy(id) {
  const item = webAgentQueue.find(i => i.id === id);
  if (!item) return;
  navigator.clipboard.writeText([item.subject, item.body].filter(Boolean).join('\n\n'));
  ntf('Copied');
}

async function webAgentRunScan() {
  const btn = document.getElementById('webAgentScanBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Scanning...'; }
  ntf('Cloud AI scan started...');
  try {
    const data = await apiPost('/agent/scan', {});
    if (data && data.error) ntf(data.error);
    else ntf(`Scan complete · ${data.newItems || 0} new item(s)${(data.errors && data.errors.length) ? ` · ${data.errors.length} warning(s)` : ''}`);
    await webAgentLoadQueue();
  } catch {
    ntf('Cloud scan failed');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-refresh"></i> Run full scan'; }
}

async function webAgentSendBriefing() {
  if (!confirm('Compose and email the briefing now?')) return;
  const btn = document.getElementById('webAgentBriefingBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Building...'; }
  ntf('Composing briefing...');
  try {
    const data = await apiPost('/agent/briefing', {});
    if (data && data.error) ntf(data.error);
    else {
      webAgentSaveBriefing(data?.briefing || webAgentBriefingText);
      webAgentRefreshBriefingBox();
      ntf(`Briefing sent to ${data.sentTo} via ${data.provider}`);
    }
  } catch {
    ntf('Briefing failed');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail-forward"></i> Email briefing'; }
}
