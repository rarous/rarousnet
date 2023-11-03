/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const key = url.pathname.substring(1);
  const blob = await env.storage.get(key);
  if (blob === null) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(blob.body());
}
