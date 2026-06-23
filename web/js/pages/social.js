let _socialAccounts = null;
let _socialTab = 'accounts';

function render_social() {
  if (!isManager()) return;
  const el = document.getElementById('page-social');
  el.innerHTML = '<div class="spin"></div>';
  loadSocialAccounts();
}

async function loadSocialAccounts() {
  const el = document.getElementById('page-social');
  try {
    const data = await apiGet('/social/accounts');
    _socialAccounts = data.accounts;
    const pages = data.availablePages || [];

    const liStatus = _socialAccounts.linkedin;
    const fbStatus = _socialAccounts.facebook;
    const igStatus = _socialAccounts.instagram;
    const connectedCount = [liStatus, fbStatus, igStatus].filter(a => a && a.connected).length;

    let pageSelect = '';
    if (pages.length > 1) {
      pageSelect = `<div style="margin-top:12px">
        <div class="flbl">Active Facebook Page</div>
        <select id="socialPageSelect" onchange="selectSocialPage(this.value)" style="min-width:200px">
          ${pages.map(p => `<option value="${p.id}" ${p.selected ? 'selected' : ''}>${p.name}${p.hasInstagram ? ' (+ Instagram)' : ''}</option>`).join('')}
        </select>
      </div>`;
    }

    const hasFb = fbStatus && fbStatus.connected;

    el.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:10px">
        <button class="btn bsm ${_socialTab === 'accounts' ? '' : 'bo'}" onclick="switchSocialTab('accounts')"><i class="ti ti-plug" style="font-size:11px;margin-right:3px"></i> Accounts</button>
        <button class="btn bsm ${_socialTab === 'drafts' ? '' : 'bo'}" onclick="switchSocialTab('drafts')"><i class="ti ti-robot" style="font-size:11px;margin-right:3px"></i> AI Drafts</button>
        <button class="btn bsm ${_socialTab === 'messages' ? '' : 'bo'}" onclick="switchSocialTab('messages')" ${hasFb ? '' : 'disabled title="Connect Facebook first"'}><i class="ti ti-messages" style="font-size:11px;margin-right:3px"></i> Messages</button>
        <div style="flex:1"></div>
        <button class="btn" onclick="openSocialPostModal()" ${connectedCount === 0 ? 'disabled title="Connect at least one platform first"' : ''}>
          <i class="ti ti-pencil-plus" style="font-size:13px;margin-right:4px"></i> New Post
        </button>
      </div>

      <div id="socialTabAccounts" style="display:${_socialTab === 'accounts' ? 'block' : 'none'}">
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px">${connectedCount} of 3 platforms connected</div>
        <div class="g3">
          <div class="card">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <i class="ti ti-brand-linkedin" style="font-size:22px;color:#0A66C2"></i>
              <div style="flex:1">
                <div style="font-weight:500;font-size:13px">LinkedIn</div>
                <div style="font-size:10px;color:${liStatus ? '#3fb950' : 'var(--text3)'};font-family:'DM Mono',monospace">${liStatus ? 'CONNECTED' : 'NOT CONNECTED'}</div>
              </div>
            </div>
            ${liStatus ? `<div style="font-size:11px;color:var(--text2);margin-bottom:10px">Posting as <strong>${liStatus.displayName}</strong></div>
              <button class="btn bsm bdng" onclick="disconnectSocial('linkedin')">Disconnect</button>`
             : `<button class="btn bsm" onclick="connectSocial('linkedin')">Connect LinkedIn</button>`}
          </div>

          <div class="card">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <i class="ti ti-brand-facebook" style="font-size:22px;color:#1877F2"></i>
              <div style="flex:1">
                <div style="font-weight:500;font-size:13px">Facebook</div>
                <div style="font-size:10px;color:${fbStatus ? '#3fb950' : 'var(--text3)'};font-family:'DM Mono',monospace">${fbStatus ? 'CONNECTED' : 'NOT CONNECTED'}</div>
              </div>
            </div>
            ${fbStatus ? `<div style="font-size:11px;color:var(--text2);margin-bottom:10px">Page: <strong>${fbStatus.pageName}</strong></div>
              <button class="btn bsm bdng" onclick="disconnectSocial('meta')">Disconnect</button>`
             : `<button class="btn bsm" onclick="connectSocial('meta')">Connect Facebook</button>`}
          </div>

          <div class="card">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <i class="ti ti-brand-instagram" style="font-size:22px;color:#E4405F"></i>
              <div style="flex:1">
                <div style="font-weight:500;font-size:13px">Instagram</div>
                <div style="font-size:10px;color:${igStatus ? '#3fb950' : 'var(--text3)'};font-family:'DM Mono',monospace">${igStatus ? 'CONNECTED' : 'NOT CONNECTED'}</div>
              </div>
            </div>
            ${igStatus ? `<div style="font-size:11px;color:var(--text2);margin-bottom:10px">Linked to: <strong>${igStatus.linkedToPage}</strong></div>
              <div style="font-size:10px;color:var(--text3);margin-bottom:6px">Managed via Facebook connection</div>`
             : `<div style="font-size:10px;color:var(--text3)">Connect Facebook first — Instagram is linked to your Facebook Page's business account</div>`}
          </div>
        </div>
        ${pageSelect}
        <div id="socialScheduledSection"></div>
      </div>

      <div id="socialTabDrafts" style="display:${_socialTab === 'drafts' ? 'block' : 'none'}"></div>
      <div id="socialTabMessages" style="display:${_socialTab === 'messages' ? 'block' : 'none'}"></div>`;

    loadScheduledPosts();
    if (_socialTab === 'drafts') loadAIDrafts();
    if (_socialTab === 'messages') loadSocialMessages();
  } catch {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load social accounts</div>';
  }
}

function switchSocialTab(tab) {
  _socialTab = tab;
  ['accounts', 'drafts', 'messages'].forEach(t => {
    const el = document.getElementById('socialTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-social > div:first-child .btn.bsm').forEach(b => {
    const isActive = b.textContent.trim().toLowerCase().includes(tab === 'accounts' ? 'account' : tab === 'drafts' ? 'draft' : 'message');
    b.className = isActive ? 'btn bsm' : 'btn bsm bo';
  });
  if (tab === 'drafts') loadAIDrafts();
  if (tab === 'messages') loadSocialMessages();
}

// ─── AI DRAFTS ───────────────────────────────────────────────────────

async function loadAIDrafts() {
  const el = document.getElementById('socialTabDrafts');
  if (!el) return;

  el.innerHTML = `<div class="empty-state" style="padding:30px">
    <i class="ti ti-robot" style="font-size:24px"></i>
    <div style="font-size:13px;font-weight:500;margin:8px 0 4px">AI Post Drafts</div>
    <div style="font-size:11px;color:var(--text3);max-width:340px;margin-bottom:14px">Use the AI Agent to generate social media posts. You can also draft a post directly using the composer.</div>
    <div style="display:flex;gap:6px;justify-content:center">
      <button class="btn bsm" onclick="navigateTo('agent')"><i class="ti ti-robot" style="font-size:11px;margin-right:3px"></i> Open AI Agent</button>
      <button class="btn bsm bo" onclick="openSocialPostModal()"><i class="ti ti-pencil-plus" style="font-size:11px;margin-right:3px"></i> New Post</button>
    </div>
  </div>`;
}

// ─── SOCIAL MESSAGES ─────────────────────────────────────────────────

let _socialConversations = [];
let _activeConversation = null;

async function loadSocialMessages() {
  const el = document.getElementById('socialTabMessages');
  if (!el) return;
  el.innerHTML = '<div class="spin"></div>';

  try {
    const data = await apiGet('/social/conversations');
    _socialConversations = data.conversations || [];

    if (_socialConversations.length === 0) {
      el.innerHTML = `<div class="empty-state" style="padding:30px">
        <i class="ti ti-messages" style="font-size:24px"></i>
        <div style="font-size:13px;font-weight:500;margin:8px 0 4px">No Messages</div>
        <div style="font-size:11px;color:var(--text3);max-width:320px">Customer messages from Facebook and Instagram will appear here. Make sure your Facebook page has messaging enabled.</div>
      </div>`;
      return;
    }

    let convList = _socialConversations.map(c => {
      const platIcon = c.platform === 'instagram'
        ? '<i class="ti ti-brand-instagram" style="font-size:12px;color:#E4405F"></i>'
        : '<i class="ti ti-brand-facebook" style="font-size:12px;color:#1877F2"></i>';
      const preview = c.lastMessage?.length > 50 ? c.lastMessage.substring(0, 50) + '...' : (c.lastMessage || '');
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--card-hover)'" onmouseout="this.style.background=''" onclick="openSocialConversation('${c.id}','${c.platform}','${c.participantId || ''}')">
        ${platIcon}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.participantName)}</div>
          <div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(preview)}</div>
        </div>
        <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;flex-shrink:0">${c.updatedAt ? timeAgo(c.updatedAt) : ''}</div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;gap:12px;max-height:500px">
        <div style="width:280px;flex-shrink:0">
          <div class="fl" style="margin-bottom:6px">CONVERSATIONS (${_socialConversations.length})</div>
          <div class="card" style="padding:0;overflow-y:auto;max-height:460px">${convList}</div>
        </div>
        <div style="flex:1" id="socialChatPane">
          <div class="empty-state" style="padding:40px"><i class="ti ti-message-circle" style="font-size:24px"></i><div style="font-size:12px;color:var(--text3);margin-top:6px">Select a conversation</div></div>
        </div>
      </div>`;
  } catch {
    el.innerHTML = '<div class="empty-state" style="padding:20px"><div style="font-size:12px;color:#f85149">Failed to load messages</div></div>';
  }
}

async function openSocialConversation(conversationId, platform, participantId) {
  _activeConversation = { id: conversationId, platform, participantId };
  const pane = document.getElementById('socialChatPane');
  if (!pane) return;
  pane.innerHTML = '<div class="spin"></div>';

  try {
    const data = await apiGet(`/social/messages/${conversationId}?platform=${platform}`);
    const messages = data.messages || [];

    let bubbles = messages.map(m => {
      const isPage = m.isPage;
      return `<div style="display:flex;${isPage ? 'justify-content:flex-end' : ''};margin-bottom:8px">
        <div style="max-width:70%;padding:8px 12px;border-radius:${isPage ? '10px 10px 2px 10px' : '10px 10px 10px 2px'};background:${isPage ? 'var(--brand)' : 'var(--bg3)'};color:${isPage ? '#fff' : 'var(--text)'};font-size:12px;white-space:pre-wrap">
          ${!isPage ? `<div style="font-size:10px;font-weight:600;margin-bottom:3px;color:var(--brand-mid)">${escHtml(m.from)}</div>` : ''}
          ${escHtml(m.text)}
          <div style="font-size:9px;color:${isPage ? 'rgba(255,255,255,0.6)' : 'var(--text3)'};margin-top:4px;text-align:right">${m.createdAt ? timeAgo(m.createdAt) : ''}</div>
        </div>
      </div>`;
    }).join('');

    pane.innerHTML = `<div class="card" style="display:flex;flex-direction:column;height:460px">
      <div style="flex:1;overflow-y:auto;padding:8px" id="socialMsgArea">${bubbles || '<div style="text-align:center;color:var(--text3);padding:20px;font-size:12px">No messages yet</div>'}</div>
      <div style="display:flex;gap:6px;padding:8px;border-top:1px solid var(--border)">
        <input type="text" id="socialReplyInput" style="flex:1" placeholder="Type a reply..." onkeydown="if(event.key==='Enter'){event.preventDefault();sendSocialReply()}">
        <button class="btn bsm" onclick="sendSocialReply()"><i class="ti ti-send" style="font-size:12px"></i></button>
      </div>
    </div>`;

    const msgArea = document.getElementById('socialMsgArea');
    if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
  } catch {
    pane.innerHTML = '<div style="color:#f85149;font-size:12px;padding:20px">Failed to load messages</div>';
  }
}

async function sendSocialReply() {
  if (!_activeConversation) return;
  const input = document.getElementById('socialReplyInput');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';

  try {
    await apiPost(`/social/messages/${_activeConversation.id}`, {
      text,
      platform: _activeConversation.platform,
      recipientId: _activeConversation.participantId
    });
    openSocialConversation(_activeConversation.id, _activeConversation.platform, _activeConversation.participantId);
  } catch {
    ntf('Failed to send reply');
  }
}

// ─── EXISTING FUNCTIONS ──────────────────────────────────────────────

async function connectSocial(platform) {
  try {
    const data = await apiGet('/social/connect/' + platform);
    if (!data || !data.url) { ntf('Failed to get authorization URL'); return; }
    const popup = window.open(data.url, 'social_auth', 'width=600,height=700,scrollbars=yes');
    window.addEventListener('message', function handler(e) {
      if (e.data && e.data.type === 'social-auth') {
        window.removeEventListener('message', handler);
        if (e.data.success) {
          ntf(e.data.message || platform + ' connected!');
          loadSocialAccounts();
        } else {
          ntf(e.data.message || 'Connection failed');
        }
      }
    });
  } catch { ntf('Failed to initiate connection'); }
}

async function disconnectSocial(platform) {
  if (!confirm('Disconnect this platform?')) return;
  try {
    await apiCall('POST', '/social/disconnect/' + platform);
    ntf('Disconnected');
    loadSocialAccounts();
  } catch { ntf('Failed to disconnect'); }
}

async function selectSocialPage(pageId) {
  try {
    const data = await apiCall('PUT', '/social/pages/select', { pageId });
    if (data && data.success) {
      ntf('Page updated: ' + data.pageName);
      loadSocialAccounts();
    }
  } catch { ntf('Failed to update page'); }
}

function openSocialPostModal(prefillText) {
  const accts = _socialAccounts || {};
  const li = accts.linkedin && accts.linkedin.connected;
  const fb = accts.facebook && accts.facebook.connected;
  const ig = accts.instagram && accts.instagram.connected;

  if (!li && !fb && !ig) { ntf('No platforms connected'); return; }

  const el = document.getElementById('socialPostContent');
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;margin:0">Create Post</h3>
      <span style="cursor:pointer;font-size:18px;color:var(--text3)" onclick="closeSocialPostModal()">&times;</span>
    </div>
    <textarea id="spText" style="width:100%;height:120px;resize:vertical" placeholder="What do you want to share?">${escHtml(prefillText || '')}</textarea>
    <div class="flbl">Image URL (optional${ig ? ', required for Instagram' : ''})</div>
    <input type="url" id="spImage" style="width:100%" placeholder="https://example.com/image.jpg">
    <div class="flbl">Post to</div>
    <div style="display:flex;gap:12px;margin-top:4px;margin-bottom:14px">
      ${li ? `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
        <input type="checkbox" id="spLinkedIn" checked> <i class="ti ti-brand-linkedin" style="color:#0A66C2"></i> LinkedIn
      </label>` : ''}
      ${fb ? `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
        <input type="checkbox" id="spFacebook" checked> <i class="ti ti-brand-facebook" style="color:#1877F2"></i> Facebook
      </label>` : ''}
      ${ig ? `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
        <input type="checkbox" id="spInstagram" checked> <i class="ti ti-brand-instagram" style="color:#E4405F"></i> Instagram
      </label>` : ''}
    </div>
    <div id="spCharCount" style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:10px">0 characters</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
        <input type="checkbox" id="spScheduleToggle" onchange="document.getElementById('spScheduleDate').style.display=this.checked?'block':'none'"> Schedule for later
      </label>
      <input type="datetime-local" id="spScheduleDate" style="display:none;flex:1">
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn" id="spSubmit" onclick="submitSocialPost()"><i class="ti ti-send" style="font-size:12px;margin-right:4px"></i> Post Now</button>
      <button class="btn bo" onclick="closeSocialPostModal()">Cancel</button>
    </div>
    <div id="spResult" style="margin-top:10px"></div>`;

  document.getElementById('spText').addEventListener('input', function() {
    document.getElementById('spCharCount').textContent = this.value.length + ' characters';
  });

  document.getElementById('socialPostModal').classList.add('show');
  document.getElementById('spText').focus();
  if (prefillText) document.getElementById('spCharCount').textContent = prefillText.length + ' characters';
}

function closeSocialPostModal() {
  document.getElementById('socialPostModal').classList.remove('show');
}

async function submitSocialPost() {
  const text = document.getElementById('spText').value.trim();
  if (!text) { ntf('Post text is required'); return; }

  const imageUrl = document.getElementById('spImage').value.trim() || null;
  const platforms = [];
  if (document.getElementById('spLinkedIn')?.checked) platforms.push('linkedin');
  if (document.getElementById('spFacebook')?.checked) platforms.push('facebook');
  if (document.getElementById('spInstagram')?.checked) platforms.push('instagram');

  if (platforms.length === 0) { ntf('Select at least one platform'); return; }
  if (platforms.includes('instagram') && !imageUrl) { ntf('Instagram requires an image URL'); return; }

  const isScheduled = document.getElementById('spScheduleToggle')?.checked;
  const scheduleDate = document.getElementById('spScheduleDate')?.value;
  if (isScheduled && !scheduleDate) { ntf('Select a date and time for scheduling'); return; }

  const btn = document.getElementById('spSubmit');
  btn.disabled = true;

  if (isScheduled) {
    btn.innerHTML = '<div class="spin" style="width:12px;height:12px"></div> Scheduling...';
    try {
      await apiCall('POST', '/social/schedule', { text, imageUrl, platforms, scheduledFor: new Date(scheduleDate).toISOString() });
      ntf('Post scheduled for ' + new Date(scheduleDate).toLocaleString());
      closeSocialPostModal();
      loadScheduledPosts();
    } catch { ntf('Failed to schedule'); }
  } else {
    btn.innerHTML = '<div class="spin" style="width:12px;height:12px"></div> Posting...';
    try {
      const data = await apiCall('POST', '/social/post', { text, imageUrl, platforms });
      if (data.errors && data.errors.length > 0) {
        const errMsg = data.errors.map(e => `${e.platform}: ${e.error}`).join(', ');
        document.getElementById('spResult').innerHTML = `<div style="font-size:11px;color:#f85149">${errMsg}</div>`;
        if (data.results && data.results.length > 0) ntf(`Posted to ${data.results.length} platform(s), ${data.errors.length} failed`);
      } else {
        ntf('Posted to ' + platforms.join(', ') + '!');
        closeSocialPostModal();
      }
    } catch { ntf('Failed to post'); }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-send" style="font-size:12px;margin-right:4px"></i> Post Now';
}

async function loadScheduledPosts() {
  const section = document.getElementById('socialScheduledSection');
  if (!section) return;
  try {
    const data = await apiGet('/social/scheduled');
    const posts = (data && data.posts) || [];
    const scheduled = posts.filter(p => p.status === 'scheduled');

    if (scheduled.length === 0) { section.innerHTML = ''; return; }

    const platIcons = {
      linkedin: '<i class="ti ti-brand-linkedin" style="color:#0A66C2;font-size:12px"></i>',
      facebook: '<i class="ti ti-brand-facebook" style="color:#1877F2;font-size:12px"></i>',
      instagram: '<i class="ti ti-brand-instagram" style="color:#E4405F;font-size:12px"></i>'
    };

    let rows = '';
    scheduled.forEach(p => {
      const icons = (p.platforms || []).map(pl => platIcons[pl] || pl).join(' ');
      const dt = new Date(p.scheduledFor);
      rows += `<div class="user-row">
        <div class="user-info" style="flex:1">
          <div class="user-name" style="font-size:12px">${p.text.length > 80 ? p.text.substring(0, 80) + '...' : p.text}</div>
          <div class="user-meta">${icons} · ${dt.toLocaleDateString('en-ZA')} ${dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <button class="btn bsm bdng" onclick="cancelScheduledPost('${p.id}')"><i class="ti ti-x" style="font-size:11px"></i></button>
      </div>`;
    });

    section.innerHTML = `<div class="fl" style="margin-top:20px">SCHEDULED POSTS (${scheduled.length})</div>${rows}`;
  } catch { section.innerHTML = ''; }
}

async function cancelScheduledPost(id) {
  if (!confirm('Cancel this scheduled post?')) return;
  try {
    await apiCall('DELETE', '/social/scheduled/' + id);
    ntf('Scheduled post cancelled');
    loadScheduledPosts();
  } catch { ntf('Failed to cancel'); }
}
