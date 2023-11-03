/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet({ env, params, request }) {
  const { url } = request;
  const path = params.catchall;
  console.log({ url, path, key: `files/${path}`, storage: env.storage });
  const blob = await env.storage.get(`files/${path}`);
  if (blob === null) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(blob.body());
}
