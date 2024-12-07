/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env }) {
  const result = await env.w3b.get("/latest", "json");
  return Response.json(result);
}
