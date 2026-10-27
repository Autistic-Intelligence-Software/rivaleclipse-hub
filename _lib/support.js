// Shared support-ticket UI (2026-10-27): staff inbox + team log for the
// Team/Admin dashboards, notify-pref form, and the profile "My requests"
// thread view. Talks to the auth service ticket API (auth.rivaleclipse.dev).
const AUTH = 'https://auth.rivaleclipse.dev';

async function api(path, opts = {}) {
  const r = await fetch(AUTH + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (v) => { try { return v ? new Date(v).toLocaleString() : '—'; } catch { return '—'; } };
export function fmtElapsed(ms) {
  if (ms == null || isNaN(ms)) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + (m % 60) + 'm';
  const d = Math.floor(h / 24);
  return d + 'd ' + (h % 24) + 'h';
}
const STATUS_PILL = {
  open: ['wait', 'Open'], claimed: ['ok', 'Claimed'], waiting: ['bad', '⏳ Waiting'],
  resolved: ['ok', 'Resolved'], closed: ['', 'Closed'],
};

let cssDone = false;
function injectCss() {
  if (cssDone) return; cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
/* control styles the component relies on (same look as the dashboards' own) */
.act-btn { border:1px solid var(--line); background:none; color:var(--text); border-radius:8px;
  padding:8px 14px; cursor:pointer; font-size:.85rem; font-weight:600; font-family:inherit; }
.act-btn:hover { border-color:var(--accent); }
.act-btn:disabled { opacity:.5; cursor:default; }
.pill { font-size:.78rem; font-weight:700; padding:4px 12px; border-radius:999px; border:1px solid var(--line); color:var(--muted); }
.pill.ok { color:#7ee2a0; border-color:#2c5a3a; }
.pill.bad { color:#ff9a9a; border-color:#6e2f2f; }
.pill.wait { color:#f3d27a; border-color:#5a4a1c; }
.badge.cat { color:#f3d27a; border-color:#5a4a1c; }
.composer { display:flex; gap:8px; }
.composer textarea { flex:1; background:#0d0d15; border:1px solid var(--line); border-radius:10px;
  color:var(--text); padding:10px 12px; font-size:.9rem; font-family:inherit; min-height:44px; resize:vertical; }
.composer textarea:focus { outline:none; border-color:var(--accent); }
.composer button { background:linear-gradient(135deg,#d4af37,#8a6d1c); color:#0a0a12; font-weight:800;
  border:none; border-radius:10px; padding:0 20px; cursor:pointer; font-size:.9rem; }
.switch { position:relative; width:46px; height:26px; flex:0 0 auto; cursor:pointer; }
.switch input { opacity:0; width:0; height:0; }
.switch .tk { position:absolute; inset:0; background:#2a2a35; border-radius:999px; transition:.2s; }
.switch .tk::before { content:''; position:absolute; width:20px; height:20px; left:3px; top:3px;
  background:#9a9ab0; border-radius:50%; transition:.2s; }
.switch input:checked + .tk { background:#4a3f1c; }
.switch input:checked + .tk::before { transform:translateX(20px); background:#d4af37; }
.notif-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0;
  border-bottom:1px solid var(--line); font-size:.92rem; }
.save-btn { background:linear-gradient(135deg,#d4af37,#8a6d1c); color:#0a0a12; font-weight:800;
  border:none; border-radius:10px; padding:12px 28px; cursor:pointer; font-size:.95rem; font-family:inherit; }
.save-msg { margin-top:10px; font-size:.9rem; }
.save-msg.ok { color:var(--ok); }
.save-msg.err { color:#ff7070; }
.sup-badge { display:inline-block; min-width:22px; text-align:center; background:#e74c3c; color:#fff;
  border-radius:999px; font-size:.75rem; font-weight:800; padding:2px 7px; margin-left:8px; vertical-align:middle; }
.sup-chips { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0; }
.sup-chip { border:1px solid var(--line); background:none; color:var(--muted); border-radius:999px;
  padding:6px 14px; cursor:pointer; font-size:.83rem; font-weight:600; font-family:inherit; }
.sup-chip.on { color:#0a0a12; background:linear-gradient(135deg,#d4af37,#8a6d1c); border-color:transparent; }
.sup-ticket { border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin-bottom:10px;
  background:rgba(13,13,21,.6); cursor:pointer; }
.sup-ticket:hover { border-color:var(--accent); }
.sup-ticket .hd { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.sup-ticket .ref { font-family:monospace; font-weight:700; color:#f3d27a; }
.sup-ticket .sum { color:var(--text); font-size:.92rem; margin:6px 0 0; }
.sup-ticket .meta { color:var(--muted); font-size:.82rem; margin-top:4px; }
.sup-open { color:#ff9d6b; font-weight:700; }
.sup-detail { border:1px solid var(--accent); border-radius:12px; padding:16px; margin:4px 0 16px;
  background:rgba(13,13,21,.85); }
.sup-kv { width:100%; border-collapse:collapse; font-size:.88rem; margin:8px 0; }
.sup-kv td { padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
.sup-kv td:first-child { color:var(--muted); width:170px; text-transform:capitalize; }
.sup-thread { display:flex; flex-direction:column; gap:10px; max-height:340px; overflow-y:auto; margin:10px 0; }
.sup-msg { padding:10px 14px; border-radius:12px; font-size:.9rem; line-height:1.55; max-width:88%; }
.sup-msg .who { font-size:.75rem; color:var(--muted); margin-bottom:4px; }
.sup-msg.staff { align-self:flex-end; background:#1d1a10; border:1px solid #4a3f1c; }
.sup-msg.submitter { align-self:flex-start; background:#101019; border:1px solid var(--line); }
.sup-msg.internal { align-self:flex-end; background:#241016; border:1px dashed #6e2f2f; }
.sup-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
.sup-notif { display:flex; justify-content:space-between; gap:10px; padding:9px 0;
  border-bottom:1px solid var(--line); font-size:.9rem; }
.sup-notif.unread { font-weight:700; }
.sup-log-row { padding:9px 0; border-bottom:1px solid var(--line); font-size:.9rem; }
.sup-log-row:last-child { border-bottom:none; }
.sup-log-row .ev-claimed { color:#7ee2a0; font-weight:700; }
.sup-log-row .ev-unavailable { color:#ff9d6b; font-weight:700; }
`;
  document.head.appendChild(st);
}

// ---------------- staff inbox (queue + thread workbench + notifications) ----
export async function mountSupportInbox(root) {
  injectCss();
  root.innerHTML = `
    <div id="sup-notifs"><p class="dim">Loading notifications…</p></div>
    <div class="sup-chips" id="sup-chips"></div>
    <div id="sup-list"><p class="dim">Loading tickets…</p></div>
    <div id="sup-detail"></div>`;
  const listEl = root.querySelector('#sup-list');
  const chipsEl = root.querySelector('#sup-chips');
  const detailEl = root.querySelector('#sup-detail');
  const notifEl = root.querySelector('#sup-notifs');
  let tickets = [];
  let categories = [];
  let filter = '';
  let activeId = null;

  async function loadNotifs() {
    const { status, data } = await api('/api/notifications');
    if (status !== 200) { notifEl.innerHTML = ''; return; }
    const items = data.notifications || [];
    const head = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <h3 style="margin:0;font-size:1rem">Notifications${data.unread ? `<span class="sup-badge">${data.unread}</span>` : ''}</h3>
      ${data.unread ? '<button class="act-btn" id="sup-readall" type="button">Mark all read</button>' : ''}</div>`;
    notifEl.innerHTML = head + (items.length ? items.slice(0, 8).map((n) => `
      <div class="sup-notif${n.read ? '' : ' unread'}">
        <span>${esc(n.category_label || 'Notice')} · ${esc(n.kind.replace(/_/g, ' '))}${n.ref ? ' · ' + esc(n.ref) : ''}</span>
        <span class="dim">${esc(fmtDate(n.created_at))}</span>
      </div>`).join('') : '<p class="dim">No notifications yet.</p>');
    const btn = notifEl.querySelector('#sup-readall');
    if (btn) btn.onclick = async () => { await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) }); loadNotifs(); };
  }

  function renderChips() {
    const all = ['', ...categories];
    chipsEl.innerHTML = all.map((c) => {
      const label = c === '' ? 'All categories' : (tickets.find((t) => t.category === c)?.category_label || c);
      return `<button type="button" class="sup-chip${filter === c ? ' on' : ''}" data-chip="${esc(c)}">${esc(label)}</button>`;
    }).join('');
  }
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip]');
    if (!b) return;
    filter = b.dataset.chip;
    renderChips(); renderList();
  });

  function renderList() {
    const rows = tickets.filter((t) => !filter || t.category === filter);
    listEl.innerHTML = rows.length ? rows.map((t) => {
      const [cls, label] = STATUS_PILL[t.status] || ['', t.status];
      const active = ['open', 'claimed', 'waiting'].includes(t.status);
      return `<div class="sup-ticket" data-tid="${esc(t.id)}">
        <div class="hd">
          <span class="ref">${esc(t.ref)}</span>
          <span class="badge cat">${esc(t.category_label)}</span>
          <span class="pill ${cls}">${label}</span>
          ${t.status === 'claimed' && t.claimed_by_name ? `<span class="dim">claimed by ${esc(t.claimed_by_name)} · ${esc(fmtDate(t.claimed_at))}</span>` : ''}
        </div>
        ${t.summary ? `<p class="sum">${esc(t.summary)}</p>` : ''}
        <p class="meta">${esc(t.submitter_name || '')} &lt;${esc(t.submitter_email || 'no email')}&gt; · ${esc(fmtDate(t.created_at))}
        ${active ? ` · <span class="sup-open">Open for <span data-openfor="${esc(t.id)}">${esc(fmtElapsed(t.open_for_ms))}</span></span>` : ''}</p>
      </div>`;
    }).join('') : '<p class="dim">No tickets in this view.</p>';
  }

  async function loadQueue() {
    const { status, data } = await api('/api/tickets/queue');
    if (status !== 200) { listEl.innerHTML = '<p class="dim">Couldn’t load the ticket queue.</p>'; return; }
    tickets = data.tickets || [];
    categories = data.categories || [];
    renderChips(); renderList();
    if (activeId) openDetail(activeId, true);
  }

  listEl.addEventListener('click', (e) => {
    const card = e.target.closest('[data-tid]');
    if (card) openDetail(card.dataset.tid);
  });

  async function openDetail(id, keepScroll = false) {
    activeId = id;
    const { status, data } = await api('/api/tickets/' + encodeURIComponent(id) + '/thread');
    if (status !== 200) { detailEl.innerHTML = '<p class="dim">Couldn’t open that ticket.</p>'; return; }
    const t = data.ticket;
    const kv = Object.entries(t.payload || {})
      .filter(([k, v]) => k !== 'company' && v !== '' && v != null)
      .map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td>${esc(Array.isArray(v) ? v.join(', ') : String(v))}</td></tr>`).join('');
    const msgs = (data.messages || []).map((m) => `
      <div class="sup-msg ${m.internal ? 'internal' : m.author_kind === 'staff' ? 'staff' : 'submitter'}">
        <div class="who">${m.internal ? '🔒 Internal note · ' : ''}${esc(m.author_name || m.author_kind)} · ${esc(fmtDate(m.created_at))}</div>
        ${esc(m.body)}</div>`).join('');
    const canClaim = !t.claimed_by && ['open', 'waiting'].includes(t.status);
    const active = ['open', 'claimed', 'waiting'].includes(t.status);
    detailEl.innerHTML = `<div class="sup-detail" id="sup-detail-box">
      <div class="hd" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="ref" style="font-family:monospace;font-weight:700;color:#f3d27a">${esc(t.ref)}</span>
        <span class="badge cat">${esc(t.category_label)}</span>
        <span class="pill ${(STATUS_PILL[t.status] || [])[0] || ''}">${esc((STATUS_PILL[t.status] || [])[1] || t.status)}</span>
        ${active ? `<span class="sup-open">Open for <span data-openfor="${esc(t.id)}">${esc(fmtElapsed(t.open_for_ms))}</span></span>` : ''}
        <button class="act-btn" type="button" id="sup-close" style="margin-left:auto">Close panel</button>
      </div>
      <p class="dim" style="margin:6px 0 0">${esc(t.submitter_name || '')} &lt;${esc(t.submitter_email || 'no email')}&gt; · submitted ${esc(fmtDate(t.created_at))}
      ${t.claimed_by_name ? ` · claimed by <b>${esc(t.claimed_by_name)}</b> at ${esc(fmtDate(t.claimed_at))}` : ' · unclaimed'}</p>
      ${kv ? `<table class="sup-kv">${kv}</table>` : ''}
      <div class="sup-thread">${msgs || '<p class="dim">No messages yet.</p>'}</div>
      <div class="composer">
        <textarea id="sup-reply" rows="2" maxlength="4000" placeholder="Reply to ${esc(t.submitter_name || 'the submitter')}…"></textarea>
        <button id="sup-send" type="button">Send</button>
      </div>
      <label class="dim" style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <input type="checkbox" id="sup-internal"> Internal note (only the team sees this)</label>
      <div class="sup-actions">
        ${canClaim ? '<button class="act-btn" type="button" data-act="claim">✋ Claim ticket</button>' : ''}
        ${t.category === 'live-chat' && t.status === 'waiting' ? '<button class="act-btn" type="button" data-act="unavailable">Not available</button>' : ''}
        ${t.claimed_by ? '<button class="act-btn" type="button" data-act="unclaim">Unclaim</button>' : ''}
        ${active ? '<button class="act-btn" type="button" data-act="resolved">Resolve</button><button class="act-btn" type="button" data-act="closed">Close</button>' : ''}
        ${!active ? '<button class="act-btn" type="button" data-act="open">Reopen</button>' : ''}
      </div>
      <p class="dim" id="sup-msg"></p>
    </div>`;
    if (!keepScroll) detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    detailEl.querySelector('#sup-close').onclick = () => { activeId = null; detailEl.innerHTML = ''; };
    detailEl.querySelector('#sup-send').onclick = async () => {
      const ta = detailEl.querySelector('#sup-reply');
      const body = ta.value.trim();
      if (!body) return;
      const internal = detailEl.querySelector('#sup-internal').checked;
      const { status: sc, data: d2 } = await api('/api/tickets/' + encodeURIComponent(id) + '/reply', {
        method: 'POST', body: JSON.stringify({ body, internal }),
      });
      const msg = detailEl.querySelector('#sup-msg');
      if (sc === 200) { openDetail(id, true); loadQueue(); }
      else if (msg) msg.textContent = d2.error || 'Couldn’t send.';
    };
    detailEl.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = async () => {
        const act = b.dataset.act;
        const msg = detailEl.querySelector('#sup-msg');
        b.disabled = true;
        let res;
        if (act === 'claim') res = await api('/api/tickets/' + encodeURIComponent(id) + '/claim', { method: 'POST', body: '{}' });
        else if (act === 'unavailable') res = await api('/api/tickets/' + encodeURIComponent(id) + '/unavailable', { method: 'POST', body: '{}' });
        else if (act === 'unclaim') res = await api('/api/tickets/' + encodeURIComponent(id) + '/status', { method: 'POST', body: JSON.stringify({ action: 'unclaim' }) });
        else res = await api('/api/tickets/' + encodeURIComponent(id) + '/status', { method: 'POST', body: JSON.stringify({ status: act }) });
        if (res.status === 200) { openDetail(id, true); loadQueue(); loadNotifs(); }
        else if (msg) { msg.textContent = res.data.error === 'already_claimed' ? `Already claimed by ${res.data.claimed_by_name || 'someone else'}.` : (res.data.error || 'Action failed.'); b.disabled = false; }
      };
    });
  }

  // ticking "open for" labels + periodic refresh
  setInterval(() => {
    const now = Date.now();
    root.querySelectorAll('[data-openfor]').forEach((el) => {
      const t = tickets.find((x) => x.id === el.dataset.openfor);
      if (t) el.textContent = fmtElapsed(now - Date.parse(t.created_at));
    });
  }, 30000);
  setInterval(() => { loadQueue(); loadNotifs(); }, 60000);

  await loadNotifs();
  await loadQueue();
}

// ---------------- team log (ticket events, claims highlighted) ----
const EVENT_TEXT = {
  created: 'filed a ticket', claimed: '✋ claimed', unclaimed: 'unclaimed',
  replied: 'replied on', status: 'changed status on', unavailable: 'marked Not Available on',
};
export async function mountTeamLog(root) {
  injectCss();
  async function load() {
    const { status, data } = await api('/api/tickets/events?limit=40');
    if (status !== 200) { root.innerHTML = '<p class="dim">Couldn’t load the team log.</p>'; return; }
    const evs = data.events || [];
    root.innerHTML = evs.length ? evs.map((e) => `
      <div class="sup-log-row">
        <span class="${e.event === 'claimed' ? 'ev-claimed' : e.event === 'unavailable' ? 'ev-unavailable' : ''}">${esc(EVENT_TEXT[e.event] || e.event)}</span>
        — <b>${esc(e.actor_name || e.actor || 'someone')}</b> · ${esc(e.category_label)} <span style="font-family:monospace">${esc(e.ref)}</span>
        <span class="dim">(${esc(e.submitter_name || '')}) · ${esc(fmtDate(e.created_at))}</span>
      </div>`).join('') : '<p class="dim">No ticket activity yet.</p>';
  }
  await load();
  setInterval(load, 60000);
}

// ---------------- support alert preferences (email forward / SMS) ----
export async function mountNotifyPrefs(root) {
  injectCss();
  root.innerHTML = '<p class="dim">Loading…</p>';
  const { status, data } = await api('/api/notify-prefs');
  if (status !== 200) { root.innerHTML = '<p class="dim">Couldn’t load preferences.</p>'; return; }
  const p = data.prefs || {};
  root.innerHTML = `
    <div class="notif-row"><span>Email me the <b>full submission</b> for new tickets in my categories</span>
      <label class="switch"><input type="checkbox" id="np-email" ${p.email_opt_in ? 'checked' : ''}><span class="tk"></span></label></div>
    <div class="notif-row"><span>SMS me a short alert for new tickets</span>
      <label class="switch"><input type="checkbox" id="np-sms" ${p.sms_opt_in ? 'checked' : ''}><span class="tk"></span></label></div>
    <input id="np-phone" type="tel" placeholder="Mobile number for SMS alerts (e.g. +1 555 123 4567)"
      value="${esc(p.phone || '')}" style="width:100%;box-sizing:border-box;background:#0d0d15;border:1px solid var(--line);
      border-radius:8px;color:var(--text);padding:10px 12px;font-size:.9rem;margin-top:8px">
    ${data.sms_active ? '' : '<p class="dim" style="margin-top:8px">SMS is not connected yet — your opt-in is saved and starts working as soon as the owner connects an SMS provider. Dashboard + Discord + email alerts are live now.</p>'}
    <div style="margin-top:12px"><button class="save-btn" id="np-save" type="button" style="margin-top:0">Save</button>
    <span class="save-msg" id="np-status"></span></div>`;
  root.querySelector('#np-save').onclick = async () => {
    const st = root.querySelector('#np-status');
    st.className = 'save-msg'; st.textContent = 'Saving…';
    const { status: sc } = await api('/api/notify-prefs', {
      method: 'PUT',
      body: JSON.stringify({
        email_opt_in: root.querySelector('#np-email').checked,
        sms_opt_in: root.querySelector('#np-sms').checked,
        phone: root.querySelector('#np-phone').value.trim() || null,
      }),
    });
    st.className = 'save-msg ' + (sc === 200 ? 'ok' : 'err');
    st.textContent = sc === 200 ? 'Saved.' : 'Couldn’t save — try again.';
  };
}

// ---------------- profile: my requests + thread ----
export async function mountMyRequests(root) {
  injectCss();
  root.innerHTML = '<p class="dim">Loading…</p>';
  const { status, data } = await api('/api/tickets/mine');
  if (status !== 200) { root.innerHTML = '<p class="dim">Couldn’t load your requests.</p>'; return; }
  const mine = data.tickets || [];
  if (!mine.length) { root.innerHTML = '<p class="dim">No requests yet — anything you submit through our forms lands here.</p>'; return; }
  root.innerHTML = mine.map((t) => {
    const [cls, label] = STATUS_PILL[t.status] || ['', t.status];
    return `<div class="sup-ticket" data-mid="${esc(t.id)}">
      <div class="hd"><span class="ref">${esc(t.ref)}</span>
      <span class="badge cat">${esc(t.category_label)}</span>
      <span class="pill ${cls}">${label}</span></div>
      ${t.summary ? `<p class="sum">${esc(t.summary)}</p>` : ''}
      <p class="meta">${esc(fmtDate(t.created_at))}${t.claimed_by_name ? ` · claimed by ${esc(t.claimed_by_name)}` : ''}</p>
    </div><div data-mthread="${esc(t.id)}"></div>`;
  }).join('');
  root.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-mid]');
    if (!card || e.target.closest('button, textarea')) return;
    const id = card.dataset.mid;
    const slot = root.querySelector(`[data-mthread="${CSS.escape(id)}"]`);
    if (slot.dataset.open) { slot.innerHTML = ''; delete slot.dataset.open; return; }
    slot.dataset.open = '1';
    const { status: sc, data: d } = await api('/api/tickets/' + encodeURIComponent(id) + '/thread');
    if (sc !== 200) { slot.innerHTML = '<p class="dim">Couldn’t open this thread.</p>'; return; }
    const msgs = (d.messages || []).map((m) => `
      <div class="sup-msg ${m.author_kind === 'staff' ? 'staff' : 'submitter'}">
        <div class="who">${esc(m.author_name || m.author_kind)} · ${esc(fmtDate(m.created_at))}</div>${esc(m.body)}</div>`).join('');
    slot.innerHTML = `<div class="sup-detail">
      <div class="sup-thread">${msgs || '<p class="dim">No messages yet.</p>'}</div>
      <div class="composer"><textarea rows="2" maxlength="4000" placeholder="Reply…" data-mreply="${esc(id)}"></textarea>
      <button type="button" data-msend="${esc(id)}">Send</button></div>
      <p class="dim" data-mmsg></p></div>`;
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-msend]');
    if (!b) return;
    const id = b.dataset.msend;
    const ta = root.querySelector(`[data-mreply="${CSS.escape(id)}"]`);
    const body = ta.value.trim();
    if (!body) return;
    b.disabled = true;
    const { status: sc } = await api('/api/tickets/' + encodeURIComponent(id) + '/reply', {
      method: 'POST', body: JSON.stringify({ body }),
    });
    if (sc === 200) location.reload();
    b.disabled = false;
  });
}
