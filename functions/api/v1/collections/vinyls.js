/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env, request }) {
  const items = await env.weblog.get("/kolekce/vinyly", "json");
  return Response.json(items);
}
