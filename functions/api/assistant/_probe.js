// TEMPORARY diagnostic — removed after debugging.
const CANDIDATES = [
  '@cf/meta/infire-llama-3.1-8b-instruct',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/mistral/mistral-7b-instruct-v0.2',
  '@cf/qwen/qwen1.5-14b-chat-awq',
];
export async function onRequestGet({ env }) {
  const out = [];
  for (const m of CANDIDATES) {
    try {
      const r = await env.AI.run(m, {
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        max_tokens: 16,
      });
      const t = String(typeof r === 'string' ? r : (r && (r.response || ''))).slice(0, 60);
      out.push({ model: m, ok: true, sample: t });
      break;
    } catch (e) {
      out.push({ model: m, ok: false, error: String((e && e.message) || e).slice(0, 200) });
    }
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
}
