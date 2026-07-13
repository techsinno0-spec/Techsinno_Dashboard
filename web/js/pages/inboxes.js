let _emailAccounts = null;
let _activeProvider = null;
let _activeFolder = 'inbox';
let _activeZohoRecipient = 'all';
let _currentMessages = [];

const ZOHO_RECIPIENT_FOLDERS = [
  { key: 'all', label: 'All', address: '', icon: 'ti-mailbox' },
  { key: 'frank', label: 'Frank', address: 'frank@techsinno.com', icon: 'ti-user' },
  { key: 'info', label: 'Info', address: 'info@techsinno.com', icon: 'ti-info-circle' },
  { key: 'sales', label: 'Sales', address: 'sales@techsinno.com', icon: 'ti-cash' }
];

function zohoRecipientAddress(key) {
  return ZOHO_RECIPIENT_FOLDERS.find(f => f.key === key)?.address || '';
}

function zohoRecipientFolderForMessage(toText) {
  const normalized = String(toText || '').toLowerCase();
  return ZOHO_RECIPIENT_FOLDERS.find(f => f.address && normalized.includes(f.address));
}

function renderZohoRecipientTabs(activeKey) {
  return `<div class="wtabs" style="margin:0 0 12px">
    ${ZOHO_RECIPIENT_FOLDERS.map(f => `
      <button class="wtab ${activeKey === f.key ? 'active' : ''}" onclick="loadInbox('zoho_mail','inbox','${f.key}')">
        <i class="ti ${f.icon}" style="font-size:12px;margin-right:4px"></i>${f.address || f.label}
      </button>
    `).join('')}
  </div>`;
}

function jsArg(value) {
  return JSON.stringify(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function linkifyPlainEmailText(text) {
  return escHtml(text || '')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--brand-mid)">$1</a>')
    .replace(/\n/g, '<br>');
}

function emailFrameSrcDoc(html) {
  const css = `<base target="_blank"><style>
    html{margin:0;padding:0;background:#fff;color:#111;}
    body{margin:0;padding:14px;overflow-wrap:anywhere;font-family:Arial,Helvetica,sans-serif;}
    img{max-width:100%;height:auto;}
    video{max-width:100%;height:auto;}
    table{max-width:100%;border-collapse:collapse;}
    a{color:#0b6f9f;}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;}
  </style>`;
  const source = html || '';
  if (/<html[\s>]/i.test(source)) {
    if (/<head[\s>]/i.test(source)) return source.replace(/<head([^>]*)>/i, `<head$1>${css}`);
    return source.replace(/<html([^>]*)>/i, `<html$1><head>${css}</head>`);
  }
  return `<!doctype html><html><head>${css}</head><body>${source}</body></html>`;
}

function renderFormattedEmail(msg) {
  return `<iframe class="email-html-frame"
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    onload="resizeEmailFrame(this)"
    srcdoc="${escHtml(emailFrameSrcDoc(msg.bodyHtml))}"></iframe>`;
}

function renderEmailBody(msg, provider) {
  const readable = msg.body && msg.body !== '(no content)'
    ? linkifyPlainEmailText(msg.body)
    : '<span style="color:var(--text3)">(no readable text found)</span>';

  if (msg.bodyHtml && ['gmail', 'outlook'].includes(provider)) {
    return `${renderFormattedEmail(msg)}
      <details class="email-original-layout">
        <summary><i class="ti ti-align-left" style="font-size:12px"></i> Show readable text fallback</summary>
        <div class="email-plain-body" style="margin-top:8px">${readable}</div>
      </details>`;
  }

  const original = msg.bodyHtml ? `<details class="email-original-layout">
    <summary><i class="ti ti-layout" style="font-size:12px"></i> Show original email layout</summary>
    ${renderFormattedEmail(msg)}
  </details>` : '';

  return `<div class="email-plain-body">${readable}</div>${original}`;
}

function resizeEmailFrame(frame) {
  try {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    const h = Math.max(320, (doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 700) + 30);
    frame.style.height = `${h}px`;
  } catch {
    frame.style.height = '760px';
  }
}

function fileSizeLabel(size) {
  const n = Number(size || 0);
  if (!n) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function attachmentKind(att) {
  const mime = String(att.mimeType || '').toLowerCase();
  const name = String(att.name || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi)$/i.test(name)) return 'video';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (/\.(docx?|xlsx?|pptx?|csv|txt|zip|rar)$/i.test(name)) return 'document';
  return 'file';
}

function attachmentIcon(kind) {
  return {
    image: 'ti-photo',
    video: 'ti-video',
    pdf: 'ti-file-type-pdf',
    document: 'ti-file-text',
    file: 'ti-paperclip'
  }[kind] || 'ti-paperclip';
}

function renderEmailAttachments(provider, messageId, attachments = []) {
  const files = (attachments || []).filter(a => a?.id);
  if (!files.length) return '';

  const items = files.map((a, i) => {
    const kind = attachmentKind(a);
    const previewId = `att-preview-${String(messageId).replace(/[^a-z0-9]/gi, '')}-${i}`;
    const canPreview = ['image', 'video', 'pdf'].includes(kind);
    const size = fileSizeLabel(a.size);
    const args = [
      jsArg(provider),
      jsArg(messageId),
      jsArg(a.id),
      jsArg(a.name || 'attachment'),
      jsArg(a.folderId || ''),
      jsArg(a.mimeType || ''),
      jsArg(a.accountId || ''),
      jsArg(previewId)
    ].join(',');

    return `<div class="email-attachment-card">
      <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
        <i class="ti ${attachmentIcon(kind)}" style="font-size:18px;color:var(--brand-mid);flex-shrink:0"></i>
        <div style="min-width:0">
          <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(a.name || 'attachment')}</div>
          <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${escHtml(a.mimeType || kind)}${size ? ' · ' + size : ''}</div>
        </div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        ${canPreview ? `<button class="btn bsm bo" onclick="previewEmailAttachment(${args})"><i class="ti ti-eye" style="font-size:11px"></i> Preview</button>` : ''}
        <button class="btn bsm bo" onclick="downloadEmailAttachment(${args})"><i class="ti ti-download" style="font-size:11px"></i> Download</button>
      </div>
      <div id="${previewId}" class="email-attachment-preview"></div>
    </div>`;
  }).join('');

  return `<div class="email-attachments">
    <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:8px">ATTACHMENTS (${files.length})</div>
    ${items}
  </div>`;
}

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

    if (_activeProvider) {
      const p = providers.find(x => x.key === _activeProvider) || providers[0];
      const acct = _emailAccounts[p.key];
      const connected = !!acct?.connected;
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--text)">
              <i class="ti ${p.icon}" style="color:${p.color}"></i> ${escHtml(acct?.email || (p.key === 'zoho_mail' ? 'frank@techsinno.com' : p.label))}
              ${p.key === 'zoho_mail' ? '<span class="tag t-a">PRIMARY</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">${p.label} — read, reply, compose${p.key === 'zoho_mail' ? ' · AI scan' : ''}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn bsm bo" onclick="render_inboxes()"><i class="ti ti-refresh" style="font-size:11px"></i> Refresh</button>
            ${connected ? `<button class="btn bsm" onclick="openComposeModal('${p.key}')"><i class="ti ti-send" style="font-size:11px"></i> Compose</button>` : ''}
            ${connected ? `<button class="btn bsm bdng" onclick="disconnectEmail('${p.key}')"><i class="ti ti-plug-off" style="font-size:11px"></i> Disconnect</button>` : ''}
            <button class="btn bsm bo" onclick="navigateTo('settings')"><i class="ti ti-settings" style="font-size:11px"></i></button>
          </div>
        </div>
        <div id="emailInboxArea"></div>`;
      if (connected) {
        openProviderInbox(p.key);
      } else {
        document.getElementById('emailInboxArea').innerHTML = `<div class="card" style="padding:16px;color:var(--text2);font-size:12px">
          Not connected — go to <a href="#" onclick="navigateTo('settings');return false" style="color:var(--brand-mid)">Settings</a> to connect ${escHtml(p.label)} first.
        </div>`;
      }
      return;
    }

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
          : `<button class="btn bsm" onclick="navigateTo('settings')">Configure in Settings</button>`}
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
    if (!popup && typeof openExternalUrl === 'function') {
      ntf('Popup blocked. Opening in browser.');
      await openExternalUrl(data.url);
    }
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
  if (provider === 'zoho_mail') _activeZohoRecipient = 'all';
  await loadInbox(provider, 'inbox', provider === 'zoho_mail' ? _activeZohoRecipient : 'all');
}

async function loadInbox(provider, folder, recipientKey) {
  _activeFolder = folder;
  const activeRecipient = provider === 'zoho_mail' && folder === 'inbox'
    ? (recipientKey || _activeZohoRecipient || 'all')
    : 'all';
  if (provider === 'zoho_mail' && folder === 'inbox') _activeZohoRecipient = activeRecipient;

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
    ${provider === 'zoho_mail' && folder === 'inbox' ? renderZohoRecipientTabs(activeRecipient) : ''}
    <div id="emailMessageList"><div class="spin"></div></div>
    <div id="emailReadPane" style="display:none"></div>`;

  try {
    let path = `/email/inbox/${provider}?folder=${folder}&_=${Date.now()}`;
    const recipientAddress = provider === 'zoho_mail' && folder === 'inbox' ? zohoRecipientAddress(activeRecipient) : '';
    if (recipientAddress) path += `&recipient=${encodeURIComponent(recipientAddress)}`;
    const data = await apiGet(path);
    if (data.error) { document.getElementById('emailMessageList').innerHTML = `<div class="empty-state" style="padding:20px"><i class="ti ti-alert-circle"></i><div style="font-size:12px;color:#f85149">${escHtml(data.error)}</div></div>`; return; }

    _currentMessages = data.messages || [];
    const unread = data.unreadCount || 0;
    const scanNote = provider === 'zoho_mail' && data.scannedCount
      ? `<div style="font-size:10px;color:var(--text3);padding:6px 12px;border-bottom:1px solid var(--border);font-family:'DM Mono',monospace">
          Showing ${_currentMessages.length} message${_currentMessages.length === 1 ? '' : 's'} from latest ${data.scannedCount} Zoho message${data.scannedCount === 1 ? '' : 's'} scanned${recipientAddress ? ` for ${escHtml(recipientAddress)}` : ''}${data.detailScannedCount ? `; checked ${data.detailScannedCount} message detail${data.detailScannedCount === 1 ? '' : 's'}` : ''}.
          ${data.warning ? `<div style="margin-top:4px;color:#f0b429;white-space:normal;line-height:1.45">${escHtml(data.warning)}</div>` : ''}
        </div>`
      : '';

    if (_currentMessages.length === 0) {
      const emptyText = recipientAddress ? `No messages sent to ${recipientAddress}` : 'No messages';
      document.getElementById('emailMessageList').innerHTML = `${scanNote}<div class="empty-state" style="padding:30px"><i class="ti ti-inbox-off" style="font-size:24px"></i><div style="font-size:12px;color:var(--text3);margin-top:6px">${escHtml(emptyText)}</div></div>`;
      return;
    }

    let rows = '';
    _currentMessages.forEach((m, i) => {
      const sender = folder === 'sent' ? (m.to || 'Unknown') : (m.from || 'Unknown');
      const senderShort = sender.replace(/<.*>/, '').trim() || sender;
      const dateStr = m.date ? timeAgo(m.date) : '';
      const unreadStyle = m.unread ? 'font-weight:600;color:var(--text)' : 'color:var(--text2)';
      const zohoFolder = provider === 'zoho_mail' && folder === 'inbox' ? zohoRecipientFolderForMessage(m.to) : null;
      const recipientBadge = zohoFolder
        ? `<span class="tag t-a" style="font-size:8px;margin-left:6px;flex-shrink:0">${escHtml(zohoFolder.address)}</span>`
        : '';

      rows += `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''" onclick="readEmailMessage('${provider}','${m.id}',${i})">
        ${m.unread ? '<div style="width:6px;height:6px;border-radius:50%;background:var(--brand-mid);flex-shrink:0"></div>' : '<div style="width:6px;flex-shrink:0"></div>'}
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
            <div style="font-size:12px;${unreadStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${escHtml(senderShort)}</div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;flex-shrink:0">${dateStr}</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;margin-top:2px;min-width:0">
            <span style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(m.subject)}</span>
            ${recipientBadge}
          </div>
        </div>
      </div>`;
    });

    document.getElementById('emailMessageList').innerHTML = `
      ${scanNote}
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
    let messageUrl = `/email/message/${provider}/${messageId}`;
    const source = _currentMessages[idx] || {};
    if (provider === 'zoho_mail') {
      const params = new URLSearchParams();
      if (source.folderId) params.set('folderId', source.folderId);
      if (source.accountId) params.set('accountId', source.accountId);
      const qs = params.toString();
      if (qs) messageUrl += `?${qs}`;
    }
    const msg = await apiGet(messageUrl);
    if (msg.error) {
      readEl.innerHTML = `<div style="color:#f85149;font-size:12px;padding:20px">${escHtml(msg.error)}</div>`;
      return;
    }

    const attHtml = renderEmailAttachments(provider, messageId, msg.attachments || []);

    readEl.innerHTML = `<div class="card" style="max-width:760px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div style="min-width:0;flex:1">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${escHtml(msg.subject)}</div>
          <div style="font-size:11px;color:var(--text2)">From: ${escHtml(msg.from)}</div>
          ${msg.to ? `<div style="font-size:11px;color:var(--text3)">To: ${escHtml(msg.to)}</div>` : ''}
          <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px">${msg.date ? formatDateTime(msg.date) : ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn bsm bo" onclick="replyToEmail(${jsArg(provider)},${jsArg(msg.from || '')},${jsArg(msg.subject || '')})"><i class="ti ti-corner-up-left" style="font-size:11px;margin-right:3px"></i> Reply</button>
          <button class="btn bsm bo" onclick="closeReadPane()"><i class="ti ti-x" style="font-size:11px"></i></button>
        </div>
      </div>
      ${renderEmailBody(msg, provider)}
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
      if (_activeProvider === provider) loadInbox(provider, _activeFolder, _activeZohoRecipient);
    }
  } catch {
    err.textContent = 'Failed to send email';
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-send" style="font-size:12px;margin-right:4px"></i> Send';
}

async function loadEmailAttachment(provider, messageId, attachmentId, filename, folderId, mimeType, accountId) {
  let url = `/email/attachment/${encodeURIComponent(provider)}/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}`;
  const params = new URLSearchParams();
  if (folderId) params.set('folderId', folderId);
  if (accountId) params.set('accountId', accountId);
  const qs = params.toString();
  if (qs) url += `?${qs}`;
  const data = await apiGet(url);
  if (data.error) throw new Error(data.error);

  const b64 = data.data || '';
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const contentType = data.contentType || mimeType || 'application/octet-stream';
  const blob = new Blob([bytes], { type: contentType });
  return {
    blob,
    url: URL.createObjectURL(blob),
    name: data.name || filename || 'attachment',
    contentType
  };
}

async function previewEmailAttachment(provider, messageId, attachmentId, filename, folderId, mimeType, accountId, previewId) {
  const box = document.getElementById(previewId);
  if (!box) return;
  box.innerHTML = '<div class="spin" style="width:14px;height:14px;border-width:2px;margin:8px"></div>';

  try {
    const file = await loadEmailAttachment(provider, messageId, attachmentId, filename, folderId, mimeType, accountId);
    const kind = attachmentKind({ name: file.name, mimeType: file.contentType });
    const safeName = escHtml(file.name);

    if (kind === 'image') {
      box.innerHTML = `<div class="email-preview-toolbar">${safeName}</div><img src="${file.url}" alt="${safeName}" class="email-preview-image">`;
      return;
    }

    if (kind === 'video') {
      box.innerHTML = `<div class="email-preview-toolbar">${safeName}</div><video src="${file.url}" controls class="email-preview-video"></video>`;
      return;
    }

    if (kind === 'pdf') {
      box.innerHTML = `<div class="email-preview-toolbar">${safeName}</div><iframe src="${file.url}" class="email-preview-pdf"></iframe>`;
      return;
    }

    box.innerHTML = `<div style="font-size:11px;color:var(--text2);padding:8px">Preview is not available for this file type. Please download it.</div>`;
  } catch (err) {
    box.innerHTML = `<div style="font-size:11px;color:#f85149;padding:8px">Preview failed: ${escHtml(err.message || 'unknown error')}</div>`;
  }
}

async function downloadEmailAttachment(provider, messageId, attachmentId, filename, folderId, mimeType, accountId) {
  ntf('Downloading ' + filename + '...');
  try {
    const file = await loadEmailAttachment(provider, messageId, attachmentId, filename, folderId, mimeType, accountId);
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(file.url), 1000);
    ntf('Downloaded ' + file.name);
  } catch {
    ntf('Download failed');
  }
}
