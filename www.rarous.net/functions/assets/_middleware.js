/**
 * @param {EventContext<Env>} context
 */
export async function onRequest({ request, env, next }) {
  const response = await next();
  if (response.status === 404) {
    const resp = await env.ASSETS.fetch(new URL("/rev-manifest.json", request.url));
    const revManifest = await resp.json();
    const { pathname } = new URL(request.url);
    const revPath = revManifest[pathname.substring(1)];
    if (revPath) return Response.redirect(new URL(`/${revPath}`, request.url));
  }
  return response;
}
