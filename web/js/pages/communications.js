async function render_communications() {
  if (!isManager()) return;
  const el = document.getElementById('page-communications');
  el.innerHTML = `<div style="max-width:980px">
    <div class="g3" style="margin-bottom:14px">
      <div class="card" style="border-top:2px solid var(--brand-mid)">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:5px"><i class="ti ti-file-invoice" style="color:var(--brand-mid)"></i> Quote request</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.5">Capture website or phone quote requests and add them to CRM for follow-up.</div>
      </div>
      <div class="card" style="border-top:2px solid var(--accent)">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:5px"><i class="ti ti-calendar" style="color:var(--accent)"></i> Meeting request</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.5">Log a client meeting request and create a reminder so it does not disappear.</div>
      </div>
      <div class="card" style="border-top:2px solid #3fb950">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:5px"><i class="ti ti-world" style="color:#3fb950"></i> Web request</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.5">Use this page for incoming web requests only. Integration setup lives in Settings.</div>
      </div>
    </div>

    <div class="card">
      <div class="ctitle">New communication request</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div class="flbl">Request type</div><select id="commType" style="width:100%"><option value="quote">Quote request</option><option value="meeting">Meeting request</option><option value="support">Support / repair request</option><option value="general">General enquiry</option></select></div>
        <div><div class="flbl">Company / customer *</div><input id="commCompany" style="width:100%" placeholder="Company name"></div>
        <div><div class="flbl">Contact name</div><input id="commContact" style="width:100%" placeholder="Person responsible"></div>
        <div><div class="flbl">Email</div><input id="commEmail" type="email" style="width:100%" placeholder="name@example.com"></div>
        <div><div class="flbl">Phone</div><input id="commPhone" style="width:100%" placeholder="+27..."></div>
        <div><div class="flbl">Due / meeting date</div><input id="commDue" type="datetime-local" style="width:100%"></div>
      </div>
      <div class="flbl">Request details *</div>
      <textarea id="commDetails" style="width:100%;min-height:110px" placeholder="What does the customer need? Include machine, fault, quote scope, site, urgency, or meeting topic."></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn bo" onclick="navigateTo('settings')"><i class="ti ti-settings" style="font-size:12px"></i> Settings</button>
        <button class="btn" onclick="submitCommunicationRequest()"><i class="ti ti-device-floppy" style="font-size:12px"></i> Save request</button>
      </div>
      <div id="commResult" style="font-size:11px;color:var(--text3);margin-top:8px"></div>
    </div>
  </div>`;
}

async function submitCommunicationRequest() {
  const type = document.getElementById('commType').value;
  const companyName = document.getElementById('commCompany').value.trim();
  const details = document.getElementById('commDetails').value.trim();
  if (!companyName) return ntf('Company/customer is required');
  if (!details) return ntf('Request details are required');

  const contactName = document.getElementById('commContact').value.trim();
  const email = document.getElementById('commEmail').value.trim();
  const phone = document.getElementById('commPhone').value.trim();
  const due = document.getElementById('commDue').value;
  const label = type === 'quote' ? 'Quote request' : type === 'meeting' ? 'Meeting request' : type === 'support' ? 'Support request' : 'Web request';

  const clientRes = await apiPost('/clients', {
    companyName,
    contactName,
    email,
    phone,
    source: 'website',
    industry: 'other',
    notes: `${label}: ${details}`,
    followUpDate: due ? new Date(due).toISOString() : null
  });
  if (clientRes && clientRes.error) return ntf(clientRes.error);

  if (due) {
    await apiPost('/reminders', {
      title: `${label}: ${companyName}`,
      description: `${details}${contactName ? '\nContact: ' + contactName : ''}${email ? '\nEmail: ' + email : ''}${phone ? '\nPhone: ' + phone : ''}`,
      dueDate: new Date(due).toISOString(),
      priority: type === 'quote' || type === 'support' ? 'high' : 'medium',
      linkedTo: clientRes && clientRes.client ? { type: 'client', id: clientRes.client.id, label: companyName } : null
    });
  }

  document.getElementById('commResult').textContent = `${label} saved to CRM${due ? ' and reminder created' : ''}.`;
  ntf('Request saved');
  ['commCompany','commContact','commEmail','commPhone','commDue','commDetails'].forEach(id => { const input = document.getElementById(id); if (input) input.value = ''; });
}
