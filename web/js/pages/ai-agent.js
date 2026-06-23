let chatMessages = [];

async function render_agent() {
  const el = document.getElementById('page-agent');
  chatMessages = [];

  const quickActions = isManager() ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
    <button class="btn bsm bo" onclick="aiSmartOutreach()"><i class="ti ti-mail" style="font-size:11px;margin-right:3px"></i> Draft Outreach</button>
    <button class="btn bsm bo" onclick="aiQuickAction('Write a professional social media post for LinkedIn about TECHSINNO\\'s industrial automation services. Keep it under 200 words.')"><i class="ti ti-brand-linkedin" style="font-size:11px;margin-right:3px"></i> Social Post</button>
    <button class="btn bsm bo" onclick="aiSmartFollowUp()"><i class="ti ti-bell" style="font-size:11px;margin-right:3px"></i> Follow-up Plan</button>
    <button class="btn bsm bo" onclick="aiSmartQuote()"><i class="ti ti-file-invoice" style="font-size:11px;margin-right:3px"></i> Quote Ideas</button>
  </div>` : '';

  el.innerHTML = `<div style="display:flex;flex-direction:column;height:calc(100vh - 120px);max-width:760px">
    ${quickActions}
    <div id="chatArea" style="flex:1;overflow-y:auto;padding:8px 0"></div>
    <div style="display:flex;gap:8px;padding:10px 0;border-top:1px solid var(--border)">
      <textarea id="chatInput" style="flex:1;height:42px;resize:none" placeholder="Ask about tasks, draft a message, get work suggestions..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat()}"></textarea>
      <button class="btn" onclick="sendChat()" id="chatSendBtn" style="align-self:flex-end"><i class="ti ti-send" style="font-size:14px"></i></button>
    </div>
  </div>`;

  const area = document.getElementById('chatArea');
  area.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--text3)">
    <i class="ti ti-robot" style="font-size:32px;display:block;margin-bottom:8px"></i>
    <div style="font-size:13px;font-weight:500;margin-bottom:4px">TECHSINNO AI Assistant</div>
    <div style="font-size:11px">Operational help only — task management, drafting messages, work suggestions.</div>
    ${isManager() ? '<div style="font-size:10px;margin-top:8px;color:var(--brand-mid)">Manager mode: full business context</div>' : '<div style="font-size:10px;margin-top:8px;color:var(--text3)">Staff mode: task-focused assistance</div>'}
  </div>`;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  chatMessages.push({ role: 'user', content: text });
  input.value = '';

  const area = document.getElementById('chatArea');
  if (chatMessages.length === 1) area.innerHTML = '';

  area.innerHTML += `<div style="display:flex;gap:8px;margin-bottom:12px;justify-content:flex-end">
    <div style="background:var(--brand);color:#fff;padding:8px 12px;border-radius:10px 10px 2px 10px;max-width:75%;font-size:12px;white-space:pre-wrap">${escChat(text)}</div>
  </div>`;

  const loadingId = 'ai-loading-' + Date.now();
  area.innerHTML += `<div id="${loadingId}" style="display:flex;gap:8px;margin-bottom:12px">
    <div style="width:28px;height:28px;border-radius:50%;background:var(--card-hover);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-robot" style="font-size:14px;color:var(--brand-mid)"></i></div>
    <div style="background:var(--card-hover);padding:8px 12px;border-radius:10px 10px 10px 2px;font-size:12px"><div class="spin" style="width:14px;height:14px;border-width:2px"></div></div>
  </div>`;
  area.scrollTop = area.scrollHeight;

  const btn = document.getElementById('chatSendBtn');
  btn.disabled = true;

  try {
    const data = await apiPost('/ai/chat', { messages: chatMessages });
    const reply = (data && data.text) || (data && data.error) || 'No response';
    chatMessages.push({ role: 'assistant', content: reply });

    const loader = document.getElementById(loadingId);
    if (loader) {
      loader.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:var(--card-hover);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-robot" style="font-size:14px;color:var(--brand-mid)"></i></div>
        <div style="background:var(--card-hover);padding:8px 12px;border-radius:10px 10px 10px 2px;max-width:75%;font-size:12px;white-space:pre-wrap">${formatAiReply(reply)}</div>`;
    }
  } catch {
    const loader = document.getElementById(loadingId);
    if (loader) {
      loader.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:#f8514920;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-alert-circle" style="font-size:14px;color:#f85149"></i></div>
        <div style="background:#f8514910;padding:8px 12px;border-radius:10px;font-size:12px;color:#f85149">Failed to get response. Please try again.</div>`;
    }
    chatMessages.pop();
  }

  btn.disabled = false;
  area.scrollTop = area.scrollHeight;
  input.focus();
}

function escChat(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatAiReply(text) {
  let safe = escChat(text);
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:var(--bg);padding:1px 4px;border-radius:3px;font-family:\'DM Mono\',monospace;font-size:11px">$1</code>');
  return safe;
}

function aiQuickAction(prompt) {
  const input = document.getElementById('chatInput');
  input.value = prompt;
  sendChat();
}

async function aiSmartOutreach() {
  try {
    const data = await apiGet('/clients');
    const clients = (data && data.clients) || [];
    const leads = clients.filter(c => c.status === 'lead').slice(0, 5);
    if (leads.length) {
      const leadList = leads.map(c => `- ${c.companyName} (${c.industry || 'unknown industry'}, ${c.contactName || 'no contact'}, ${c.email || 'no email'})`).join('\n');
      aiQuickAction(`I have these leads in my CRM that haven't been contacted yet:\n${leadList}\n\nPick the best one and draft a personalized cold outreach email for them. Reference their specific industry and how TECHSINNO's PLC/SCADA, PCB repair, or IoT services solve their pain points. Include Subject: and Body: lines ready to send.`);
    } else {
      aiQuickAction('Draft a cold outreach email to a manufacturing company in the Western Cape. Make it professional and reference our PLC/SCADA and industrial electronics services. Include Subject: and Body: lines.');
    }
  } catch {
    aiQuickAction('Draft a cold outreach email to a manufacturing company in the Western Cape. Make it professional and reference our PLC/SCADA and industrial electronics services.');
  }
}

async function aiSmartFollowUp() {
  try {
    const data = await apiGet('/clients');
    const clients = (data && data.clients) || [];
    const now = new Date();
    const overdue = clients.filter(c => c.followUpDate && new Date(c.followUpDate) <= now && !['won', 'lost'].includes(c.status));
    const active = clients.filter(c => ['contacted', 'quoted', 'negotiating'].includes(c.status));

    let prompt = 'Here is my current CRM pipeline:\n';
    if (overdue.length) {
      prompt += '\nOVERDUE FOLLOW-UPS:\n' + overdue.map(c => `- ${c.companyName} (${c.status}, follow-up was due ${new Date(c.followUpDate).toLocaleDateString('en-ZA')}${c.contactName ? ', contact: ' + c.contactName : ''}${c.email ? ', ' + c.email : ''})`).join('\n');
    }
    if (active.length) {
      prompt += '\nACTIVE LEADS:\n' + active.map(c => `- ${c.companyName} (${c.status}, R${Math.round(c.estimatedValue || 0).toLocaleString()}${c.contactName ? ', ' + c.contactName : ''})`).join('\n');
    }
    if (!overdue.length && !active.length) {
      prompt += 'No active leads or overdue follow-ups.\n';
    }
    prompt += '\nPrioritize which leads I should follow up with TODAY, explain why, and draft a short follow-up message for the #1 priority.';
    aiQuickAction(prompt);
  } catch {
    aiQuickAction('Based on my CRM pipeline, which leads should I follow up with first? Suggest priorities and draft a brief follow-up message.');
  }
}

async function aiSmartQuote() {
  try {
    const data = await apiGet('/clients');
    const clients = (data && data.clients) || [];
    const quotable = clients.filter(c => ['contacted', 'quoted', 'negotiating'].includes(c.status)).slice(0, 5);
    if (quotable.length) {
      const list = quotable.map(c => `- ${c.companyName} (${c.industry || 'unknown'}, status: ${c.status}, est. value: R${Math.round(c.estimatedValue || 0).toLocaleString()})`).join('\n');
      aiQuickAction(`Here are my active leads that could use quotes:\n${list}\n\nFor the most promising one, suggest specific line items for a quote based on their industry. Include realistic pricing in ZAR for TECHSINNO's services (PCB repair, PLC programming, SCADA setup, IoT monitoring). Format as a ready-to-use quote with Description, Qty, Unit Price, and Total for each line item.`);
    } else {
      aiQuickAction('Suggest 3 quote ideas for common industrial electronics services TECHSINNO could offer. Include line items with Description, Qty, Unit Price (ZAR), and Total for each.');
    }
  } catch {
    aiQuickAction('Suggest 3 quote ideas for common industrial electronics services we could offer. Include line items and pricing in ZAR.');
  }
}
