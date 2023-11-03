/**
 * @typedef {import("../env.d.ts").Env} Env
 */

// Respond to OPTIONS method
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * @param {EventContext<Env>} context
 */
export async function onRequest({ next, request }) {
  const response = await next();
  const url = new URL(request.url);
  // Set CORS to all /api responses
  if (url.pathname.startsWith("/api")) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  return response;
}
