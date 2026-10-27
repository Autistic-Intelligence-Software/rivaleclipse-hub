// Dual-run helper (2026-10-27): file a support ticket alongside a form's
// existing submission path. The form's original handler stays in charge —
// this only mirrors the submission into the ticket system and returns the
// ticket reference (or null on any failure, silently).
window.fileTicket = function (form, ticketCategory) {
  try {
    const fd = new FormData(form);
    if (String(fd.get('company') || '').trim() !== '') return Promise.resolve(null); // honeypot tripped
    const payload = {};
    fd.forEach((v, k) => {
      if (typeof v !== 'string') return; // skip file inputs
      const val = v.trim();
      if (val === '') return;
      if (payload[k] === undefined) payload[k] = val;
      else if (Array.isArray(payload[k])) payload[k].push(val);
      else payload[k] = [payload[k], val];
    });
    return fetch('https://auth.rivaleclipse.dev/api/tickets', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: ticketCategory,
        name: payload.name || '', email: payload.email || '', payload,
      }),
    }).then((r) => r.json()).then((d) => (d && d.ok ? d.ref : null)).catch(() => null);
  } catch { return Promise.resolve(null); }
};
