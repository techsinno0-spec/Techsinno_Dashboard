let _quotes = [];
let _quoteClients = [];

function render_quotes() {
  if (!isManager()) return;
  const el = document.getElementById('page-quotes');
  el.innerHTML = '<div class="spin"></div>';
  loadQuotes();
}

async function loadQuotes() {
  const el = document.getElementById('page-quotes');
  try {
    const [qData, cData] = await Promise.all([apiGet('/quotes'), apiGet('/clients')]);
    _quotes = (qData && qData.quotes) || [];
    _quoteClients = (cData && cData.clients) || [];
    renderQuotesPage(el);
  } catch {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load quotes</div>';
  }
}

function renderQuotesPage(el) {
  const total = _quotes.reduce((s, q) => s + (q.grandTotal || 0), 0);
  const accepted = _quotes.filter(q => q.status === 'accepted');
  const pending = _quotes.filter(q => q.status === 'draft' || q.status === 'sent');
  const acceptedVal = accepted.reduce((s, q) => s + (q.grandTotal || 0), 0);

  const statusBdg = { draft: 'b-pending', sent: 'b-in_progress', accepted: 'b-done', rejected: 'b-blocked', expired: 'b-blocked' };

  let rows = '';
  _quotes.forEach(q => {
    rows += `<div class="user-row" style="cursor:pointer" onclick="showQuoteDetail('${q.id}')">
      <div style="min-width:70px"><span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--brand-mid)">${q.quoteNumber}</span></div>
      <div class="user-info">
        <div class="user-name">${escHtml(q.title)}</div>
        <div class="user-meta">${escHtml(q.clientName)} · ${q.items ? q.items.length : 0} items</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600">R${Math.round(q.grandTotal || 0).toLocaleString()}</div>
        <span class="bdg ${statusBdg[q.status] || ''}">${q.status}</span>
      </div>
    </div>`;
  });

  el.innerHTML = `
    <div class="g4">
      <div class="stat"><div class="slbl">Total Quoted</div><div class="sval cb">R${Math.round(total).toLocaleString()}</div><div class="ssub">${_quotes.length} quotes</div></div>
      <div class="stat"><div class="slbl">Accepted</div><div class="sval cg">R${Math.round(acceptedVal).toLocaleString()}</div><div class="ssub">${accepted.length} deals</div></div>
      <div class="stat"><div class="slbl">Pending</div><div class="sval ca">${pending.length}</div><div class="ssub">awaiting response</div></div>
      <div class="stat"><div class="slbl">Win Rate</div><div class="sval">${_quotes.length ? Math.round(accepted.length / _quotes.length * 100) : 0}%</div><div class="ssub">accepted / total</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:12px;color:var(--text2)">${_quotes.length} quotes</div>
      <button class="btn" onclick="showQuoteForm()"><i class="ti ti-plus" style="font-size:12px"></i> New Quote</button>
    </div>
    ${rows || '<div class="empty-state"><i class="ti ti-file-invoice"></i>No quotes yet</div>'}
    <div id="quoteForm"></div>
    <div id="quoteDetail"></div>`;
}

function showQuoteForm() {
  const clientOpts = _quoteClients.map(c => `<option value="${c.id}" data-name="${c.companyName}">${c.companyName}${c.contactName ? ' — ' + c.contactName : ''}</option>`).join('');

  document.getElementById('quoteDetail').innerHTML = '';
  document.getElementById('quoteForm').innerHTML = `<div class="card" style="margin-top:14px">
    <div class="ctitle">New Quote</div>
    <div style="display:flex;gap:8px">
      <div style="flex:1"><div class="flbl">Client *</div><select id="qClient" style="width:100%"><option value="">Select client...</option>${clientOpts}</select></div>
      <div style="flex:2"><div class="flbl">Title *</div><input type="text" id="qTitle" style="width:100%" placeholder="e.g. PLC Cabinet Repair"></div>
    </div>
    <div class="fl">LINE ITEMS</div>
    <div id="qLineItems">
      <div class="q-line" style="display:flex;gap:6px;margin-bottom:6px">
        <input type="text" placeholder="Description" style="flex:3" class="qi-desc">
        <input type="number" placeholder="Qty" value="1" style="flex:0.5" class="qi-qty" oninput="recalcQuote()">
        <input type="number" placeholder="Unit Price" style="flex:1" class="qi-price" oninput="recalcQuote()">
        <span style="min-width:80px;font-family:'DM Mono',monospace;font-size:12px;display:flex;align-items:center;color:var(--text2)" class="qi-total">R0</span>
      </div>
    </div>
    <button class="btn bsm bo" onclick="addQuoteLine()" style="margin-bottom:10px"><i class="ti ti-plus" style="font-size:11px"></i> Add Line</button>
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-bottom:10px">
      <div style="text-align:right"><div class="flbl">Subtotal</div><div id="qSubtotal" style="font-family:'DM Mono',monospace;font-size:14px">R0</div></div>
      <div style="text-align:right"><div class="flbl">VAT (15%)</div><div id="qVat" style="font-family:'DM Mono',monospace;font-size:14px">R0</div></div>
      <div style="text-align:right"><div class="flbl">Total</div><div id="qTotal" style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;color:var(--brand-mid)">R0</div></div>
    </div>
    <div class="flbl">Notes</div>
    <textarea id="qNotes" style="width:100%;height:50px" placeholder="Terms, conditions, or additional info..."></textarea>
    <div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn" onclick="submitQuote()">Create Quote</button>
      <button class="btn bo" onclick="document.getElementById('quoteForm').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}

function addQuoteLine() {
  const container = document.getElementById('qLineItems');
  const div = document.createElement('div');
  div.className = 'q-line';
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
  div.innerHTML = `<input type="text" placeholder="Description" style="flex:3" class="qi-desc">
    <input type="number" placeholder="Qty" value="1" style="flex:0.5" class="qi-qty" oninput="recalcQuote()">
    <input type="number" placeholder="Unit Price" style="flex:1" class="qi-price" oninput="recalcQuote()">
    <span style="min-width:80px;font-family:'DM Mono',monospace;font-size:12px;display:flex;align-items:center;color:var(--text2)" class="qi-total">R0</span>
    <button class="btn bsm bdng" onclick="this.parentElement.remove();recalcQuote()"><i class="ti ti-x" style="font-size:11px"></i></button>`;
  container.appendChild(div);
}

function recalcQuote() {
  const lines = document.querySelectorAll('.q-line');
  let subtotal = 0;
  lines.forEach(line => {
    const qty = parseFloat(line.querySelector('.qi-qty').value) || 0;
    const price = parseFloat(line.querySelector('.qi-price').value) || 0;
    const total = qty * price;
    line.querySelector('.qi-total').textContent = 'R' + Math.round(total).toLocaleString();
    subtotal += total;
  });
  const vat = subtotal * 0.15;
  document.getElementById('qSubtotal').textContent = 'R' + Math.round(subtotal).toLocaleString();
  document.getElementById('qVat').textContent = 'R' + Math.round(vat).toLocaleString();
  document.getElementById('qTotal').textContent = 'R' + Math.round(subtotal + vat).toLocaleString();
}

async function submitQuote() {
  const clientSelect = document.getElementById('qClient');
  const clientId = clientSelect.value;
  if (!clientId) { ntf('Select a client'); return; }
  const title = document.getElementById('qTitle').value.trim();
  if (!title) { ntf('Title is required'); return; }

  const items = [];
  document.querySelectorAll('.q-line').forEach(line => {
    const desc = line.querySelector('.qi-desc').value.trim();
    if (!desc) return;
    items.push({
      description: desc,
      quantity: parseFloat(line.querySelector('.qi-qty').value) || 1,
      unitPrice: parseFloat(line.querySelector('.qi-price').value) || 0
    });
  });

  if (items.length === 0) { ntf('Add at least one line item'); return; }

  const clientName = clientSelect.options[clientSelect.selectedIndex].dataset.name || '';

  await apiCall('POST', '/quotes', {
    clientId, clientName, title, items,
    notes: document.getElementById('qNotes').value.trim()
  });

  ntf('Quote created');
  document.getElementById('quoteForm').innerHTML = '';
  loadQuotes();
}

function showQuoteDetail(id) {
  const q = _quotes.find(x => x.id === id);
  if (!q) return;

  document.getElementById('quoteForm').innerHTML = '';
  const statuses = ['draft', 'sent', 'accepted', 'rejected'];

  let itemsHtml = '';
  (q.items || []).forEach(i => {
    itemsHtml += `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="flex:3;font-size:12px">${escHtml(i.description)}</span>
      <span style="flex:0.5;font-size:12px;text-align:center">${i.quantity}</span>
      <span style="flex:1;font-size:12px;text-align:right;font-family:'DM Mono',monospace">R${Math.round(i.unitPrice).toLocaleString()}</span>
      <span style="flex:1;font-size:12px;text-align:right;font-family:'DM Mono',monospace;font-weight:500">R${Math.round(i.total).toLocaleString()}</span>
    </div>`;
  });

  document.getElementById('quoteDetail').innerHTML = `<div class="task-detail" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <h3>${escHtml(q.quoteNumber)} — ${escHtml(q.title)}</h3>
        <div style="font-size:12px;color:var(--text2)">${escHtml(q.clientName)} · Created ${formatDate(q.createdAt)}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn bsm bdng" onclick="deleteQuote('${q.id}')">Delete</button>
        <button class="btn bsm bo" onclick="document.getElementById('quoteDetail').innerHTML=''">Close</button>
      </div>
    </div>
    <div class="flbl">Status</div>
    <div style="display:flex;gap:4px;margin-bottom:12px">
      ${statuses.map(s => `<button class="btn bsm ${q.status === s ? '' : 'bo'}" onclick="updateQuoteStatus('${q.id}','${s}')">${s}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">
      <span style="flex:3">DESCRIPTION</span><span style="flex:0.5;text-align:center">QTY</span><span style="flex:1;text-align:right">UNIT PRICE</span><span style="flex:1;text-align:right">TOTAL</span>
    </div>
    ${itemsHtml}
    <div style="display:flex;justify-content:flex-end;gap:20px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="text-align:right"><div style="font-size:10px;color:var(--text3)">Subtotal</div><div style="font-family:'DM Mono',monospace;font-size:13px">R${Math.round(q.subtotal || 0).toLocaleString()}</div></div>
      <div style="text-align:right"><div style="font-size:10px;color:var(--text3)">VAT (${q.vatRate || 15}%)</div><div style="font-family:'DM Mono',monospace;font-size:13px">R${Math.round(q.vatAmount || 0).toLocaleString()}</div></div>
      <div style="text-align:right"><div style="font-size:10px;color:var(--text3)">TOTAL</div><div style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;color:var(--brand-mid)">R${Math.round(q.grandTotal || 0).toLocaleString()}</div></div>
    </div>
    ${q.notes ? `<div class="flbl">Notes</div><div style="font-size:12px;color:var(--text2)">${escHtml(q.notes)}</div>` : ''}
    <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn bsm bo" onclick="window.print()"><i class="ti ti-printer" style="font-size:12px"></i> Print</button>
      <button class="btn bsm bo" onclick="saveQuoteToOneDrive('${q.id}')"><i class="ti ti-cloud-upload" style="font-size:12px"></i> Save to OneDrive</button>
    </div>
  </div>`;
}

function quoteMoney(value) {
  return 'R' + Math.round(Number(value || 0)).toLocaleString();
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function quoteExportHtml(q) {
  const rows = (q.items || []).map(item => {
    const total = item.total ?? ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0));
    return `<tr>
      <td>${escHtml(item.description || '')}</td>
      <td class="num">${escHtml(item.quantity || 0)}</td>
      <td class="num">${quoteMoney(item.unitPrice)}</td>
      <td class="num">${quoteMoney(total)}</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escHtml(q.quoteNumber || 'Quote')}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#17202a;margin:32px;line-height:1.45}
    h1{margin:0 0 6px;font-size:24px}
    .muted{color:#687582;font-size:12px}
    .header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0b6f9f;padding-bottom:16px;margin-bottom:24px}
    .brand{text-align:right;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:18px}
    th{font-size:11px;text-align:left;color:#687582;border-bottom:1px solid #d6dde5;padding:8px}
    td{font-size:12px;border-bottom:1px solid #edf1f5;padding:8px;vertical-align:top}
    .num{text-align:right}
    .totals{margin-left:auto;margin-top:14px;width:280px}
    .totals div{display:flex;justify-content:space-between;padding:5px 0;font-size:12px}
    .grand{font-weight:700;font-size:16px;border-top:1px solid #d6dde5;margin-top:5px;padding-top:8px}
    .notes{margin-top:22px;font-size:12px;white-space:pre-wrap}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escHtml(q.quoteNumber || 'Quote')}</h1>
      <div>${escHtml(q.title || '')}</div>
      <div class="muted">${escHtml(q.clientName || '')} - Created ${escHtml(formatDate(q.createdAt))}</div>
    </div>
    <div class="brand">
      <strong>TECHSINNO</strong><br>
      Frank Muland<br>
      frank@techsinno.com
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><strong>${quoteMoney(q.subtotal)}</strong></div>
    <div><span>VAT (${escHtml(q.vatRate || 15)}%)</span><strong>${quoteMoney(q.vatAmount)}</strong></div>
    <div class="grand"><span>Total</span><span>${quoteMoney(q.grandTotal)}</span></div>
  </div>
  ${q.notes ? `<div class="notes"><strong>Notes</strong><br>${escHtml(q.notes)}</div>` : ''}
</body>
</html>`;
}

async function saveQuoteToOneDrive(id) {
  const q = _quotes.find(x => x.id === id);
  if (!q) return;
  ntf('Saving quote to OneDrive...');
  try {
    const safeClient = (q.clientName || 'client').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 50) || 'client';
    const name = `${q.quoteNumber || 'quote'}-${safeClient}.html`;
    const data = await apiPost('/onedrive/upload', {
      name,
      contentType: 'text/html; charset=utf-8',
      data: textToBase64(quoteExportHtml(q)),
      folder: 'TECHSINNO Dashboard/Quotes'
    });
    if (data && data.error) {
      ntf(data.error);
      return;
    }
    ntf('Quote saved to OneDrive: ' + (data?.item?.name || name));
  } catch (err) {
    ntf('OneDrive save failed: ' + (err.message || 'unknown error'));
  }
}

async function updateQuoteStatus(id, status) {
  const data = await apiCall('PUT', '/quotes/' + id, { status });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Quote ' + status);
  loadQuotes();
}

async function deleteQuote(id) {
  if (!confirm('Delete this quote?')) return;
  const data = await apiCall('DELETE', '/quotes/' + id);
  if (data && data.error) { ntf(data.error); return; }
  ntf('Quote deleted');
  document.getElementById('quoteDetail').innerHTML = '';
  loadQuotes();
}
