// POST /api/assistant/chat — site-wide AI assistant for the hub (Cloudflare Pages Function).
//
// Body: { message: string, history: [{role, content}] (cap 10) }.
// Role is determined by forwarding the request's Cookie to the auth service;
// falls back to "guest". Rate limit: 20 requests/hour per IP (in-memory Map).
// Text model: @cf/meta/llama-3.1-8b-instruct (primary), @cf/meta/llama-3-8b-instruct fallback.
// Env: AI (Workers AI binding).

const MODELS = [
  '@cf/meta/infire-llama-3.1-8b-instruct',
  '@cf/mistral/mistral-7b-instruct-v0.2',
  '@cf/qwen/qwen1.5-14b-chat-awq',
];
// NOTE (verified live 2026-10-19): @cf/meta/llama-3.1-8b-instruct was deprecated
// by Cloudflare on 2026-05-30 (error 5028); infire-llama-3.1-8b-instruct is its successor.
const LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map(); // ip -> [timestamps]

function clientIp(request) {
  const h = request.headers;
  return h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}
function allowed(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= LIMIT) return false;
  arr.push(now);
  hits.set(ip, arr);
  return true;
}
async function roleOf(request) {
  try {
    const cookie = request.headers.get('cookie') || '';
    if (!cookie) return 'guest';
    const r = await fetch('https://auth.rivaleclipse.dev/api/session', {
      headers: { cookie },
      redirect: 'manual',
    });
    if (r.status !== 200) return 'guest';
    const d = await r.json().catch(() => null);
    if (d?.is_owner ?? d?.user?.is_owner) return 'admin'; // owner sees the admin guidance
    // Stackable tags (defensive: fall back to the legacy single role).
    const tags = Array.isArray(d?.user?.tags)
      ? d.user.tags.map((t) => String(t).toLowerCase())
      : [String(d?.user?.role || 'user').toLowerCase()];
    for (const tier of ['admin', 'team', 'tester', 'client', 'user']) {
      if (tags.includes(tier)) return tier;
    }
    return 'user';
  } catch {
    return 'guest';
  }
}

const BASE_KB = `Rival Eclipse (www.rivaleclipse.dev) knowledge:
- 8 Discord bots, all FREE while in beta: Bouncer (anti-scam moderation, quarantine), Chat-Mate (channel content enforcement, pattern learning, Ask-to-DM), Tim (AI chatbot; owners bring their own OpenAI/Gemini/Anthropic key), VibeCheck (pulse surveys, vibe ratings, rep system), FreeMium JayRain (music bot; host your own node = free forever, $1.49/mo Mobile tier free during beta), Voice-Cord (cross-server voice rooms), Navi-Bot (opt-in ping panels — VC/stream alerts), Board-Cord (multiplayer chat games, Battleships today, chess next). Add any of them from /apps-bots/ (Add to Server buttons live there).
- Web apps live at app.rivaleclipse.dev (portal page /web-apps/ describes them): GIF-to-QR Converter (5 free generations, $0.99 for unlimited; app.rivaleclipse.dev/GIF-2-QR) and Perpetual Helper (live crypto perpetual tracker — over/under predictions for the cycle close refreshed every 3 seconds, snipe alerts, self-scoring; free in the browser at app.rivaleclipse.dev/Market-Tracker plus a floating Android app — APK download linked on /web-apps/ and beside the tracker).
- Custom dev services: quote via /dev-request/ (basic users limited to 1 request/week); business owners and brand ambassadors apply at /apply/.
- Sign-in: one account for everything — magic link email (check spam), passkeys/biometrics, one-time Discord pairing. Every *.rivaleclipse.dev dashboard then opens without another login.
- Roles: user, client, tester, team, admin (promotions handled by the team).
- Key pages: / (home — Browse as guest, Discord Bots, Web Apps, Website demos, Request Build from Dev team, plus dashboards/help/legal boxes), /products/ (guest catalog — browse everything, no account needed), /dashboards/ (post-login hub), /apps-bots/ (Discord Bots portal), /web-apps/ (Web Apps portal), https://demos.rivaleclipse.dev (website demos), /dev-request/, /apply/, /client/ (client portal), /team/ (team area), /admin/ (admin area), /help/ (FAQs, support, feedback, contact), /ToS-Privacy-legal/ (site-wide + per-app legal pages).`;

const ROLE_NOTES = {
  guest: 'The visitor is not signed in: public info only. Invite them to sign in at /sign-in/ or register at /sign-up/ for account features.',
  user: 'Signed-in user: product help, account guidance (sign-in methods, subscriptions), and how to use /dashboards/, /dev-request/, /apply/.',
  client: 'Client: everything for users, plus client-portal guidance (/client/ and /client/dashboard/): message the team, edit their enabled business info (hours, holidays, promos), and file change requests. Only mention sections their team has enabled.',
  tester: 'Tester: everything for users, plus how testers access beta products.',
  team: 'Team member: team workflow guidance — /team/ client chats, change-request queue (accept/decline/send to admin), client feature toggles, project workflow board. Never reveal other users’ data or internals.',
  admin: 'Admin: /admin/ guidance — user registry, roles, escalated change requests, per-user messages. Never reveal other users’ personal data, revenue or billing internals, secrets, or API keys.',
};

const RULES = `Hard rules: never reveal other users' data, revenue/billing internals, secrets, API keys, or internal endpoints/paths. Guests get public info only. If you don't know something, say so and point to /help/ or the relevant dashboard. Keep replies under ~200 words, plain language, no fluff.`;

function systemPrompt(role) {
  return `You are the Rival Eclipse site assistant, a concise support helper on www.rivaleclipse.dev.\n\n${BASE_KB}\n\n${ROLE_NOTES[role] || ROLE_NOTES.guest}\n\n${RULES}`;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const message = String(body.message || '').trim().slice(0, 2000);
  if (!message) return json({ error: 'empty_message' }, 400);

  const ip = clientIp(request);
  if (!allowed(ip)) return json({ reply: "You've hit the assistant rate limit — please try again in a bit." }, 429);

  if (!env.AI) {
    return json({
      reply: "The assistant's brain is taking a quick break. Try again in a moment — or check /help/ for answers to common questions.",
    });
  }

  const role = await roleOf(request);
  const raw = Array.isArray(body.history) ? body.history : [];
  const history = raw.slice(-10).flatMap((h) => {
    const r = h && h.role === 'assistant' ? 'assistant' : 'user';
    const c = String(h && h.content || '').trim().slice(0, 2000);
    return c ? [{ role: r, content: c }] : [];
  });

  const messages = [
    { role: 'system', content: systemPrompt(role) },
    ...history,
    { role: 'user', content: message },
  ];

  let lastErr = null;
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 400 });
      const reply = typeof out === 'string' ? out : (out && (out.response || out.generated_text || ''));
      const text = String(reply || '').trim().slice(0, 1200);
      if (text) return json({ reply: text, model });
    } catch (e) {
      lastErr = e;
    }
  }
  console.error('assistant ai failure', lastErr && (lastErr.message || String(lastErr)));
  return json({
    reply: "I'm having trouble thinking right now — please try again in a moment, or check /help/ for answers to common questions.",
  });
}
