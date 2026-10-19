// Rival Eclipse shared gate helpers — ONE place for tags/owner/Discord checks.
// Code DEFENSIVELY: the auth service is migrating from a single `role`
// string to stackable `user.tags[]`. Until that deploy lands everywhere,
// derive tags from the legacy role field. Never read `role` directly.
export function tagsOf(s) {
  if (!s) return [];
  const u = s.user || {};
  if (Array.isArray(u.tags)) return u.tags.map((x) => String(x).toLowerCase());
  const role = String(u.role || '').toLowerCase();
  return role && role !== 'user' ? [role] : [];
}

export function isOwnerOf(s) {
  return !!((s && s.is_owner) ?? (s && s.user && s.user.is_owner));
}

// Owner implies every tag.
export function hasTag(s, tag) {
  return isOwnerOf(s) || tagsOf(s).includes(String(tag).toLowerCase());
}

export function hasDiscord(s) {
  return !!((s && s.has_discord) ?? !!(s && s.discord));
}

// Friendly interstitial URL. reason: signin | discord | tag | admin
export function blockedUrl(reason, next, extra) {
  const p = new URLSearchParams({ reason });
  if (next) p.set('next', next);
  if (extra) {
    for (const k of Object.keys(extra)) if (extra[k] != null && extra[k] !== '') p.set(k, extra[k]);
  }
  return '/blocked/?' + p.toString();
}

// Page-load gate: redirect to the interstitial (throws to halt).
export function goBlocked(reason, next, extra) {
  location.href = blockedUrl(reason, next, extra);
  throw new Error('blocked:' + reason);
}

// Cloudflare functions: JSON { blocked: { reason, next } } for XHR,
// 302 to /blocked/ for page loads.
export function blockedResponse(reason, next, extra, request) {
  const url = blockedUrl(reason, next, extra);
  const accept = (request && request.headers.get('accept')) || '';
  if (accept.includes('text/html')) {
    return new Response(null, { status: 302, headers: { Location: url } });
  }
  return new Response(
    JSON.stringify({ ok: false, blocked: { reason, next: next || null, ...(extra || {}) } }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

// Keep `next` same-origin: must be a path, never //host or scheme.
export function safeNext(v, fallback) {
  if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) return v;
  return fallback || '/dashboards/';
}
