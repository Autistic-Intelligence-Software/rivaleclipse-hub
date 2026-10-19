// POST /api/site-check — go-live check for the /handoff/ walkthrough.
//
// Takes { url } and reports whether the address is reachable. Used so the
// check runs server-side (no CORS issues from the browser).
// SSRF guard: only http/https, and private/internal hostnames are rejected.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  // IPv4 private ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
  }
  return false;
}

export async function onRequestPost({ request }) {
  let url;
  try {
    ({ url } = await request.json());
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    return json({ ok: false, error: 'invalid_url' }, 400);
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    return json({ ok: false, error: 'invalid_url' }, 400);
  }
  if (isPrivateHost(u.hostname)) {
    return json({ ok: false, error: 'private_host' }, 400);
  }
  try {
    const res = await fetch(u.toString(), {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    // Any HTTP response (even 404/405) means the address is reachable.
    return json({ ok: true, reachable: true, status: res.status });
  } catch {
    return json({ ok: true, reachable: false });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
