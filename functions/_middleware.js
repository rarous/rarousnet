function getKeyWithHtml(key) {
  return `${key}${key.endsWith("/") ? "" : "/"}index.html`;
}

/**
 * @param {EventContext<Env>} context
 */
export async function onRequest({ env, next, request }) {
  // Try to serve Pages content
  const resp = await next();
  if (resp.status === 200) return resp;

  // Fallback to R2 bucket
  const url = new URL(request.url);
  const key = url.pathname.substring(1);
  const blob = await env.storage.get(key);
  if (blob) {
    const headers = new Headers();
    blob.writeHttpMetadata(headers);
    return new Response(blob.body, { headers });
  }
  const blobHtml = await env.storage.get(getKeyWithHtml(key));
  if (blobHtml) {
    const headers = new Headers();
    blobHtml.writeHttpMetadata(headers);
    return new Response(blobHtml.body, { headers });
  }

  // Let Cloudflare decide what to do - most likely 404
  return resp;
}
