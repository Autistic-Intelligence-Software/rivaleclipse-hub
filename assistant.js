// Rival Eclipse site-wide AI assistant widget (vanilla JS, no dependencies).
// Include as <script src="/assistant.js"></script> before </body>.
// Injects a floating chat button + panel; talks to POST /api/assistant/chat.
(function () {
  if (window.__reAssistantInit) return;
  window.__reAssistantInit = true;

  const css = `
.re-assist-btn{position:fixed;right:20px;bottom:20px;z-index:9999;width:56px;height:56px;border-radius:50%;
  border:1px solid #d4af37;background:linear-gradient(135deg,#1d1a10,#0d0d15);color:#d4af37;font-size:26px;
  cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
.re-assist-btn:hover{transform:translateY(-2px)}
.re-assist-panel{position:fixed;right:20px;bottom:88px;z-index:9999;width:min(380px,calc(100vw - 40px));
  max-height:min(520px,calc(100vh - 130px));display:flex;flex-direction:column;border:1px solid #3a3a48;
  border-radius:14px;background:#0d0d15;box-shadow:0 12px 40px rgba(0,0,0,.6);overflow:hidden}
.re-assist-head{padding:12px 16px;border-bottom:1px solid #2a2a35;font-weight:700;display:flex;
  justify-content:space-between;align-items:center}
.re-assist-head .x{background:none;border:none;color:#9a9ab0;font-size:18px;cursor:pointer;line-height:1}
.re-assist-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:120px}
.re-assist-msg{padding:9px 13px;border-radius:12px;font-size:.9rem;line-height:1.55;max-width:90%;white-space:pre-wrap;word-wrap:break-word}
.re-assist-msg.a{align-self:flex-start;background:#14141c;border:1px solid #2a2a35}
.re-assist-msg.u{align-self:flex-end;background:#1d1a10;border:1px solid #4a3f1c}
.re-assist-msg.typing{color:#9a9ab0;font-style:italic}
.re-assist-form{display:flex;gap:8px;padding:12px;border-top:1px solid #2a2a35}
.re-assist-form input{flex:1;background:#08080d;border:1px solid #3a3a48;border-radius:10px;color:#f0eefc;
  padding:10px 12px;font-size:.9rem;font-family:inherit;min-width:0}
.re-assist-form input:focus{outline:none;border-color:#d4af37}
.re-assist-form button{background:linear-gradient(135deg,#d4af37,#8a6d1c);color:#0a0a12;font-weight:800;
  border:none;border-radius:10px;padding:0 16px;cursor:pointer;font-size:.9rem;font-family:inherit}
.re-assist-form button:disabled{opacity:.5;cursor:default}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 're-assist-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Chat with the Rival Eclipse assistant');
  btn.textContent = '💬';
  // NOTE: visibility is driven by inline style.display, NOT the `hidden`
  // property — the CSS sets display:flex on both elements, and an author
  // display rule overrides the UA's [hidden] styling, so `hidden` alone
  // never actually hid anything (the panel's close button appeared dead).
  btn.style.display = 'none';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 're-assist-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="re-assist-head"><span>Rival Eclipse assistant</span><button class="x" aria-label="Close">&times;</button></div>
    <div class="re-assist-log"></div>
    <form class="re-assist-form">
      <input type="text" maxlength="2000" placeholder="Ask about our bots, services, or your account…" autocomplete="off">
      <button type="submit">Send</button>
    </form>`;
  document.body.appendChild(panel);

  const log = panel.querySelector('.re-assist-log');
  const form = panel.querySelector('.re-assist-form');
  const input = form.querySelector('input');
  const sendBtn = form.querySelector('button');
  const history = [];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const add = (text, cls) => {
    const d = document.createElement('div');
    d.className = 're-assist-msg ' + cls;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  };

  let opened = false;
  const isOpen = () => panel.style.display !== 'none';
  const open = () => {
    panel.style.display = 'flex';
    btn.style.display = 'none';
    if (!opened) {
      opened = true;
      add("Hi! I'm the Rival Eclipse assistant. Ask me about our bots, services, pricing, or how to use your account.", 'a');
    }
    input.focus();
  };
  const close = () => { panel.style.display = 'none'; btn.style.display = ''; };

  btn.addEventListener('click', open);
  panel.querySelector('.x').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    add(text, 'u');
    input.value = '';
    history.push({ role: 'user', content: text });
    const typing = add('Thinking…', 'a typing');
    sendBtn.disabled = true;
    try {
      const r = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(-10) }),
      });
      const d = await r.json().catch(() => ({}));
      typing.remove();
      const reply = d.reply || 'Sorry — I couldn’t get an answer. Try /help/ for common questions.';
      add(reply, 'a');
      history.push({ role: 'assistant', content: reply });
      if (history.length > 10) history.splice(0, history.length - 10);
    } catch {
      typing.remove();
      add('Network hiccup — please try again in a moment, or check /help/.', 'a');
    } finally {
      sendBtn.disabled = false;
    }
  });

  // Reveal after DOM settles (keeps it from blocking first paint).
  requestAnimationFrame(() => { btn.style.display = ''; });
})();
