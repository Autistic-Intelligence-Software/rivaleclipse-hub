// Rival Eclipse shared auth client (runs on www.rivaleclipse.dev).
// Talks to https://auth.rivaleclipse.dev. All calls include credentials.
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

export async function session() {
  const { status, data } = await api('/api/session');
  return status === 200 ? data : null;
}

export async function requestMagicLink(email, next) {
  return api('/api/magic/request', { method: 'POST', body: JSON.stringify({ email, next }) });
}

export function discordLogin(next, action = 'login') {
  const url = new URL(AUTH + '/auth/discord');
  url.searchParams.set('action', action);
  if (next) url.searchParams.set('next', next);
  location.href = url.toString();
}

export function logout() {
  return api('/api/logout', { method: 'POST' }).finally(() => { location.href = '/'; });
}

// ---- WebAuthn helpers ----
function b64ToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64url(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function toPublicKey(opts) {
  const out = { ...opts };
  out.challenge = b64ToBytes(opts.challenge);
  if (opts.user) out.user = { ...opts.user, id: b64ToBytes(opts.user.id) };
  if (opts.excludeCredentials) out.excludeCredentials = opts.excludeCredentials.map((c) => ({ ...c, id: b64ToBytes(c.id) }));
  if (opts.allowCredentials) out.allowCredentials = opts.allowCredentials.map((c) => ({ ...c, id: b64ToBytes(c.id) }));
  return out;
}
function credentialToJSON(cred) {
  return {
    id: cred.id, rawId: bytesToB64url(cred.rawId), type: cred.type,
    response: Object.fromEntries(Object.entries(cred.response).map(([k, v]) =>
      [k, v instanceof ArrayBuffer ? bytesToB64url(v) : v])),
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

export async function passkeyLogin(email) {
  if (!window.PublicKeyCredential) return { ok: false, error: 'unsupported' };
  const { status, data } = await api('/api/webauthn/login/options', {
    method: 'POST', body: JSON.stringify({ email }),
  });
  if (status !== 200) return { ok: false, error: data.error || 'options_failed' };
  if (!data.hasCredentials) return { ok: false, error: 'no_passkey' };
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: toPublicKey(data.options) });
  } catch { return { ok: false, error: 'cancelled' }; }
  const v = await api('/api/webauthn/login/verify', {
    method: 'POST', body: JSON.stringify({ email, ...credentialToJSON(cred) }),
  });
  return v.status === 200 ? { ok: true, needsDiscord: v.data.needsDiscord } : { ok: false, error: v.data.error };
}

export async function passkeyRegister(name) {
  if (!window.PublicKeyCredential) return { ok: false, error: 'unsupported' };
  const { status, data } = await api('/api/webauthn/register/options', { method: 'POST', body: '{}' });
  if (status !== 200) return { ok: false, error: data.error || 'options_failed' };
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: toPublicKey(data.options) });
  } catch { return { ok: false, error: 'cancelled' }; }
  const v = await api('/api/webauthn/register/verify', {
    method: 'POST', body: JSON.stringify({ name, ...credentialToJSON(cred) }),
  });
  return v.status === 200 ? { ok: true } : { ok: false, error: v.data.error };
}

export async function packages() {
  const { status, data } = await api('/api/packages');
  return status === 200 ? data.packages : [];
}

export async function registerIntent(kind) {
  return api('/api/account/intent', { method: 'POST', body: JSON.stringify({ intent: kind }) });
}

export function nextUrl() {
  return new URLSearchParams(location.search).get('next') || '';
}
