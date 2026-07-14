let _lastZohoDashboard = null;

async function render_zoho() {
  if (!isOwner()) return;
  const el = document.getElementById('page-zoho');

  el.innerHTML = '<div class="spin"></div> Loading Zoho Books data...';

  try {
    const data = await apiGet('/zoho/dashboard');
    if (!data || !data.success) {
      el.innerHTML = `<div class="empty-state"><i class="ti ti-chart-bar"></i>${(data && data.error) || 'Failed to load Zoho data'}<br><br><button class="btn bsm" onclick="navigateTo('settings')">Go to Settings</button></div>`;
      return;
    }

    _lastZohoDashboard = data;
    const s = data.summary;
    const fmt = n => 'R ' + (n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let html = `<div class="stats-grid">
      <div class="stat-card"><div class="stat-val">${fmt(s.totalInvoiced)}</div><div class="stat-lbl">Total Invoiced</div></div>
      <div class="stat-card"><div class="stat-val" style="color:#3fb950">${fmt(s.totalReceived)}</div><div class="stat-lbl">Received</div></div>
      <div class="stat-card"><div class="stat-val" style="color:#f85149">${fmt(s.totalOverdue)}</div><div class="stat-lbl">Overdue</div></div>
      <div class="stat-card"><div class="stat-val">${fmt(s.totalUnpaid)}</div><div class="stat-lbl">Unpaid</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--accent)">${fmt(s.totalExpenses)}</div><div class="stat-lbl">Expenses</div></div>
      <div class="stat-card"><div class="stat-val" style="color:${s.netProfit >= 0 ? '#3fb950' : '#f85149'}">${fmt(s.netProfit)}</div><div class="stat-lbl">Net Profit</div></div>
      <div class="stat-card"><div class="stat-val">${s.clientCount}</div><div class="stat-lbl">Active Clients</div></div>
    </div>`;

    if (data.overdueInvoices && data.overdueInvoices.length > 0) {
      html += '<h3 style="margin:18px 0 8px;font-size:14px;color:#f85149"><i class="ti ti-alert-triangle" style="font-size:14px"></i> Overdue Invoices</h3>';
      html += '<div class="card" style="padding:0;overflow:hidden"><table style="width:100%;font-size:12px;border-collapse:collapse">';
      html += '<tr style="background:var(--card-hover);color:var(--text3)"><th style="padding:8px;text-align:left">Invoice</th><th style="text-align:left;padding:8px">Client</th><th style="text-align:right;padding:8px">Amount</th><th style="text-align:right;padding:8px">Due Date</th></tr>';
      data.overdueInvoices.forEach(i => {
        html += `<tr style="border-top:1px solid var(--border)"><td style="padding:8px;font-family:'DM Mono',monospace">${escHtml(i.number)}</td><td style="padding:8px">${escHtml(i.client)}</td><td style="padding:8px;text-align:right;color:#f85149">${fmt(i.amount)}</td><td style="padding:8px;text-align:right;font-family:'DM Mono',monospace">${escHtml(i.due)}</td></tr>`;
      });
      html += '</table></div>';
    }

    html += '<h3 style="margin:18px 0 8px;font-size:14px">Recent Invoices</h3>';
    html += '<div class="card" style="padding:0;overflow:hidden"><table style="width:100%;font-size:12px;border-collapse:collapse">';
    html += '<tr style="background:var(--card-hover);color:var(--text3)"><th style="padding:8px;text-align:left">Invoice</th><th style="text-align:left;padding:8px">Client</th><th style="text-align:right;padding:8px">Amount</th><th style="text-align:left;padding:8px">Status</th><th style="text-align:right;padding:8px">Date</th></tr>';
    (data.recentInvoices || []).forEach(i => {
      const sc = i.status === 'paid' ? '#3fb950' : i.status === 'overdue' ? '#f85149' : 'var(--accent)';
      html += `<tr style="border-top:1px solid var(--border)"><td style="padding:8px;font-family:'DM Mono',monospace">${escHtml(i.number)}</td><td style="padding:8px">${escHtml(i.client)}</td><td style="padding:8px;text-align:right">${fmt(i.amount)}</td><td style="padding:8px"><span style="color:${sc};font-size:11px;text-transform:capitalize">${escHtml(i.status)}</span></td><td style="padding:8px;text-align:right;font-family:'DM Mono',monospace">${escHtml(i.date)}</td></tr>`;
    });
    html += '</table></div>';

    if (data.recentExpenses && data.recentExpenses.length > 0) {
      html += '<h3 style="margin:18px 0 8px;font-size:14px">Recent Expenses</h3>';
      html += '<div class="card" style="padding:0;overflow:hidden"><table style="width:100%;font-size:12px;border-collapse:collapse">';
      html += '<tr style="background:var(--card-hover);color:var(--text3)"><th style="padding:8px;text-align:left">Description</th><th style="text-align:left;padding:8px">Category</th><th style="text-align:right;padding:8px">Amount</th><th style="text-align:right;padding:8px">Date</th></tr>';
      data.recentExpenses.forEach(e => {
        html += `<tr style="border-top:1px solid var(--border)"><td style="padding:8px">${escHtml(e.desc)}</td><td style="padding:8px;color:var(--text3)">${escHtml(e.category)}</td><td style="padding:8px;text-align:right">${fmt(e.amount)}</td><td style="padding:8px;text-align:right;font-family:'DM Mono',monospace">${escHtml(e.date)}</td></tr>`;
      });
      html += '</table></div>';
    }

    html += `<div style="margin-top:14px;text-align:right;display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap">
      <button class="btn bsm bo" onclick="saveZohoReportToOneDrive()"><i class="ti ti-cloud-upload" style="font-size:12px"></i> Save report to OneDrive</button>
      <button class="btn bsm bo" onclick="render_zoho()"><i class="ti ti-refresh" style="font-size:12px"></i> Refresh</button>
    </div>`;

    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load Zoho Books data<br><span style="font-size:11px;color:var(--text3)">${err.message || ''}</span></div>`;
  }
}

function zohoTextToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function zohoMoney(value) {
  return 'R ' + (Number(value || 0)).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function zohoRows(items, columns) {
  return (items || []).map(item => `<tr>
    ${columns.map(col => `<td class="${col.num ? 'num' : ''}">${col.format ? col.format(item[col.key], item) : escHtml(item[col.key] || '')}</td>`).join('')}
  </tr>`).join('');
}

function zohoReportHtml(data) {
  const s = data.summary || {};
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>TECHSINNO Zoho Books Report</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#17202a;margin:32px;line-height:1.45}
    h1{margin:0 0 6px;font-size:24px}
    h2{font-size:16px;margin:28px 0 10px}
    .muted{color:#687582;font-size:12px}
    .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px}
    .stat{border:1px solid #d6dde5;padding:12px;border-radius:6px}
    .label{font-size:11px;color:#687582;text-transform:uppercase}
    .value{font-size:18px;font-weight:700;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th{font-size:11px;text-align:left;color:#687582;border-bottom:1px solid #d6dde5;padding:8px}
    td{font-size:12px;border-bottom:1px solid #edf1f5;padding:8px}
    .num{text-align:right}
  </style>
</head>
<body>
  <h1>TECHSINNO Zoho Books Report</h1>
  <div class="muted">Generated ${escHtml(formatDateTime(new Date().toISOString()))}</div>
  <div class="summary">
    <div class="stat"><div class="label">Total invoiced</div><div class="value">${zohoMoney(s.totalInvoiced)}</div></div>
    <div class="stat"><div class="label">Received</div><div class="value">${zohoMoney(s.totalReceived)}</div></div>
    <div class="stat"><div class="label">Overdue</div><div class="value">${zohoMoney(s.totalOverdue)}</div></div>
    <div class="stat"><div class="label">Unpaid</div><div class="value">${zohoMoney(s.totalUnpaid)}</div></div>
    <div class="stat"><div class="label">Expenses</div><div class="value">${zohoMoney(s.totalExpenses)}</div></div>
    <div class="stat"><div class="label">Net profit</div><div class="value">${zohoMoney(s.netProfit)}</div></div>
  </div>
  <h2>Recent invoices</h2>
  <table>
    <thead><tr><th>Invoice</th><th>Client</th><th class="num">Amount</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${zohoRows(data.recentInvoices, [
      { key: 'number' },
      { key: 'client' },
      { key: 'amount', num: true, format: zohoMoney },
      { key: 'status' },
      { key: 'date' }
    ])}</tbody>
  </table>
  <h2>Recent expenses</h2>
  <table>
    <thead><tr><th>Description</th><th>Category</th><th class="num">Amount</th><th>Date</th></tr></thead>
    <tbody>${zohoRows(data.recentExpenses, [
      { key: 'desc' },
      { key: 'category' },
      { key: 'amount', num: true, format: zohoMoney },
      { key: 'date' }
    ])}</tbody>
  </table>
</body>
</html>`;
}

async function saveZohoReportToOneDrive() {
  if (!_lastZohoDashboard) {
    ntf('Load Zoho Books first');
    return;
  }
  ntf('Saving Zoho report to OneDrive...');
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `zoho-books-report-${stamp}.html`;
    const data = await apiPost('/onedrive/upload', {
      name,
      contentType: 'text/html; charset=utf-8',
      data: zohoTextToBase64(zohoReportHtml(_lastZohoDashboard)),
      folder: 'TECHSINNO Dashboard/Zoho Books'
    });
    if (data && data.error) {
      ntf(data.error);
      return;
    }
    ntf('Zoho report saved to OneDrive: ' + (data?.item?.name || name));
  } catch (err) {
    ntf('OneDrive save failed: ' + (err.message || 'unknown error'));
  }
}
