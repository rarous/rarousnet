// TODO: possibly inject this thru ENV from managed vercel Project, or get rid of it and use JS implementation of Texy
const texyServiceEndpoint = "https://rarousnet.vercel.app/api/index";

async function processText(text, references) {
  const resp = await fetch(texyServiceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text, references: JSON.stringify(references) }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.text();
}

/**
 * @param {KVNamespace} weblog
 * @param {string} url
 */
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
    const now = new Date();
    const { env, request } = context;
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    const [detail, comment] = await Promise.all([
      getDetail(env.weblog, target),
      request.formData(),
    ]);
    // TODO: validate comment
    const comments = detail?.comments ?? [];
    const references = comments.filter(x => x.isEnabled).map((x, i) => [i.toString(), {
      link: `#komentar-${new Date(x.created).valueOf()}`,
      label: `#${i + 1} @${x.author.name}`,
    }]);
    const textResult = processText(comment.get("text"), references);
    const isEnabled = true; // TODO: check for spam, hate etc. -> isEnabled = false;
    const created = now.toISOString();
    const author = {
      name: comment.get("name"),
      email: comment.get("email"),
      web: comment.get("web"),
    };
    const text = await textResult;
    const insert = { author, created, text, isEnabled };
    comments.push(insert);

    const upsert = Object.assign({}, detail, { comments });
    await env.weblog.put(target, JSON.stringify(upsert));

    const lastComments = (await env.weblog.get("/weblog/comments", "json")) ?? [];
    lastComments.push(Object.assign({
      href: target + `#komentar-${now.valueOf()}`,
      article: { title: comment.get("article-title") ?? "" },
    }, insert));
    if (lastComments.length > 10) lastComments.shift();
    await env.weblog.put("/weblog/comments", JSON.stringify(lastComments));

    const accept = request.headers.get("accept");
    if (accept === "application/json") {
      return Response.json(insert);
    }
    return Response.redirect(`${target}#komentar-${now.valueOf()}`);
  } catch (err) {
    console.error(err);
    return new Response(null, { status: 500 });
  }
}
