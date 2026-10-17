export async function onRequestPost({ request, env }) {
  return new Response(JSON.stringify({ ok: true, probe: 'minimal', hasAI: !!env.AI }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
