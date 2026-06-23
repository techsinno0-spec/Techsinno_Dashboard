async function render_communications() {
  if (!isManager()) return;
  const el = document.getElementById('page-communications');
  el.innerHTML = `<div class="empty-state">
    <i class="ti ti-messages" style="font-size:28px"></i>
    <div style="font-size:13px;font-weight:500;margin:8px 0 4px">Communications Hub</div>
    <div style="font-size:11px;color:var(--text3);max-width:340px;margin-bottom:12px">Email and messaging are now available on their dedicated pages.</div>
    <div style="display:flex;gap:8px;justify-content:center">
      <button class="btn bsm" onclick="navigateTo('inboxes')"><i class="ti ti-inbox" style="font-size:11px;margin-right:3px"></i> All Inboxes</button>
      <button class="btn bsm bo" onclick="navigateTo('social')"><i class="ti ti-messages" style="font-size:11px;margin-right:3px"></i> Social Messages</button>
    </div>
  </div>`;
}
