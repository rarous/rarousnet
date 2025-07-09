import rollbarPlugin from "@hckr_/cloudflare-pages-plugin-rollbar";

/**
 * @param {EventContext<Env>} context
 * @returns {Promise<Response>}
 */
export async function rollbar(context) {
  return rollbarPlugin({ token: context.env.ROLLBAR_TOKEN })(context);
}

function getKeyWithHtml(key, indexFile = "index.html") {
  return `${key}${key.endsWith("/") ? "" : "/"}${indexFile}`;
}

function* fallbackKey(key) {
  yield key;
  yield getKeyWithHtml(key);
  yield getKeyWithHtml(key, "default.htm");
}

async function* fallbacks(env, key) {
  for (const k of fallbackKey(key)) {
    yield await env.storage.get(key);
  }
}

/**
 * @param {EventContext<Env>} context
 */
export async function r2Fallback({ env, next, request }) {
  // Try to serve Pages content
  const resp = await next();
  if (resp.status === 200) return resp;

  // Short-circuit for API request, there is no need to search for fallback
  if (new URLPattern({ pathname: "/api/*" }).test(request.url)) return resp;

  // Fallback to R2 bucket
  const url = new URL(request.url);
  const key = url.pathname.substring(1);
  for await (const blob of fallbacks(env, key)) {
    if (!blob) continue;
    const headers = new Headers();
    blob.writeHttpMetadata(headers);
    return new Response(blob.body, { headers });
  }

  // Let Cloudflare decide what to do - most likely 404
  return resp;
}

export const onRequest = [rollbar, r2Fallback];
