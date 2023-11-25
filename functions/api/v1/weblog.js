/**
 * @typedef {import("../env.d.ts").Env} Env
 */

/**
 * @param {KVNamespace} weblog
 * @param {string} url
 */
async function getDetail(weblog, url) {
  const payload =
    (await weblog.get(url, "json")) ??
    (await weblog.get(url + ".html", "json"));
  if (payload) return payload;
  return { webmentions: [] };
}

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    const detail = await getDetail(env.weblog, target);
    detail.webmentions = detail.webmentions.filter(
      (x) => x.author.url !== "https://twitter.com/alesroubicek"
    );
    return new Response(JSON.stringify(detail));
  } catch (err) {
    console.log(err);
    return new Response("Internal error", { status: 500 });
  }
}

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  const comments = await request.json();

  const data = await env.weblog.get(target, "json");
  const upsert = Object.assign({}, data, { comments });
  await env.weblog.put(target, JSON.stringify(upsert));
  return new Response("OK");
}
