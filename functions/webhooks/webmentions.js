/**
 * @param {KVNamespace} weblog
 * @param {string} url
 */
async function getDetail(weblog, url) {
  const payload = await weblog.get(url, "json");
  if (payload) return payload;
  return { webmentions: [] };
}

/**
 * @param {KVNamespace} weblog
 * @param {string} url
 * @param payload
 */
async function saveDetail(weblog, url, payload) {
  return weblog.put(url, JSON.stringify(payload));
}

/**
 * @param {String} target
 */
function normalizeKey(target) {
  if (target.endsWith("/")) return target;
  if (target.endsWith(".html")) return target;
  return `${target}.html`;
}

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    console.log(body);

    const secret = env.WEBMENTIONS_WEBHOOK_SECRET;
    if (body.secret !== secret) {
      return new Response("Invalid secret", { status: 403 });
    }

    const { post, target, deleted } = body;
    const key = normalizeKey(target);
    const detail = await getDetail(env.weblog, key);
    const webmentions = new Map(detail.webmentions.map((x) => [x.url, x]));
    if (deleted) {
      webmentions.delete(post.url);
    } else {
      webmentions.set(post.url, post);
    }
    detail.webmentions = Array.from(webmentions.values());
    await saveDetail(env.weblog, key, detail);
    return new Response(null, { status: 202 });
  } catch (err) {
    console.log(err);
    return Response.error();
  }
}
