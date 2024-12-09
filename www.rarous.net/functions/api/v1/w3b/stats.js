/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env }) {
  const data = await env.w3b.get("/latest", "json");
  const result = Array.from(Object.values(data), ({ entry, stats }) => [stats.clicks, entry.link]).filter(([clicks]) =>
    Boolean(clicks),
  );
  return Response.json(result);
}
