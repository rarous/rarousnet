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
export async function onRequest({ next }) {
  const response = await next();
  if (!response.headers.has("Access-Control-Allow-Origin")) response.headers.set("Access-Control-Allow-Origin", "*");
  if (!response.headers.has("Access-Control-Max-Age")) response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}
