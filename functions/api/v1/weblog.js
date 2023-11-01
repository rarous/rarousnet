/**
 * @typedef Env
 * @property {KVNamespace} weblog
 */

/**
 * @param {KVNamespace} weblog
 * @param {string} url
 */
async function getDetail(weblog, url) {
  const json = await weblog.get(url, "json");
  const text = await weblog.get(url, "text");
  const stream = await weblog.get(url, "stream");
  const arrayBuffer = await weblog.get(url, "arrayBuffer");
  console.log({ json, text, stream, arrayBuffer });

  const payload = await weblog.get(url, "text");
  if (payload) return JSON.parse(payload);
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
      (x) => x.author.url !== "https://twitter.com/alesroubicek",
    );
    return new Response(JSON.stringify(detail));
  } catch (err) {
    console.log(err);
    return new Response("Internal error", { status: 500 });
  }
}
