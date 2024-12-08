/**
 * @param {EventContext<Env>} context
 */
export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const { url, event } = Object.fromEntries(form);
  const latest = await env.w3b.get("/latest", "json");
  latest[url].stats[event] += 1;
  await env.w3b.put("/latest", JSON.stringify(latest));
  return new Response(null, { status: 202 });
}
