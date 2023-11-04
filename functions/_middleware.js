/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {EventContext<Env>} context
 */
export async function onRequest({ env, next, request }) {
  const url = new URL(request.url);
  // Pass thru API calls and Webhooks
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/webhooks/")
  ) {
    return next();
  }
  // Try to serve Pages content
  const resp = await env.ASSETS.fetch(request);
  if (resp.status === 200) return resp;

  // Fallback to R2 bucket
  const key = url.pathname.substring(1);
  const blob = await env.storage.get(key);
  if (blob) {
    const headers = new Headers();
    blob.writeHttpMetadata(headers);
    return new Response(blob.body, { headers });
  }

  return next();

  // Return custom 404 page
  const notFound = await env.ASSETS.fetch("404.html");
  return new Response(notFound.body, {
    status: 404,
    headers: notFound.headers,
  });
}
