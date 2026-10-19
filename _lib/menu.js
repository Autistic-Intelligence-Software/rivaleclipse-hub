// Rival Eclipse site-wide account menu (vanilla JS, no dependencies).
// Include as <script src="/_lib/menu.js"></script> before </body> on every page.
// Top-right: Discord pfp avatar button -> dropdown (My profile, Dashboards,
// [owners only] Owner, Enter Promo code, Enter Team code, Sign out).
// Signed out -> "Sign in" button.
// Hides legacy per-page .user-chip blocks (the menu replaces them).
(function () {
  if (window.__reMenuInit) return;
  window.__reMenuInit = true;

  const AUTH = 'https://auth.rivaleclipse.dev';

  const css = `
.re-menu{position:fixed;top:14px;right:16px;z-index:9998;font-family:inherit}
.re-menu-btn{width:42px;height:42px;border-radius:50%;border:2px solid var(--accent,#d4af37);
  background:#14141c;color:var(--text,#f0eefc);cursor:pointer;overflow:hidden;padding:0;
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.05rem}
.re-menu-btn img{width:100%;height:100%;object-fit:cover;display:block}
.re-menu-btn:hover{transform:translateY(-1px)}
.re-menu-drop{position:absolute;top:50px;right:0;min-width:220px;background:#0d0d15;
  border:1px solid #3a3a48;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.6);
  padding:8px;display:none}
.re-menu-drop.open{display:block}
.re-menu-drop a,.re-menu-drop button{display:flex;width:100%;align-items:center;gap:10px;
  padding:11px 14px;border-radius:10px;color:var(--text,#f0eefc);text-decoration:none;
  font-size:.93rem;font-weight:600;background:none;border:none;cursor:pointer;
  font-family:inherit;text-align:left}
.re-menu-drop a:hover,.re-menu-drop button:hover{background:#17171f}
.re-menu-drop .sep{height:1px;background:#2a2a35;margin:6px 4px}
.re-menu-drop .who{padding:10px 14px 6px;color:var(--muted,#9a9ab0);font-size:.8rem;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.re-menu-signin{display:inline-block;background:linear-gradient(135deg,#d4af37,#8a6d1c);
  color:#0a0a12;font-weight:800;padding:10px 22px;border-radius:999px;text-decoration:none;
  font-size:.92rem}
.re-menu-signin:hover{transform:translateY(-1px)}`;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // The menu replaces legacy per-page account chips.
  document.querySelectorAll('.user-chip').forEach((el) => { el.style.display = 'none'; });

  const host = document.createElement('div');
  host.className = 're-menu';
  host.id = 're-account-menu';
  document.body.appendChild(host);

  async function getSession() {
    try {
      const r = await fetch(AUTH + '/api/session', { credentials: 'include' });
      if (r.status !== 200) return null;
      return await r.json().catch(() => null);
    } catch { return null; }
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '&gt;': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function avatarFor(s) {
    const d = (s && s.discord) || {};
    const u = (s && s.user) || {};
    if (d.id && d.avatar) {
      return `<img src="https://cdn.discordapp.com/avatars/${esc(d.id)}/${esc(d.avatar)}.png?size=96" alt="profile">`;
    }
    const initial = ((d.username || u.email || '?') + '?').trim().charAt(0).toUpperCase();
    return esc(initial);
  }

  function labelFor(s) {
    const d = (s && s.discord) || {};
    const u = (s && s.user) || {};
    return d.username ? '@' + d.username : (u.email || 'Account');
  }

  // Owner implies every tag; env-derived owners may not carry the tag yet.
  function isOwnerSession(s) {
    if (!s) return false;
    if (s.is_owner || (s.user && s.user.is_owner)) return true;
    const tags = (s.user && Array.isArray(s.user.tags)) ? s.user.tags : [];
    return tags.map((t) => String(t).toLowerCase()).includes('owner');
  }

  function renderSignedOut() {
    const next = encodeURIComponent(location.pathname + location.search);
    host.innerHTML = `<a class="re-menu-signin" href="/sign-in/?next=${next}">Sign in</a>`;
  }

  function renderSignedIn(s) {
    const ownerItem = isOwnerSession(s) ? '<a href="/owner/" role="menuitem">👑 Owner</a>' : '';
    host.innerHTML = `
      <button class="re-menu-btn" id="re-menu-btn" aria-label="Account menu" aria-haspopup="true">${avatarFor(s)}</button>
      <div class="re-menu-drop" id="re-menu-drop" role="menu">
        <div class="who">${esc(labelFor(s))}</div>
        <a href="/profile/" role="menuitem">👤 My profile</a>
        <a href="/dashboards/" role="menuitem">📊 Dashboards</a>
        ${ownerItem}
        <a href="/promo/" role="menuitem">🎟️ Enter Promo code</a>
        <a href="/team-code/" role="menuitem">🔑 Enter Team code</a>
        <div class="sep"></div>
        <button id="re-menu-signout" role="menuitem">🚪 Sign out</button>
      </div>`;
    const btn = document.getElementById('re-menu-btn');
    const drop = document.getElementById('re-menu-drop');
    const close = () => drop.classList.remove('open');
    btn.addEventListener('click', (e) => { e.stopPropagation(); drop.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!host.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.getElementById('re-menu-signout').addEventListener('click', async () => {
      try {
        await fetch(AUTH + '/api/logout', { method: 'POST', credentials: 'include' });
      } catch { /* fall through */ }
      location.href = '/';
    });
  }

  getSession().then((s) => {
    if (s && s.user) renderSignedIn(s);
    else renderSignedOut();
  });
})();
