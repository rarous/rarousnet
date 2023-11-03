/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env, params }) {
  const path = params.catchall;
  const blob = await env.storage.get(`files/${path}`);
  return new Response(blob.body());
}
