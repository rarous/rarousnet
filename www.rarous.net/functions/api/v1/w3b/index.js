/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env }) {
  const data = await env.w3b.get("/latest", "json");
  const result = Object.values(data).sort((a, b) => -1 * a.entry.published.localeCompare(b.entry.published));
  return Response.json(result);
}
