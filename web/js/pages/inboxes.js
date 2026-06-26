let _emailAccounts = null;
let _activeProvider = null;
let _activeFolder = 'inbox';
let _currentMessages = [];

async function render_inboxes() {
  if (!isManager()) return;
  const el = document.getElementById('page-inboxes');
  el.innerHTML = '<div class="spin"></div>';
  await loadEmailAccounts();
}

async function loadEmailAccounts() {
  const el = document.getElementById('page-inboxes');
  try {
    const data = await apiGet('/email/accounts');
    _emailAccounts = data.accounts || {};
    if (window._pendingEmailProvider) _activeProvider = window._pendingEmailProvider;

    const providers = [
      { key: 'gmail', label: 'Gmail', icon: 'ti-brand-gmail', color: '#EA4335' },
      { key: 'outlook', label: 'Outlook', icon: 'ti-brand-windows', color: '#0078D4' },
      { key: 'zoho_mail', label: 'Zoho Mail', icon: 'ti-mail', color: '#F4A300' }
    ];

    const connectedCount = providers.filter(p => _emailAccounts[p.key]?.connected).length;

    let cards = providers.map(p => {
      const acct = _emailAccounts[p.key];
      const connected = acct?.connected;
      return `<div class="card" style="cursor:${connected ? 'pointer' : 'default'}" ${connected ? `onclick="openProviderInbox('${p.key}')"` : ''}>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <i class="ti ${p.icon}" style="font-size:22px;color:${p.color}"></i>
          <div style="flex:1">
            <div style="font-weight:500;font-size:13px">${p.label}</div>
            <div style="font-size:10px;color:${connected ? '#3fb950' : 'var(--text3)'};font-family:'DM Mono',monospace">${connected ? 'CONNECTED' : 'NOT CONNECTED'}</div>
          </div>
        </div>
        ${connected
          ? `<div style="font-size:11px;color:var(--text2);margin-bottom:8px">${escHtml(acct.email || acct.displayName)}</div>
             <div style="display:flex;gap:6px">
               <button class="btn bsm" onclick="event.stopPropagation();openProviderInbox('${p.key}')"><i class="ti ti-inbox" style="font-size:11px;margin-right:3px"></i> Inbox</button>
               <button class="btn bsm bdng" onclick="event.stopPropagation();disconnectEmail('${p.key}')">Disconnect</button>
             </div>`
          : `<button class="btn bsm" onclick="connectEmail('${p.key}')">Connect ${p.label}</button>`}
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:12px;color:var(--text2)">${connectedCount} of 3 email providers connected</div>
        <button class="btn bsm bo" onclick="render_inboxes()"><i class="ti ti-refresh" style="font-size:12px;margin-right:3px"></i> Refresh</button>
      </div>
      <div class="g3">${cards}</div>
      <div id="emailInboxArea"></div>`;

    if (_activeProvider && _emailAccounts[_activeProvider]?.connected) {
      openProviderInbox(_activeProvider);
    } else if (_activeProvider && _emailAccounts[_activeProvider] && !_emailAccounts[_activeProvider].connected) {
      const labels = { gmail: 'Gmail', outlook: 'Outlook', zoho_mail: 'Zoho Mail' };
      document.getElementById('emailInboxArea').innerHTML = `<div class="card" style="margin-top:16px;text-align:center;padding:28px">
        <i class="ti ti-mail-off" style="font-size:28px;color:var(--text3);display:block;margin-bottom:8px"></i>
        <div style="font-size:13px;color:var(--text2);margin-bottom:8px">${labels[_activeProvider] || 'Mailbox'} is not connected yet.</div>
        <button class="btn bsm" onclick="connectEmail('${_activeProvider}')">Connect ${labels[_activeProvider] || 'mail'}</button>
      </div>`;
    }
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load email accounts</div>';
  }
}

async function connectEmail(provider) {
  try {
    const data = await apiGet('/email/connect/' + provider);
    if (!data?.url) { ntf('Failed to get authorization URL'); return; }
    const popup = window.open(data.url, 'email_auth', 'width=600,height=700,scrollbars=yes');
    window.addEventListener('message', function handler(e) {
      if (e.data?.type === 'email-auth') {
        window.removeEventListener('message', handler);
        if (e.data.success) {
          ntf(e.data.message || 'Connected!');
          loadEmailAccounts();
        } else {
          ntf(e.data.message || 'Connection failed');
        }
      }
    });
  } catch { ntf('Failed to initiate connection'); }
}

async function disconnectEmail(provider) {
  if (!confirm('Disconnect this email provider?')) return;
  try {
    await apiPost('/email/disconnect/' + provider);
    ntf('Disconnected');
    if (_activeProvider === provider) _activeProvider = null;
    loadEmailAccounts();
  } catch { ntf('Failed to disconnect'); }
}

async function openProviderInbox(provider) {
  _activeProvider = provider;
  _activeFolder = 'inbox';
  await loadInbox(provider, 'inbox');
}

async function loadInbox(provider, folder) {
  _activeFolder = folder;
  const area = document.getElementById('emailInboxArea');
  if (!area) return;

  const labels = { gmail: 'Gmail', outlook: 'Outlook', zoho_mail: 'Zoho Mail' };
  const colors = { gmail: '#EA4335', outlook: '#0078D4', zoho_mail: '#F4A300' };
  const acct = _emailAccounts[provider];

  area.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;margin-top:16px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:600;font-size:14px;color:${colors[provider]}">${labels[provider]}</span>
        <span style="font-size:11px;color:var(--text3)">${escHtml(acct?.email || '')}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn bsm ${folder === 'inbox' ? '' : 'bo'}" onclick="loadInbox('${provider}','inbox')"><i class="ti ti-inbox" style="font-size:11px;margin-right:3px"></i> Inbox</button>
        <button class="btn bsm ${folder === 'sent' ? '' : 'bo'}" onclick="loadInbox('${provider}','sent')"><i class="ti ti-send" style="font-size:11px;margin-right:3px"></i> Sent</button>
        <button class="btn bsm bo" onclick="openComposeModal('${provider}')"><i class="ti ti-pencil" style="font-size:11px;margin-right:3px"></i> Compose</button>
      </div>
    </div>
    <div id="emailMessageList"><div class="spin"></div></div>
    <div id="emailReadPane" style="display:none"></div>`;

  try {
    const data = await apiGet(`/email/inbox/${provider}?folder=${folder}`);
    if (data.error) { document.getElementById('emailMessageList').innerHTML = `<div class="empty-state" style="padding:20px"><i class="ti ti-alert-circle"></i><div style="font-size:12px;color:#f85149">${escHtml(data.error)}</div></div>`; return; }

    _currentMessages = data.messages || [];
    const unread = data.unreadCount || 0;

    if (_currentMessages.length === 0) {
      document.getElementById('emailMessageList').innerHTML = `<div class="empty-state" style="padding:30px"><i class="ti ti-inbox-off" style="font-size:24px"></i><div style="font-size:12px;color:var(--text3);margin-top:6px">No messages</div></div>`;
      return;
    }

    let rows = '';
    _currentMessages.forEach((m, i) => {
      const sender = folder === 'sent' ? (m.to || 'Unknown') : (m.from || 'Unknown');
      const senderShort = sender.replace(/<.*>/, '').trim() || sender;
      const dateStr = m.date ? timeAgo(m.date) : '';
      const unreadStyle = m.unread ? 'font-weight:600;color:var(--text)' : 'color:var(--text2)';

      rows += `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''" onclick="readEmailMessage('${provider}','${m.id}',${i})">
        ${m.unread ? '<div style="width:6px;height:6px;border-radius:50%;background:var(--brand-mid);flex-shrink:0"></div>' : '<div style="width:6px;flex-shrink:0"></div>'}
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
            <div style="font-size:12px;${unreadStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${escHtml(senderShort)}</div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;flex-shrink:0">${dateStr}</div>
          </div>
          <div style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${escHtml(m.subject)}</div>
        </div>
      </div>`;
    });

    document.getElementById('emailMessageList').innerHTML = `
      ${folder === 'inbox' && unread > 0 ? `<div style="font-size:11px;color:var(--brand-mid);padding:6px 12px;border-bottom:1px solid var(--border);font-family:'DM Mono',monospace">${unread} unread</div>` : ''}
      <div class="card" style="padding:0;overflow:hidden">${rows}</div>`;
  } catch (err) {
    document.getElementById('emailMessageList').innerHTML = `<div class="empty-state" style="padding:20px"><i class="ti ti-alert-circle"></i><div style="font-size:12px;color:#f85149">Failed to load messages</div></div>`;
  }
}

async function readEmailMessage(provider, messageId, idx) {
  const listEl = document.getElementById('emailMessageList');
  const readEl = document.getElementById('emailReadPane');
  if (!readEl) return;

  readEl.style.display = 'block';
  readEl.innerHTML = '<div class="spin" style="margin:20px auto"></div>';
  listEl.style.display = 'none';

  try {
    const msg = await apiGet(`/email/message/${provider}/${messageId}`);
    if (msg.error) {
      readEl.innerHTML = `<div style="color:#f85149;font-size:12px;padding:20px">${escHtml(msg.error)}</div>`;
      return;
    }

    let attHtml = '';
    if (msg.attachments?.length > 0) {
      const attItems = msg.attachments.map(a => {
        const sizeStr = a.size > 0 ? ` (${Math.round(a.size / 1024)}KB)` : '';
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer;margin:3px" onclick="downloadEmailAttachment('${provider}','${messageId}','${a.id}','${escHtml(a.name).replace(/'/g, "\\'")}','${a.folderId || ''}')">
          <i class="ti ti-paperclip" style="font-size:12px;color:var(--brand-mid)"></i>
          ${escHtml(a.name)}${sizeStr}
          <i class="ti ti-download" style="font-size:11px;color:var(--text3)"></i>
        </span>`;
      }).join('');
      attHtml = `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:6px">ATTACHMENTS (${msg.attachments.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${attItems}</div>
      </div>`;
    }

    const fromEsc = escHtml(msg.from || '').replace(/'/g, "\\'");
    const subjectEsc = escHtml(msg.subject || '').replace(/'/g, "\\'");

    readEl.innerHTML = `<div class="card" style="max-width:760px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div style="min-width:0;flex:1">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${escHtml(msg.subject)}</div>
          <div style="font-size:11px;color:var(--text2)">From: ${escHtml(msg.from)}</div>
          ${msg.to ? `<div style="font-size:11px;color:var(--text3)">To: ${escHtml(msg.to)}</div>` : ''}
          <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px">${msg.date ? formatDateTime(msg.date) : ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn bsm bo" onclick="replyToEmail('${provider}','${fromEsc}','${subjectEsc}')"><i class="ti ti-corner-up-left" style="font-size:11px;margin-right:3px"></i> Reply</button>
          <button class="btn bsm bo" onclick="closeReadPane()"><i class="ti ti-x" style="font-size:11px"></i></button>
        </div>
      </div>
      <div style="font-size:12px;line-height:1.6;color:var(--text);white-space:pre-wrap;max-height:400px;overflow-y:auto;padding:10px;background:var(--bg);border-radius:var(--radius-sm);border:1px solid var(--border)">${escHtml(msg.body || '(no content)')}</div>
      ${attHtml}
    </div>`;
  } catch {
    readEl.innerHTML = '<div style="color:#f85149;font-size:12px;padding:20px">Failed to load message</div>';
  }
}

function closeReadPane() {
  const listEl = document.getElementById('emailMessageList');
  const readEl = document.getElementById('emailReadPane');
  if (readEl) readEl.style.display = 'none';
  if (listEl) listEl.style.display = 'block';
}

function replyToEmail(provider, from, subject) {
  const replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
  const replyTo = from.match(/<(.+?)>/)?.[1] || from;
  openComposeModal(provider, replyTo, replySubject);
}

function openComposeModal(provider, to, subject) {
  const labels = { gmail: 'Gmail', outlook: 'Outlook', zoho_mail: 'Zoho Mail' };
  const acct = _emailAccounts?.[provider];
  window._composeAttachments = [];

  let fromSelect = '';
  if (provider === 'zoho_mail' && acct?.aliases?.length > 1) {
    const opts = acct.aliases.map(a => `<option value="${escHtml(a.address)}" ${a.isDefault ? 'selected' : ''}>${escHtml(a.name)} &lt;${escHtml(a.address)}&gt;</option>`).join('');
    fromSelect = `<div class="flbl">From</div><select id="compFrom" style="width:100%;margin-bottom:6px">${opts}</select>`;
  }

  const el = document.getElementById('socialPostContent');
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;margin:0">Compose — ${labels[provider]}</h3>
      <span style="cursor:pointer;font-size:18px;color:var(--text3)" onclick="closeComposeModal()">&times;</span>
    </div>
    ${fromSelect}
    <div class="flbl">To</div>
    <input type="email" id="compTo" style="width:100%;margin-bottom:6px" placeholder="recipient@example.com" value="${escHtml(to || '')}">
    <div class="flbl">Subject</div>
    <input type="text" id="compSubject" style="width:100%;margin-bottom:6px" placeholder="Subject" value="${escHtml(subject || '')}">
    <div class="flbl">Message</div>
    <textarea id="compBody" style="width:100%;height:160px;resize:vertical" placeholder="Write your message..."></textarea>
    <div id="compAttachments" style="margin-top:6px"></div>
    <div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn" id="compSendBtn" onclick="sendEmailFromCompose('${provider}')"><i class="ti ti-send" style="font-size:12px;margin-right:4px"></i> Send</button>
      <button class="btn bo" onclick="addComposeAttachment()"><i class="ti ti-paperclip" style="font-size:12px;margin-right:4px"></i> Attach</button>
      <button class="btn bo" onclick="closeComposeModal()">Cancel</button>
    </div>
    <div id="compErr" style="margin-top:8px;font-size:11px;color:#f85149"></div>`;

  document.getElementById('socialPostModal').classList.add('show');
  document.getElementById(to ? 'compBody' : 'compTo').focus();
}

function closeComposeModal() {
  document.getElementById('socialPostModal').classList.remove('show');
  window._composeAttachments = [];
}

function addComposeAttachment() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = () => {
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        window._composeAttachments.push({ name: file.name, mimeType: file.type || 'application/octet-stream', base64 });
        renderComposeAttachments();
      };
      reader.readAsDataURL(file);
    });
  };
  input.click();
}

function removeComposeAttachment(idx) {
  window._composeAttachments.splice(idx, 1);
  renderComposeAttachments();
}

function renderComposeAttachments() {
  const el = document.getElementById('compAttachments');
  if (!el) return;
  if (!window._composeAttachments.length) { el.innerHTML = ''; return; }
  el.innerHTML = window._composeAttachments.map((a, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;font-size:11px;margin:2px">
      <i class="ti ti-paperclip" style="font-size:11px"></i> ${escHtml(a.name)}
      <i class="ti ti-x" style="font-size:10px;cursor:pointer;color:var(--text3)" onclick="removeComposeAttachment(${i})"></i>
    </span>`
  ).join('');
}

async function sendEmailFromCompose(provider) {
  const to = document.getElementById('compTo').value.trim();
  const subject = document.getElementById('compSubject').value.trim();
  const body = document.getElementById('compBody').value;
  const from = document.getElementById('compFrom')?.value || null;
  const err = document.getElementById('compErr');

  if (!to) { err.textContent = 'Recipient is required'; return; }
  if (!subject) { err.textContent = 'Subject is required'; return; }
  err.textContent = '';

  const btn = document.getElementById('compSendBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Sending...';

  try {
    const payload = { to, subject, body };
    if (from) payload.from = from;
    if (window._composeAttachments.length) payload.attachments = window._composeAttachments;

    const data = await apiPost(`/email/send/${provider}`, payload);
    if (data.error) {
      err.textContent = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    } else {
      ntf('Email sent!');
      closeComposeModal();
      if (_activeProvider === provider) loadInbox(provider, _activeFolder);
    }
  } catch {
    err.textContent = 'Failed to send email';
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-send" style="font-size:12px;margin-right:4px"></i> Send';
}

async function downloadEmailAttachment(provider, messageId, attachmentId, filename, folderId) {
  ntf('Downloading ' + filename + '...');
  try {
    let url = `/email/attachment/${provider}/${messageId}/${attachmentId}`;
    if (folderId) url += `?folderId=${folderId}`;
    const data = await apiGet(url);
    if (data.error) { ntf('Download failed: ' + data.error); return; }

    const b64 = data.data;
    const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const blob = new Blob([bytes], { type: data.contentType || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = data.name || filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    ntf('Downloaded ' + filename);
  } catch {
    ntf('Download failed');
  }
}
