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

    html += `<div style="margin-top:14px;text-align:right"><button class="btn bsm bo" onclick="render_zoho()"><i class="ti ti-refresh" style="font-size:12px"></i> Refresh</button></div>`;

    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load Zoho Books data<br><span style="font-size:11px;color:var(--text3)">${err.message || ''}</span></div>`;
  }
}
