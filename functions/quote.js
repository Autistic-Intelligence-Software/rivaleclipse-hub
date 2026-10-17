// POST /quote — quote-request form handler (Cloudflare Pages Function).
// Env vars: RESEND_API_KEY (required), TO_EMAIL (default: Shane.GopherGo@gmail.com),
//           FROM_EMAIL (default: hire@rivaleclipse.dev — must be on the verified Resend domain).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('origin') || '';
  const TO = env.TO_EMAIL || 'Shane.GopherGo@gmail.com';
  const FROM = env.FROM_EMAIL || 'hire@rivaleclipse.dev';
  const apiKey = env.RESEND_API_KEY || '';

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'bad_request' }, 400, origin); }

  // Honeypot: bots fill it, humans can't see it.
  if (body.company) return json({ ok: true }, 200, origin);

  const name = String(body.name || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().slice(0, 120);
  const type = String(body.type || '').trim().slice(0, 60);
  const budget = String(body.budget || '').trim().slice(0, 60);
  const details = String(body.details || '').trim().slice(0, 2000);

  if (!name || !details || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'invalid' }, 400, origin);
  }
  if (!apiKey) {
    console.log('quote form misconfigured: RESEND_API_KEY missing');
    return json({ ok: false, error: 'unavailable' }, 503, origin);
  }

  const html =
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">' +
    '<h2 style="margin:0 0 16px">New quote request — hire.rivaleclipse.dev</h2>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px">' +
    row('Name', name) + row('Email', email) + row('Project type', type) + row('Budget', budget) +
    '</table>' +
    '<h3 style="margin:20px 0 8px">Details</h3>' +
    '<div style="background:#f4f4f4;border-radius:8px;padding:16px;white-space:pre-wrap;font-size:14px">' +
    esc(details) + '</div></div>';
  const text = `New quote request\nName: ${name}\nEmail: ${email}\nType: ${type}\nBudget: ${budget}\n\n${details}`;

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Rival Eclipse Hire <${FROM}>`,
        to: TO,
        reply_to: email,
        subject: `Quote request: ${type || 'project'} (${budget || 'no budget given'}) — ${name}`,
        html, text,
      }),
    });
  } catch { return json({ ok: false, error: 'send_failed' }, 502, origin); }
  if (!res.ok) {
    try { console.log('resend error', await res.text()); } catch { /* ignore */ }
    return json({ ok: false, error: 'send_failed' }, 502, origin);
  }
  return json({ ok: true }, 200, origin);

  function row(k, v) {
    return `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td>` +
      `<td style="padding:6px 0"><b>${esc(v) || '—'}</b></td></tr>`;
  }
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request.headers.get('origin') || '') });
}

function json(obj, status = 200, origin = '') {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}
function cors(origin) {
  const allowed = ['https://www.rivaleclipse.dev', 'https://rivaleclipse.dev'];
  const allow = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
