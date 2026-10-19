// TEMPORARY diagnostic — removed after debugging.
export async function onRequestGet({ env }) {
  const out = { hasAI: !!env.AI };
  if (env.AI) {
    try {
      const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: 'Say ok.' }],
        max_tokens: 10,
      });
      out.probe = 'ok';
      out.sample = String(typeof r === 'string' ? r : r.response || '').slice(0, 60);
    } catch (e) {
      out.probe = 'fail';
      out.error = String((e && e.message) || e).slice(0, 300);
    }
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
}
