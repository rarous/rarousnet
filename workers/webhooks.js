/** @see https://honojs.dev/ */
import { Hono } from "hono";

const app = new Hono();

async function getDetail(weblog, url) {
  const payload = await weblog.get(url);
  if (payload) return JSON.parse(payload);
  return { webmentions: [] };
}

async function saveDetail(weblog, url, payload) {
  return weblog.put(url, JSON.stringify(payload));
}

/**
 * Client for https://webmention.io/settings/webhooks
 */
app.post("/webhooks/webmentions", async (c) => {
  try {
    const { env, req } = c;
    const body = await req.json();

    const secret = env.WEBMENTIONS_WEBHOOK_SECRET;
    if (body.secret !== secret) return c.text("Invalid secret", 403);

    const { post, target, deleted } = body;
    const detail = await getDetail(env.weblog, target);
    const webmentions = new Map(detail.webmentions.map((x) => [x.url, x]));
    if (deleted) {
      webmentions.delete(post.url);
    } else {
      webmentions.set(post.url, post);
    }
    detail.webmentions = Array.from(webmentions.values());
    await saveDetail(env.weblog, target, detail);
    return c.text("", 202);
  } catch (err) {
    console.log(err);
    return c.text("Internal error", 500);
  }
});

export default app;