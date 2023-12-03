/**
 * @typedef {import("../../env.d.ts").Env} Env
 */

const texyServiceEndpoint = "https://rarousnet.vercel.app/api";

async function processText(text) {
  const resp = await fetch(texyServiceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text }),
  });
  return resp.text();
}

async function getDetail(weblog, url) {
  const payload = (await weblog.get(url, "json"))
    ?? (await weblog.get(url + ".html", "json"));
  return Object.assign({ webmentions: [], comments: [] }, payload);
}

/**
 * @param {EventContext<Env>} context
 */
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    const detail = await getDetail(env.weblog, target);

    const comments = detail?.comments ?? [];
    detail.comments = comments;

    // TODO: check for content type - forms should redirect to url and read data from forms not json.
    const comment = await request.json();
    // TODO: validate comment
    // TODO: check for spam, hate etc. -> isEnabled = false;
    const text = await processText(comment.text);
    const insert = Object.assign({}, comment, { text, isEnabled: true });
    comments.push(insert);

    const upsert = Object.assign({}, detail, { comments });
    await env.weblog.put(target, JSON.stringify(upsert));
    return Response.json(insert);
  } catch (err) {
    console.error(err);
    return Response.error();
  }
}
