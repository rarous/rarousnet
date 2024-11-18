/**
 * @param {KVNamespace} weblog
 * @param {string} url
 */
async function getDetail(weblog, url) {
  const payload = (await weblog.get(url, "json")) ?? (await weblog.get(url + ".html", "json"));
  return Object.assign({ webmentions: [], comments: [] }, payload);
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
    const myself = new Set([
      "https://twitter.com/alesroubicek",
      "https://x.com/alesroubicek",
      "https://indieweb.social/@alesroubicek",
    ]);
    detail.webmentions = detail.webmentions.filter(x => !myself.has(x.author.url));
    detail.comments = detail.comments.filter(x => x.isEnabled);
    return Response.json(detail);
  } catch (err) {
    console.log(err);
    return Response.error();
  }
}
