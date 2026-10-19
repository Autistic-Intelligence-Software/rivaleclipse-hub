// POST /quote — project brief form handler (Cloudflare Pages Function).
//
// Flow: validate fields -> moderate uploaded images (Sightengine) -> build a zip
// (brief.json + read-only brief.html + images) -> deliver:
//   - if DISCORD_WEBHOOK_URL is set: POST the zip to the Discord channel webhook
//   - else: email the zip to the owner via Resend as a fallback (Discord wiring comes later)
//
// Env vars:
//   RESEND_API_KEY      - re_... key for notification emails
//   TO_EMAIL            - owner email (default: Shane.GopherGo@gmail.com)
//   FROM_EMAIL          - sender on verified domain (default: hire@rivaleclipse.dev)
//   DISCORD_WEBHOOK_URL - channel webhook for brief delivery (optional for now)
// Bindings:
//   AI                  - Workers AI binding (image moderation via LLaVA vision model)

const MAX_FILES = 3;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB per image
const MAX_TEXT = 2000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, n = MAX_TEXT) => String(v ?? '').trim().slice(0, n);
const slug = (s) => clean(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'brief';

// ---------- minimal ZIP writer (stored, no compression) ----------
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(entries) {
  // entries: [{name, data: Uint8Array}] — names must be ASCII-safe
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dostime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosdate = ((((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate())) & 0xFFFF;
  for (const e of entries) {
    const nameB = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, 0, true);      // stored
    lh.setUint16(10, dostime, true);
    lh.setUint16(12, dosdate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, e.data.length, true);
    lh.setUint32(22, e.data.length, true);
    lh.setUint16(26, nameB.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dostime, true); ch.setUint16(14, dosdate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, e.data.length, true); ch.setUint32(24, e.data.length, true);
    ch.setUint16(28, nameB.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + e.data.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) { chunks.push(c); centralSize += c.length; }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  chunks.push(new Uint8Array(end.buffer));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

// ---------- image moderation (Cloudflare Workers AI vision) ----------
// Uses the Workers AI binding `AI` (no external account or key needed).
// Fail closed: if the binding is missing or the check errors, uploads are refused.
async function moderateImage(env, bytes, filename) {
  if (!env.AI) return { ok: false, reason: 'scanner_unavailable' };
  let res;
  try {
    res = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
      image: [...bytes],
      prompt: 'Look at this image. Does it show any of the following: (1) nudity, sexual acts, or sexually explicit content, (2) gore, blood, dismemberment, or graphic injury, (3) shocking violent content? Answer with exactly one word: YES or NO.',
      max_tokens: 8,
    });
  } catch (e) {
    console.log('moderation model error', String(e));
    return { ok: false, reason: 'scanner_error' };
  }
  const answer = String(res && res.response || res && res.description || '').trim().toUpperCase();
  if (!answer) {
    console.log('moderation model gave no answer');
    return { ok: false, reason: 'scanner_error' };
  }
  if (/\bYES\b/.test(answer)) return { ok: false, reason: 'flagged' };
  return { ok: true };
}

// ---------- read-only brief (packed into the zip) ----------
function briefHtml(d) {
  const row = (k, v) => v
    ? `<tr><td>${esc(k)}</td><td><b>${esc(v).replace(/\n/g, '<br>')}</b></td></tr>` : '';
  const colors = (d.colors || []).join(', ');
  const features = (d.features || []).join(', ');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Project brief — ${esc(d.name)}</title>
<style>body{font-family:sans-serif;max-width:640px;margin:0 auto;padding:32px;color:#222}
h1{font-size:24px}table{border-collapse:collapse;width:100%;font-size:14px}
td{padding:8px 12px 8px 0;vertical-align:top;border-bottom:1px solid #eee}
td:first-child{color:#666;white-space:nowrap;width:180px}
.badge{display:inline-block;background:#f3d27a;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:bold}
.imgs img{max-width:180px;max-height:180px;margin:6px;border:1px solid #ddd;border-radius:8px}</style>
</head><body><span class="badge">PROJECT BRIEF — READ ONLY</span>
<h1>${esc(d.name)} <span style="font-weight:normal;color:#666">· ${esc(d.type)}</span></h1>
<table>
${row('Submitted', d.submitted)}${row('Name', d.name)}${row('Email', d.email)}${row('Phone', d.phone)}
${row('Project type', d.type)}${row('Budget', d.budget)}${row('Brand colors', colors)}
${row('Color rule', d.color_mode === 'exclusive' ? 'ONLY the selected colors' : 'Selected colors are a preference')}
${row('Business address', d.address)}${row('Business hours', d.hours)}${row('Slogan', d.slogan)}
${row('Services / products', d.services)}
${row('Optional features', features)}
</table>
<h3>Project details</h3><p>${esc(d.details).replace(/\n/g, '<br>')}</p>
${d.extra ? `<h3>Extra information</h3><p>${esc(d.extra).replace(/\n/g, '<br>')}</p>` : ''}
${(d.images || []).length ? `<h3>Uploaded images (${d.images.length})</h3><div class="imgs">` +
  d.images.map((f) => `<img src="${esc(f)}" alt="upload">`).join('') + `</div>` : ''}
<p style="color:#999;font-size:12px;margin-top:32px">Submitted via rivaleclipse.dev/dev-request — unedited applicant data.</p>
</body></html>`;
}

// ---------- account gate helpers ----------
// Forward the browser's cookies to the auth service so it can log the request
// against the signed-in account (and enforce the one-request-per-week limit).
async function logRequestWithAuth(cookie, category, features) {
  try {
    const res = await fetch('https://auth.rivaleclipse.dev/api/requests/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      // auth tolerates extra keys — features ride along so the auth service can
      // log the optional-feature selections with the request.
      body: JSON.stringify({ category, features: features || [] }),
    });
    return res.status;
  } catch (e) {
    console.log('requests/log fetch failed', String(e));
    return 'network_error';
  }
}
// Where the client should return after signing in (taken from the Referer).
function nextPath(request) {
  try {
    const ref = new URL(request.headers.get('referer') || '');
    if (['www.rivaleclipse.dev', 'rivaleclipse.dev'].includes(ref.hostname)) {
      return ref.pathname + ref.search;
    }
  } catch { /* fall through */ }
  return '/dev-request/';
}

// ---------- email fallback (Resend) ----------
async function sendViaResend(env, to, from, subject, html, text, zipName, zipBytes) {
  const apiKey = env.RESEND_API_KEY || '';
  if (!apiKey) return 'not_configured';
  const payload = {
    from: `Rival Eclipse Hire <${from}>`, to, subject, html, text,
  };
  if (zipBytes) {
    payload.attachments = [{ filename: zipName, content: b64(zipBytes) }];
  }
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { return 'send_failed'; }
  if (!res.ok) {
    try { console.log('resend error', await res.text()); } catch { /* ignore */ }
    return 'send_failed';
  }
  return 'sent';
}

// ---------- main handler ----------
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('origin') || '';
  const TO = env.TO_EMAIL || 'Shane.GopherGo@gmail.com';
  const FROM = env.FROM_EMAIL || 'hire@rivaleclipse.dev';
  const WEBHOOK = env.DISCORD_WEBHOOK_URL || '';

  const ctype = request.headers.get('content-type') || '';
  let fd;
  if (ctype.includes('multipart/form-data')) {
    try { fd = await request.formData(); } catch { return json({ ok: false, error: 'bad_request' }, 400, origin); }
  } else {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400, origin); }
    fd = new FormData();
    for (const [k, v] of Object.entries(body)) {
      if (Array.isArray(v)) v.forEach((x) => fd.append(k, String(x)));
      else fd.append(k, String(v ?? ''));
    }
  }
  const get = (k) => clean(fd.get(k));

  if (fd.get('company')) return json({ ok: true }, 200, origin); // honeypot

  const d = {
    category: get('category').slice(0, 40) || 'business',
    name: get('name').slice(0, 80),
    email: get('email').slice(0, 120),
    phone: get('phone').slice(0, 40),
    type: get('type').slice(0, 60),
    budget: get('budget').slice(0, 60),
    details: get('details'),
    colors: fd.getAll('colors').map((c) => clean(c, 30)).filter(Boolean).slice(0, 16),
    color_mode: get('color_mode') === 'exclusive' ? 'exclusive' : 'preference',
    address: get('address').slice(0, 300),
    hours: get('hours').slice(0, 200),
    slogan: get('slogan').slice(0, 200),
    services: get('services'),
    extra: get('extra'),
    features: fd.getAll('features').map((f) => clean(f, 60)).filter(Boolean).slice(0, 24),
    submitted: new Date().toISOString(),
  };
  if (!d.name || !d.details || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    return json({ ok: false, error: 'invalid' }, 400, origin);
  }

  // ---- account gate: sign-in required; one dev request per week per account ----
  // The session cookie (set by auth.rivaleclipse.dev on .rivaleclipse.dev) is
  // forwarded to the auth service's rate-limit endpoint before anything delivers.
  const cookie = request.headers.get('cookie') || '';
  if (!cookie) {
    return json({ ok: false, error: 'not_signed_in', next: nextPath(request) }, 401, origin);
  }
  const logStatus = await logRequestWithAuth(cookie, d.category, d.features);
  if (logStatus === 429) {
    return json({ ok: false, error: 'rate_limited' }, 429, origin);
  }
  if (logStatus !== 200) {
    // Graceful degradation: 401/404/500/network failures from the auth service
    // must never kill the form — log it and continue with delivery.
    console.log('requests/log returned', logStatus, '— continuing with delivery');
  }

  // ---- images: up to 3, image/*, <= 4MB each, moderated ----
  const uploads = fd.getAll('images').filter((f) => f && typeof f.arrayBuffer === 'function' && f.size > 0);
  if (uploads.length > MAX_FILES) {
    return json({ ok: false, error: 'too_many_files' }, 400, origin);
  }
  const images = [];
  for (const f of uploads) {
    const fname = clean(f.name || 'upload', 80).replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
    if (!/^image\//.test(f.type || '')) {
      return json({ ok: false, error: 'bad_file_type', detail: fname }, 400, origin);
    }
    if (f.size > MAX_FILE_BYTES) {
      return json({ ok: false, error: 'file_too_large', detail: fname }, 400, origin);
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    const mod = await moderateImage(env, bytes, fname);
    if (!mod.ok) {
      if (mod.reason === 'scanner_unavailable' || mod.reason === 'scanner_error') {
        return json({ ok: false, error: 'uploads_unavailable' }, 503, origin);
      }
      return json({ ok: false, error: 'image_rejected', detail: fname }, 400, origin);
    }
    images.push({ filename: fname, bytes });
  }

  // ---- pack the zip: read-only brief + raw data + images ----
  const zipName = `project-brief-${slug(d.name)}-${Date.now()}.zip`;
  const enc = new TextEncoder();
  const entries = [
    { name: 'brief.json', data: enc.encode(JSON.stringify({ ...d, images: images.map((i) => i.filename) }, null, 2)) },
    { name: 'brief.html', data: enc.encode(briefHtml({ ...d, images: images.map((i) => i.filename) })) },
    ...images.map((i) => ({ name: 'images/' + i.filename, data: i.bytes })),
  ];
  const zipBytes = buildZip(entries);

  // ---- deliver ----
  if (WEBHOOK) {
    const dfd = new FormData();
    dfd.append('payload_json', JSON.stringify({
      content: `📋 New project brief: **${d.name}** (${d.type || 'project'}, ${d.budget || 'no budget given'}) — ${images.length} image(s)`,
    }));
    dfd.append('file', new Blob([zipBytes], { type: 'application/zip' }), zipName);
    try {
      const res = await fetch(WEBHOOK, { method: 'POST', body: dfd });
      if (!res.ok) throw new Error('webhook ' + res.status);
    } catch (e) {
      console.log('discord webhook failed', String(e));
      return json({ ok: false, error: 'delivery_failed' }, 502, origin);
    }
    return json({ ok: true, delivery: 'discord' }, 200, origin);
  }

  // Fallback until Discord is wired: email the zip to the owner.
  const colorLine = d.colors.length
    ? `Brand colors: ${d.colors.join(', ')} (${d.color_mode === 'exclusive' ? 'ONLY these' : 'preference'})` : '';
  const html =
    `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">` +
    `<h2>New project brief — rivaleclipse.dev/dev-request</h2>` +
    `<p><b>${esc(d.name)}</b> &lt;${esc(d.email)}&gt;${d.phone ? ' · ' + esc(d.phone) : ''}</p>` +
    `<p>Type: <b>${esc(d.type) || '—'}</b> · Budget: <b>${esc(d.budget) || '—'}</b><br>${esc(colorLine)}</p>` +
    (d.features && d.features.length ? `<p><b>Optional features:</b> ${esc(d.features.join(', '))}</p>` : '') +
    `<p>${esc(d.details).replace(/\n/g, '<br>')}</p>` +
    (d.services ? `<p><b>Services/products:</b><br>${esc(d.services).replace(/\n/g, '<br>')}</p>` : '') +
    (d.extra ? `<p><b>Extra:</b><br>${esc(d.extra).replace(/\n/g, '<br>')}</p>` : '') +
    `<p style="color:#999;font-size:12px">Full brief + ${images.length} image(s) attached as ${esc(zipName)}. Discord delivery pending webhook setup.</p></div>`;
  const sent = await sendViaResend(env, TO, FROM,
    `Project brief [${d.category}]: ${d.type || 'project'} — ${d.name}`,
    html,
    `New project brief from ${d.name} <${d.email}>\n` +
    (d.features && d.features.length ? `Optional features: ${d.features.join(', ')}\n\n` : '') +
    `${d.details}`,
    zipName, zipBytes);
  if (sent !== 'sent') {
    console.log('brief email failed:', sent);
    return json({ ok: false, error: 'delivery_failed' }, 502, origin);
  }
  return json({ ok: true, delivery: 'email' }, 200, origin);
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
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
