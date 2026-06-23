let _templates = [];

function render_templates() {
  if (!isManager()) return;
  const el = document.getElementById('page-templates');
  el.innerHTML = '<div class="spin"></div>';
  loadTemplates();
}

async function loadTemplates() {
  const el = document.getElementById('page-templates');
  try {
    const data = await apiGet('/templates');
    _templates = (data && data.templates) || [];
    renderTemplatesPage(el);
  } catch {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load templates</div>';
  }
}

function renderTemplatesPage(el) {
  const categories = { cold_outreach: 'Cold Outreach', follow_up: 'Follow Up', quote_sent: 'Quote Sent', meeting_request: 'Meeting Request', thank_you: 'Thank You', custom: 'Custom' };
  const catColors = { cold_outreach: 't-a', follow_up: 't-r', quote_sent: 't-ad', meeting_request: 't-i', thank_you: 't-g', custom: 't-g' };

  let list = '';
  Object.keys(categories).forEach(cat => {
    const tpls = _templates.filter(t => t.category === cat);
    if (tpls.length === 0) return;
    list += `<div class="fl">${categories[cat]} (${tpls.length})</div>`;
    tpls.forEach(t => {
      list += `<div class="user-row" style="cursor:pointer" onclick="showTemplateDetail('${t.id}')">
        <span class="tag ${catColors[cat] || 't-g'}">${cat.replace('_', ' ')}</span>
        <div class="user-info">
          <div class="user-name">${escHtml(t.name)}</div>
          <div class="user-meta">${escHtml(t.subject || 'No subject')}</div>
        </div>
        <div class="user-actions">
          <button class="btn bsm bo" onclick="event.stopPropagation();copyTemplate('${t.id}')"><i class="ti ti-copy" style="font-size:12px"></i></button>
          <button class="btn bsm bdng" onclick="event.stopPropagation();deleteTemplate('${t.id}')"><i class="ti ti-trash" style="font-size:12px"></i></button>
        </div>
      </div>`;
    });
  });

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:12px;color:var(--text2)">${_templates.length} templates</div>
      <button class="btn" onclick="showTemplateForm()"><i class="ti ti-plus" style="font-size:12px"></i> New Template</button>
    </div>
    ${list || '<div class="empty-state"><i class="ti ti-template"></i>No templates yet. Create your first one!</div>'}
    <div id="tplForm"></div>
    <div id="tplDetail"></div>`;
}

function showTemplateForm(existing) {
  const t = existing || {};
  document.getElementById('tplDetail').innerHTML = '';
  const el = document.getElementById('tplForm');
  el.innerHTML = `<div class="card" style="margin-top:14px">
    <div class="ctitle">${t.id ? 'Edit' : 'New'} Template</div>
    <div style="display:flex;gap:8px">
      <div style="flex:2"><div class="flbl">Name *</div><input type="text" id="tplName" style="width:100%" value="${escHtml(t.name || '')}"></div>
      <div style="flex:1"><div class="flbl">Category</div><select id="tplCat" style="width:100%">
        <option value="cold_outreach" ${t.category === 'cold_outreach' ? 'selected' : ''}>Cold Outreach</option>
        <option value="follow_up" ${t.category === 'follow_up' ? 'selected' : ''}>Follow Up</option>
        <option value="quote_sent" ${t.category === 'quote_sent' ? 'selected' : ''}>Quote Sent</option>
        <option value="meeting_request" ${t.category === 'meeting_request' ? 'selected' : ''}>Meeting Request</option>
        <option value="thank_you" ${t.category === 'thank_you' ? 'selected' : ''}>Thank You</option>
        <option value="custom" ${t.category === 'custom' ? 'selected' : ''}>Custom</option>
      </select></div>
    </div>
    <div class="flbl">Subject</div>
    <input type="text" id="tplSubject" style="width:100%" value="${escHtml(t.subject || '')}" placeholder="e.g. {{companyName}} — Industrial Automation Inquiry">
    <div class="flbl">Body</div>
    <textarea id="tplBody" style="width:100%;height:160px">${escHtml(t.body || '')}</textarea>
    <div style="font-size:10px;color:var(--text3);margin-top:4px">Available placeholders: {{clientName}}, {{companyName}}, {{quoteTotal}}, {{followUpDate}}</div>
    ${t.id ? `<input type="hidden" id="tplEditId" value="${t.id}">` : ''}
    <div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn" onclick="saveTemplate()">${t.id ? 'Update' : 'Save'}</button>
      <button class="btn bo" onclick="document.getElementById('tplForm').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}

async function saveTemplate() {
  const name = document.getElementById('tplName').value.trim();
  if (!name) { ntf('Name is required'); return; }
  const body = document.getElementById('tplBody').value.trim();
  if (!body) { ntf('Body is required'); return; }

  const tpl = {
    name,
    category: document.getElementById('tplCat').value,
    subject: document.getElementById('tplSubject').value.trim(),
    body
  };

  const editId = document.getElementById('tplEditId');
  if (editId) {
    await apiCall('PUT', '/templates/' + editId.value, tpl);
    ntf('Template updated');
  } else {
    await apiCall('POST', '/templates', tpl);
    ntf('Template created');
  }
  document.getElementById('tplForm').innerHTML = '';
  loadTemplates();
}

function showTemplateDetail(id) {
  const t = _templates.find(x => x.id === id);
  if (!t) return;
  document.getElementById('tplForm').innerHTML = '';
  const preview = t.body
    .replace(/\{\{clientName\}\}/g, 'John Smith')
    .replace(/\{\{companyName\}\}/g, 'Acme Manufacturing')
    .replace(/\{\{quoteTotal\}\}/g, 'R15,000')
    .replace(/\{\{followUpDate\}\}/g, 'Monday 25 June');

  document.getElementById('tplDetail').innerHTML = `<div class="task-detail" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3>${t.name}</h3>
      <div style="display:flex;gap:6px">
        <button class="btn bsm" onclick="showTemplateForm(_templates.find(x=>x.id==='${id}'))">Edit</button>
        <button class="btn bsm bo" onclick="copyTemplate('${id}')">Copy</button>
        <button class="btn bsm bo" onclick="document.getElementById('tplDetail').innerHTML=''">Close</button>
      </div>
    </div>
    ${t.subject ? `<div style="font-size:12px;color:var(--text2);margin-bottom:8px"><strong>Subject:</strong> ${t.subject}</div>` : ''}
    <div class="fl">PREVIEW</div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;font-size:12px;color:var(--text);white-space:pre-wrap;line-height:1.6">${preview}</div>
  </div>`;
}

function copyTemplate(id) {
  const t = _templates.find(x => x.id === id);
  if (!t) return;
  const text = (t.subject ? 'Subject: ' + t.subject + '\n\n' : '') + t.body;
  navigator.clipboard.writeText(text).then(() => ntf('Copied to clipboard'));
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await apiCall('DELETE', '/templates/' + id);
  ntf('Template deleted');
  loadTemplates();
}
